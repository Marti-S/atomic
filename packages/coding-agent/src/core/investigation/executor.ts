import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { canonical, freeze, Handoff, InvestigationToolError, jsonObject, record } from "./common.js";
import { REPOSITORY_WORKER } from "./repository-worker.js";
import type {
	ActionCandidate,
	DispatchContext,
	EffectivePolicy,
	JsonObject,
	OperationObservation,
	RepositoryFacade,
	ScopeSnapshot,
	TraceSink,
} from "./types.js";

export interface CanonicalRepositoryCall {
	toolName: "read" | "search";
	operationId: string;
	parentInvocationId: string;
	args: { path: string } | { pattern: string; paths: string[]; i: false; gitignore: false };
}
export type GuardedRepositoryDispatcher = (
	call: CanonicalRepositoryCall,
	execute: () => Promise<OperationObservation>,
	signal: AbortSignal,
) => Promise<OperationObservation>;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
/** No PATH lookup, shell, inherited provider credentials, user site packages, or repo Python imports. */
const helperEnvironment = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" });
export function supportsRepositoryAccessor(pythonPath = "/usr/bin/python3"): boolean {
	if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch) || !isAbsolute(pythonPath))
		return false;
	const probe = spawnSync(pythonPath, ["-I", "-u", "-c", REPOSITORY_WORKER], {
		shell: false,
		env: helperEnvironment,
		input: '{"id":1,"command":"probe"}\n',
		encoding: "utf8",
		timeout: 2000,
		maxBuffer: 1024,
		windowsHide: true,
	});
	if (probe.error || probe.status !== 0) return false;
	try {
		const result = JSON.parse(probe.stdout);
		return result.type === "result" && result.result?.supported === true;
	} catch {
		return false;
	}
}
export function canonicalRepositoryCall(
	candidate: ActionCandidate,
	scope: ScopeSnapshot,
	context: DispatchContext,
): CanonicalRepositoryCall {
	return freeze({
		toolName: candidate.action.kind === "read_range" ? "read" : "search",
		operationId: context.operationId,
		parentInvocationId: context.invocationId,
		args:
			candidate.action.kind === "read_range"
				? { path: `${candidate.action.path}:${candidate.action.startLine}-${candidate.action.endLine}` }
				: {
						pattern: candidate.action.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
						paths: Object.keys(scope.files).sort(),
						i: false,
						gitignore: false,
					},
	});
}
export class LinuxRepositoryFacade implements RepositoryFacade {
	private readonly root: string;
	private readonly policy: EffectivePolicy;
	private readonly dispatch: GuardedRepositoryDispatcher;
	private readonly trace: TraceSink;
	private readonly pythonPath: string;
	private child?: ChildProcessWithoutNullStreams;
	private scope?: ScopeSnapshot;
	private closed = false;
	private nextId = 0;
	private buffer = "";
	private scannedBytes = 0;
	private entriesEnumerated = 0;
	private pending?: { id: number; resolve(value: unknown): void; reject(error: Error): void; operationId?: string };
	constructor(options: {
		root: string;
		policy: EffectivePolicy;
		dispatch: GuardedRepositoryDispatcher;
		trace: TraceSink;
		pythonPath?: string;
	}) {
		this.root = options.root;
		this.policy = options.policy;
		this.dispatch = options.dispatch;
		this.trace = options.trace;
		this.pythonPath = options.pythonPath ?? "/usr/bin/python3";
	}
	private start(): void {
		if (this.child) return;
		if (this.closed || process.platform !== "linux" || !isAbsolute(this.pythonPath))
			throw new InvestigationToolError("host_configuration");
		const child = spawn(this.pythonPath, ["-I", "-u", "-c", REPOSITORY_WORKER], {
			shell: false,
			env: helperEnvironment,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		this.child = child;
		child.stderr.resume(); // Deliberately discard interpreter diagnostics; they may echo source/paths.
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			try {
				this.buffer += chunk;
				if (Buffer.byteLength(this.buffer, "utf8") > MAX_FRAME_BYTES) throw new Handoff("context_limit");
				for (;;) {
					const newline = this.buffer.indexOf("\n");
					if (newline < 0) break;
					const line = this.buffer.slice(0, newline);
					this.buffer = this.buffer.slice(newline + 1);
					this.receive(JSON.parse(line));
				}
			} catch (error) {
				this.fail(
					error instanceof InvestigationToolError || error instanceof Handoff
						? error
						: new InvestigationToolError("contract"),
				);
			}
		});
		child.once("error", () => this.fail(new InvestigationToolError("host_configuration")));
		child.once("exit", () => {
			if (!this.closed) this.fail(new Handoff("operation_failed"));
		});
		child.stdin.on("error", () => this.fail(new Handoff("operation_failed")));
	}
	private receive(message: unknown): void {
		if (!record(message) || !this.pending) throw new InvestigationToolError("contract");
		if (message.type === "metadata-meter") {
			if (
				this.scope ||
				typeof message.entriesEnumerated !== "number" ||
				!Number.isSafeInteger(message.entriesEnumerated) ||
				message.entriesEnumerated < this.entriesEnumerated ||
				message.entriesEnumerated > this.policy.limits.maxEnumeratedEntries
			)
				throw new InvestigationToolError("contract");
			this.entriesEnumerated = message.entriesEnumerated;
			try {
				this.trace.write("metadata-enumeration", { entriesEnumerated: this.entriesEnumerated });
			} catch {
				throw new InvestigationToolError("audit_failed");
			}
			return;
		}
		if (message.type === "meter") {
			if (
				message.operationId !== this.pending.operationId ||
				typeof message.path !== "string" ||
				!this.scope?.files[message.path] ||
				this.scope.files[message.path].version !== message.version ||
				typeof message.bytes !== "number" ||
				!Number.isSafeInteger(message.bytes) ||
				message.bytes <= 0 ||
				message.totalScannedBytes !== this.scannedBytes + message.bytes ||
				message.totalScannedBytes > this.policy.limits.maxScannedBytes
			)
				throw new InvestigationToolError("contract");
			this.scannedBytes = message.totalScannedBytes;
			if (!this.policy.isSafe(message.path)) throw new Handoff("input_context_unsafe");
			try {
				this.trace.write("content-access", message as JsonObject);
			} catch {
				throw new InvestigationToolError("audit_failed");
			}
			return;
		}
		if (message.id !== this.pending.id) throw new InvestigationToolError("contract");
		if (message.type !== "result" && message.type !== "error") throw new InvestigationToolError("contract");
		const pending = this.pending;
		this.pending = undefined;
		if (message.type === "result") pending.resolve(message.result);
		else if (message.type === "error") {
			const reason = message.code;
			if (reason === "permission_denied") pending.reject(new InvestigationToolError("permission_denied"));
			else if (reason === "unsupported_platform") pending.reject(new InvestigationToolError("host_configuration"));
			else
				pending.reject(
					new Handoff(reason === "source_changed" || reason === "context_limit" ? reason : "operation_failed"),
				);
		} else throw new InvestigationToolError("contract");
	}
	private fail(error: Error): void {
		const pending = this.pending;
		this.pending = undefined;
		this.close();
		pending?.reject(error);
	}
	private async send(request: JsonObject, signal: AbortSignal, operationId?: string): Promise<unknown> {
		signal.throwIfAborted();
		this.policy.assertCurrent();
		if (this.closed || this.pending) throw new InvestigationToolError("contract");
		this.start();
		const id = ++this.nextId;
		const data = canonical({ id, ...request });
		if (Buffer.byteLength(data, "utf8") > 65535) throw new Handoff("context_limit");
		let abort: (() => void) | undefined;
		try {
			return await new Promise<unknown>((resolve, reject) => {
				this.pending = { id, resolve, reject, ...(operationId ? { operationId } : {}) };
				abort = () => {
					const pending = this.pending;
					this.pending = undefined;
					this.close();
					pending?.reject(signal.reason);
				};
				signal.addEventListener("abort", abort, { once: true });
				if (signal.aborted) {
					abort();
					return;
				}
				this.child?.stdin.write(`${data}\n`);
			});
		} finally {
			if (abort) signal.removeEventListener("abort", abort);
		}
	}
	async prepare(signal: AbortSignal): Promise<ScopeSnapshot> {
		if (this.scope) throw new InvestigationToolError("contract");
		const scope = await this.send(
			{
				command: "init",
				root: this.root,
				scopePaths: [...this.policy.scopePaths],
				excludedPaths: [...this.policy.excludedPaths],
				limits: { ...this.policy.limits },
				generation: this.policy.generation,
			},
			signal,
		);
		if (
			!record(scope) ||
			typeof scope.id !== "string" ||
			typeof scope.revision !== "string" ||
			!record(scope.files) ||
			!record(scope.restrictions) ||
			typeof scope.entriesEnumerated !== "number" ||
			scope.entriesEnumerated > this.policy.limits.maxEnumeratedEntries
		)
			throw new InvestigationToolError("contract");
		this.entriesEnumerated = scope.entriesEnumerated;
		this.scope = freeze(scope as unknown as ScopeSnapshot);
		return this.scope;
	}
	async assertFresh(scope: ScopeSnapshot, signal: AbortSignal): Promise<void> {
		if (scope !== this.scope) throw new Handoff("source_changed");
		await this.send({ command: "check" }, signal);
	}
	async execute(candidate: ActionCandidate, context: DispatchContext): Promise<OperationObservation> {
		context.signal.throwIfAborted();
		this.policy.assertCurrent();
		const scope = this.scope;
		if (!scope || candidate.scopeRevision !== scope.revision) throw new Handoff("source_changed");
		const call = canonicalRepositoryCall(candidate, scope, context);
		if (!this.policy.isSafe(canonical(call))) throw new Handoff("input_context_unsafe");
		try {
			this.trace.write("guarded-call", jsonObject(call));
		} catch {
			throw new InvestigationToolError("audit_failed");
		}
		context.signal.throwIfAborted();
		this.policy.assertCurrent();
		return this.dispatch(
			call,
			async () => {
				context.signal.throwIfAborted();
				this.policy.assertCurrent();
				// Hook waits can race with mutations; revalidate before the audited content boundary.
				await this.assertFresh(scope, context.signal);
				context.signal.throwIfAborted();
				this.policy.assertCurrent();
				context.markDispatched();
				const result = (await this.send(
					{
						command: "execute",
						action: { ...candidate.action },
						operationId: context.operationId,
						remainingEvidenceBytes: context.remainingEvidenceBytes,
					},
					context.signal,
					context.operationId,
				)) as OperationObservation;
				if (!this.policy.isSafe(canonical(result))) throw new Handoff("input_context_unsafe");
				return result;
			},
			context.signal,
		);
	}
	accounting(): { entriesEnumerated: number; bytesScanned: number } {
		return { entriesEnumerated: this.entriesEnumerated, bytesScanned: this.scannedBytes };
	}
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.child?.stdin.destroy();
		this.child?.stdout.destroy();
		this.child?.stderr.destroy();
		this.child?.kill("SIGKILL");
		this.child?.unref();
		const pending = this.pending;
		this.pending = undefined;
		pending?.reject(new Handoff("operation_failed"));
	}
}
