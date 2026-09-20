/** Explicit CLI-only macOS pilot. Never imported by production registration. Run after npm run build. */
import { randomUUID } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { AuthStorage } from "../../packages/coding-agent/dist/core/auth-storage.js";
import {
	canonical,
	Handoff,
	hash,
	MAXIMUM_LIMITS,
} from "../../packages/coding-agent/dist/core/investigation/common.js";
import { investigateCode } from "../../packages/coding-agent/dist/core/investigation/controller.js";
import { deterministicBatchedRetrieval } from "../../packages/coding-agent/dist/core/investigation/deterministic-baseline.js";
import { createInvestigationDispatcher } from "../../packages/coding-agent/dist/core/investigation/guarded-dispatch.js";
import {
	createSecretScreen,
	effectivePolicy,
	excluded,
	normalizePath,
} from "../../packages/coding-agent/dist/core/investigation/policy.js";
import { inferDeciderDecision } from "../../packages/coding-agent/dist/core/structured-output/decider.js";
import {
	choiceQuestions,
	INVESTIGATION_INSTRUCTIONS,
} from "../../packages/coding-agent/dist/core/structured-output/decider-transport.js";
import { createReadTool } from "../../packages/coding-agent/dist/core/tools/read.js";
import { createSearchTool } from "../../packages/coding-agent/dist/core/tools/search.js";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "../../packages/coding-agent/dist/index.js";
import { EvaluationAccounting } from "./evaluation-only-accounting.mjs";

export const PROMPT =
	"Gather read-only repository evidence to answer the objective precisely. " +
	"If investigate_code is available, your FIRST tool call MUST be investigate_code, exactly once, with the exact supplied investigation input. Do not add terms or locations. Only after it returns may you continue using read/search if needed. " +
	"Otherwise use read/search directly. You have at most five retrieval actions and 24576 evidence bytes total. " +
	"Do not edit anything. Give a concise final answer with file and line citations; distinguish missing evidence from facts.";

/** Explicitly declared feasibility cohorts only: expose no optional candidate inflation fields. */
export function createMinimalInvestigationSchema(input) {
	return Type.Object(
		{
			objective: Type.Literal(input.objective),
			seedLocations: Type.Array(
				Type.Object({ path: Type.Literal(input.seedLocations[0].path) }, { additionalProperties: false }),
				{ minItems: 1, maxItems: 1 },
			),
		},
		{ additionalProperties: false },
	);
}

function version(path) {
	const stat = lstatSync(path, { bigint: true });
	if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Non-regular evaluation scope.");
	return { version: [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":"), size: Number(stat.size) };
}

/** Immutable evaluator-owned copies only; not Linux/openat2-equivalent and not an OS sandbox. */
export class EvaluationRepository {
	constructor(root, paths, account, trace, safe) {
		if (paths.length > MAXIMUM_LIMITS.maxEnumeratedEntries) throw new Error("Evaluation entry budget exceeded.");
		this.root = realpathSync(root);
		this.account = account;
		this.trace = trace;
		this.safe = safe;
		this.read = createReadTool(this.root);
		this.search = createSearchTool(this.root, { contextBefore: 0, contextAfter: 0 });
		const files = {};
		for (const input of paths) {
			const path = normalizePath(input);
			if (excluded(path) || realpathSync(join(this.root, path)) !== join(this.root, path))
				throw new Error("Unsafe evaluation scope.");
			files[path] = version(join(this.root, path));
			if (files[path].size > MAXIMUM_LIMITS.maxFileBytes) throw new Error("Oversized evaluation file.");
		}
		this.scope = {
			id: "evaluation",
			revision: hash(canonical(files)),
			files,
			entriesEnumerated: paths.length,
			restrictions: {
				evaluationOnly: true,
				immutableRegularFiles: true,
				accounting: "chargedBytes scan upper bound; actual bytesScanned unknown",
			},
		};
		this.scopeBytes = Object.values(files).reduce((sum, file) => sum + file.size, 0);
	}
	accounting() {
		// Controller's legacy numeric budget field receives the conservative debit only.
		// Public metrics and traces below NEVER call this an actual scan measurement.
		return { entriesEnumerated: this.scope.entriesEnumerated, bytesScanned: this.account.chargedBytes };
	}
	async prepare(signal) {
		await this.assertFresh(this.scope, signal);
		return this.scope;
	}
	async assertFresh(scope, signal) {
		signal.throwIfAborted();
		for (const [path, expected] of Object.entries(scope.files)) {
			if (
				realpathSync(join(this.root, path)) !== join(this.root, path) ||
				version(join(this.root, path)).version !== expected.version
			)
				throw new Handoff("source_changed");
		}
	}
	close() {}
	async canonicalCall(name, id, args, signal = new AbortController().signal, mark = () => {}) {
		await this.assertFresh(this.scope, signal);
		if (this.retrievalDeadline !== undefined && performance.now() >= this.retrievalDeadline)
			throw new Handoff("deadline");
		if (name === "read") {
			const match = /^([^:]+)(?::(\d+)-(\d+))?$/.exec(args.path);
			if (
				!match ||
				!Object.hasOwn(this.scope.files, match[1]) ||
				(match[2] && (Number(match[3]) < Number(match[2]) || Number(match[3]) - Number(match[2]) >= 120))
			)
				throw new Error("Read outside evaluation scope.");
		} else {
			const paths = Array.isArray(args.paths) ? args.paths : [args.paths];
			if (!paths.length || paths.some((path) => !Object.hasOwn(this.scope.files, path)))
				throw new Error("Search outside evaluation scope.");
		}
		this.account.beforeAccess(this.scopeBytes);
		mark();
		this.trace.write("retrieval-start", { name, id, args, ...this.account.metrics() });
		const tool = name === "read" ? this.read : this.search;
		const result = await tool.execute(id, args, signal);
		await this.assertFresh(this.scope, signal);
		const text = result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		if (!this.safe(text)) throw new Handoff("input_context_unsafe");
		if (Buffer.byteLength(text) > MAXIMUM_LIMITS.maxReadBytes) throw new Handoff("context_limit");
		// Bare reads and canonical neighboring context can exceed the requested range.
		if (name === "read" && [...text.matchAll(/^\d+:/gm)].length > MAXIMUM_LIMITS.maxReadLines)
			throw new Handoff("context_limit");
		if (name === "search" && (result.details?.matchCount ?? 0) > MAXIMUM_LIMITS.maxSearchMatches)
			throw new Handoff("context_limit");
		this.account.acceptEvidence(text);
		this.trace.write("retrieval-result", { name, id, text, ...this.account.metrics() });
		return { content: [{ type: "text", text }], details: result.details };
	}
	async execute(candidate, context) {
		const action = candidate.action;
		const name = action.kind === "read_range" ? "read" : "search";
		const args =
			name === "read"
				? { path: `${action.path}:${action.startLine}-${action.endLine}` }
				: { pattern: action.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), paths: Object.keys(this.scope.files) };
		return this.dispatch(
			{ toolName: name, operationId: context.operationId, parentInvocationId: context.invocationId, args },
			async () => {
				const result = await this.canonicalCall(
					name,
					context.operationId,
					args,
					context.signal,
					context.markDispatched,
				);
				const text = result.content[0].text;
				if (Buffer.byteLength(text) > context.remainingEvidenceBytes) throw new Handoff("context_limit");
				if (name === "read") {
					const lines = [...text.matchAll(/^(\d+):/gm)].map((match) => Number(match[1]));
					const endLine = lines.length ? Math.max(...lines) : action.startLine - 1;
					return {
						kind: "source_excerpt",
						text,
						path: action.path,
						startLine: action.startLine,
						endLine,
						coveredEndLine: endLine,
						bounded: true,
						omittedMatches: 0,
						omittedEvidenceBytes: 0,
						sources: [],
					};
				}
				let path = "";
				const matches = [];
				for (const line of text.split("\n")) {
					const header = /^\[([^\]#]+)#[0-9A-F]{4}\]$/.exec(line);
					if (header) path = header[1];
					const match = /^\*(\d+):(.*)$/.exec(line);
					if (match && Object.hasOwn(this.scope.files, path))
						matches.push({ path, line: Number(match[1]), text: match[2], clipped: false });
				}
				return {
					kind: "search_matches",
					text,
					matches,
					bounded: true,
					scopeFullyScanned: false,
					omittedMatches: null,
					omittedEvidenceBytes: 0,
					sources: [],
				};
			},
			context.signal,
		);
	}
}

async function main() {
	if (process.platform !== "darwin" || process.argv[2] !== "--evaluation-only")
		throw new Error("Explicit macOS evaluation invocation required.");
	const config = JSON.parse(readFileSync(process.argv[3], "utf8"));
	const request = JSON.parse(readFileSync(0, "utf8"));
	const runDir = join(config.outputRoot, `${request.id}-${request.arm}-${randomUUID()}`);
	mkdirSync(runDir, { recursive: true, mode: 0o700 });
	const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
	const token = process.env.ATOMIC_DECIDER_SERVICE_TOKEN ?? "";
	const auth = JSON.parse(readFileSync(config.authPath, "utf8"));
	const safe = createSecretScreen([
		token,
		...Object.values(auth).flatMap((value) =>
			Object.values(value).filter((item) => typeof item === "string" && item.length >= 12),
		),
	]);
	const traceRef = join(runDir, "trace.jsonl");
	writeFileSync(traceRef, "", { mode: 0o600 });
	const started = performance.now();
	const trace = {
		id: traceRef,
		write(event, data) {
			if (data.budgets && Object.hasOwn(data.budgets, "bytesScanned")) {
				data = {
					...data,
					budgets: { ...data.budgets, chargedBytes: data.budgets.bytesScanned, bytesScanned: null },
				};
			}
			const text = JSON.stringify({ event, elapsedMs: performance.now() - started, ...data });
			if (!safe(text)) throw new Error("Unsafe trace.");
			appendFileSync(traceRef, `${text}\n`);
		},
	};
	const account = new EvaluationAccounting(request.budgets);
	const workspace = join(runDir, "workspace");
	for (const input of config.scopePaths) {
		const path = normalizePath(input);
		const source = join(realpathSync(request.repositoryRoot), path);
		if (excluded(path) || realpathSync(source) !== source || !lstatSync(source).isFile())
			throw new Error("Unsafe snapshot source.");
		const content = readFileSync(source);
		if (hash(content.toString("utf8")) !== config.scopeHashes[path] || !safe(content.toString("utf8")))
			throw new Error("Snapshot identity mismatch.");
		mkdirSync(dirname(join(workspace, path)), { recursive: true, mode: 0o700 });
		writeFileSync(join(workspace, path), content, { mode: 0o400 });
	}
	request.repositoryRoot = workspace;
	const repository = new EvaluationRepository(workspace, config.scopePaths, account, trace, safe);
	const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
	const agentDir = join(runDir, "agent");
	const modelRuntime = await ModelRuntime.create({
		credentials: AuthStorage.inMemory(auth),
		modelsPath: config.modelsPath,
		modelsStorePath: join(runDir, "models-store.json"),
		allowModelNetwork: false,
	});
	const model = modelRuntime.getModel(config.provider, config.model);
	if (!model) throw new Error("Pinned main model unavailable.");
	let session;
	let once = false;
	let handoff = false;
	let llmTurns = 0;
	let investigationMs = 0;
	const hooks = (pi) => {
		pi.on("tool_call", (event) => {
			repository.retrievalDeadline ??= performance.now() + request.budgets.investigationTimeoutMs;
			trace.write("tool-call-hook", { name: event.toolName, id: event.toolCallId, input: event.input });
		});
		pi.on("tool_result", (event) => {
			trace.write("tool-result-hook", { name: event.toolName, id: event.toolCallId, isError: event.isError });
		});
	};
	const resourceLoader = new DefaultResourceLoader({
		cwd: request.repositoryRoot,
		agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		extensionFactories: [hooks],
	});
	await resourceLoader.reload();
	const customTools = [repository.read, repository.search].map((tool) => ({
		...tool,
		execute: (id, args, signal) => repository.canonicalCall(tool.name, id, args, signal),
	}));
	const policy = effectivePolicy({ profile: config.profile, scopePaths: config.scopePaths }, () => {}, safe);
	if (request.arm !== "A")
		customTools.push({
			name: "investigate_code",
			label: "Investigate code (evaluation only)",
			description: "Gather bounded source evidence using internal read/search operations, then return control.",
			parameters: config.minimalInputSchema
				? createMinimalInvestigationSchema(request.input)
				: Type.Object({
						objective: Type.String(),
						diagnosticText: Type.Optional(Type.String()),
						seedLocations: Type.Optional(
							Type.Array(Type.Object({ path: Type.String(), line: Type.Optional(Type.Integer()) })),
						),
						literalTerms: Type.Optional(Type.Array(Type.String())),
					}),
			async execute(id, input, signal) {
				if (once) throw new Error("One investigation per evaluation task.");
				once = true;
				repository.dispatch = createInvestigationDispatcher(session, () => {});
				const deps = {
					invocationId: id,
					policy,
					repository,
					trace,
					now: () => performance.now(),
					decide: async (step, childSignal) => {
						const ids = [...step.candidates.map((candidate) => candidate.id), "handoff"];
						const result = await inferDeciderDecision(
							{
								state: step.state,
								schema: Type.Object({ actionId: Type.Union(ids.map((value) => Type.Literal(value))) }),
								instructions: INVESTIGATION_INSTRUCTIONS,
								signal: childSignal,
								jev: {
									questions: choiceQuestions(step.candidates),
									decode: (choices) => ({ actionId: choices.next }),
								},
							},
							{ endpoint: config.endpoint, token, profile: policy.profile, limits: policy.limits, isSafe: safe },
							step.candidateSetHash,
						);
						return { value: result.value, evidence: result.evidence, usage: result.usage };
					},
				};
				const result = await (request.arm === "B"
					? deterministicBatchedRetrieval(input, deps, signal)
					: investigateCode(input, deps, signal));
				handoff = true;
				trace.write("investigation-return", { reason: result.reason, counters: result.counters });
				return { content: [{ type: "text", text: canonical(result) }], details: result };
			},
		});
	let status = "completed";
	try {
		({ session } = await createAgentSession({
			cwd: request.repositoryRoot,
			agentDir,
			settingsManager,
			modelRuntime,
			model,
			thinkingLevel: config.thinkingLevel,
			fallbackModels: [],
			resourceLoader,
			sessionManager: SessionManager.inMemory(request.repositoryRoot),
			tools: customTools.map((tool) => tool.name),
			customTools,
			builtins: { workflows: false, subagents: false, mcp: false, intercom: false, "web-access": false },
			systemPromptTransform: () => PROMPT,
		}));
		trace.write("start", {
			sourceRoot,
			sourceCommit: config.sourceCommit,
			model: `${model.provider}/${model.id}`,
			thinkingLevel: session.thinkingLevel,
			promptVersion: hash(PROMPT),
			arm: request.arm,
			serviceState: request.serviceState,
			scope: repository.scope,
			measurementLimitation:
				"chargedBytes is a full-scope access debit; native bytesScanned is unknown; controller budget bytesScanned uses this debit, not telemetry",
		});
		session.subscribe((event) => {
			if (event.type === "turn_start") {
				llmTurns++;
				trace.write("main-model-turn", { llmTurns });
			}
			if (event.type === "tool_execution_end") investigationMs = performance.now() - started;
		});
		await session.prompt(
			`${PROMPT}\nAllowed files: ${JSON.stringify(config.scopePaths)}\nInvestigation input: ${JSON.stringify(request.input)}`,
		);
		const answers = session.messages
			.filter((message) => message.role === "assistant")
			.map((message) => ({
				stopReason: message.stopReason,
				text: message.content
					.filter((part) => part.type === "text")
					.map((part) => part.text)
					.join("\n"),
			}));
		trace.write("answers", { answers });
		if (answers.at(-1)?.stopReason === "error" || answers.at(-1)?.stopReason === "aborted") status = "error";
	} catch {
		status = "error";
		trace.write("error", { reason: "evaluation_task_failed" });
	} finally {
		await session?.dispose();
	}
	const result = {
		status,
		measurementKind: "live",
		verifiedSuccess: null,
		evidenceUseful: null,
		investigationMs,
		totalTaskMs: performance.now() - started,
		llmTurns,
		...account.metrics(),
		handoff,
		traceRef,
		serviceState: request.arm === "C" ? request.serviceState : "not_applicable",
	};
	trace.write("metrics", result);
	process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(() => {
		process.stderr.write("Evaluation initialization failed; no private exception text retained.\n");
		process.exitCode = 1;
	});
}
