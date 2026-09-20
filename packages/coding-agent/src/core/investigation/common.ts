import { createHash } from "node:crypto";
import type { HandoffReason, Json, JsonObject, Limits } from "./types.js";

export const CANDIDATE_POLICY_VERSION = "code-investigation-v1";
export const QUESTION_VERSION = "investigate-next-action-v1";
export const RENDERING_VERSION = "atomic-decider-state-first-v1";
export const MAXIMUM_LIMITS: Readonly<Limits> = Object.freeze({
	maxActions: 5,
	maxCandidates: 32,
	maxDecisionRequests: 5,
	totalTimeoutMs: 15_000,
	decisionTimeoutMs: 2_000,
	operationTimeoutMs: 2_000,
	maxObjectiveBytes: 2 * 1024,
	maxDiagnosticBytes: 8 * 1024,
	maxSeedLocations: 8,
	maxLiteralTerms: 8,
	maxTermCharacters: 128,
	maxReadLines: 120,
	maxReadBytes: 6 * 1024,
	maxSearchMatches: 20,
	maxFileBytes: 1024 * 1024,
	maxEnumeratedEntries: 5_000,
	maxScannedBytes: 16 * 1024 * 1024,
	maxStateBytes: 32 * 1024,
	maxRequestBytes: 64 * 1024,
	maxEvidenceBytes: 24 * 1024,
	maxResponseBytes: 1024 * 1024,
});
export class Handoff extends Error {
	readonly reason: HandoffReason;
	constructor(reason: HandoffReason) {
		super(`Investigation stopped (${reason}).`);
		this.reason = reason;
	}
}
export class InvestigationToolError extends Error {
	readonly code: "invalid_input" | "permission_denied" | "audit_failed" | "busy" | "host_configuration" | "contract";
	constructor(code: InvestigationToolError["code"]) {
		super(`Investigation tool error (${code}).`);
		this.code = code;
	}
}
export function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function exactKeys(
	value: Record<string, unknown>,
	required: readonly string[],
	optional: readonly string[] = [],
): boolean {
	return (
		required.every((key) => Object.hasOwn(value, key)) &&
		Object.keys(value).every((key) => required.includes(key) || optional.includes(key))
	);
}
export function positive(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function nonnegative(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function probability(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function fourDecimal(value: unknown): value is number {
	return probability(value) && Math.abs(value * 10000 - Math.round(value * 10000)) < 1e-7;
}
export function bytes(text: string): number {
	return Buffer.byteLength(text, "utf8");
}
export function hash(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}
/** Stable serialization owns values and rejects loss, prototypes, cycles, sparse arrays and accessors. */
export function canonical(value: unknown): string {
	const active = new Set<object>();
	const visit = (item: unknown): string => {
		if (item === null || typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
		if (typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item);
		if (typeof item !== "object" || !item || active.has(item)) throw new InvestigationToolError("contract");
		if (
			!Array.isArray(item) &&
			Object.getPrototypeOf(item) !== Object.prototype &&
			Object.getPrototypeOf(item) !== null
		)
			throw new InvestigationToolError("contract");
		active.add(item);
		let out: string;
		if (Array.isArray(item)) {
			if (Object.keys(item).length !== item.length) throw new InvestigationToolError("contract");
			out = `[${item.map(visit).join(",")}]`;
		} else {
			out = `{${Object.keys(item)
				.sort()
				.map((key) => {
					const descriptor = Object.getOwnPropertyDescriptor(item, key);
					if (!descriptor || !("value" in descriptor)) throw new InvestigationToolError("contract");
					return `${JSON.stringify(key)}:${visit(descriptor.value)}`;
				})
				.join(",")}}`;
		}
		active.delete(item);
		return out;
	};
	return visit(value);
}
export function snapshot<T>(value: T): T {
	return JSON.parse(canonical(value)) as T;
}
export function freeze<T>(value: T): T {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}
export function jsonObject(value: unknown): JsonObject {
	return JSON.parse(canonical(value)) as JsonObject;
}
export function json(value: unknown): Json {
	return JSON.parse(canonical(value)) as Json;
}
/** Does not leave a detached rejection when an injected operation ignores cancellation. */
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	signal.throwIfAborted();
	let abort: (() => void) | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				abort = () => reject(signal.reason);
				signal.addEventListener("abort", abort, { once: true });
				if (signal.aborted) abort();
			}),
		]);
	} finally {
		if (abort) signal.removeEventListener("abort", abort);
	}
}
export class InvocationBudget {
	readonly started: number;
	readonly deadline: number;
	private readonly now: () => number;
	private readonly signal: AbortSignal;
	private operationDeadline = Infinity;
	constructor(now: () => number, signal: AbortSignal, timeoutMs: number, startedAt?: number) {
		this.now = now;
		this.signal = signal;
		this.started = startedAt ?? now();
		this.deadline = this.started + timeoutMs;
	}
	check(): void {
		this.signal.throwIfAborted();
		if (this.now() >= Math.min(this.deadline, this.operationDeadline)) throw new Handoff("deadline");
	}
	remaining(): number {
		this.check();
		return Math.max(1, Math.floor(this.deadline - this.now()));
	}
	elapsed(): number {
		return Math.max(0, Math.floor(this.now() - this.started));
	}
	async run<T>(cap: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
		this.check();
		const controller = new AbortController();
		const abort = () => controller.abort(this.signal.reason);
		this.signal.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(() => controller.abort(new Handoff("deadline")), Math.min(cap, this.remaining()));
		const previousDeadline = this.operationDeadline;
		this.operationDeadline = Math.min(previousDeadline, this.deadline, this.now() + cap);
		try {
			if (this.signal.aborted) abort();
			const result = await abortable(
				Promise.resolve().then(() => {
					this.check();
					controller.signal.throwIfAborted();
					return fn(controller.signal);
				}),
				controller.signal,
			);
			this.check();
			controller.signal.throwIfAborted();
			return result;
		} finally {
			this.operationDeadline = previousDeadline;
			clearTimeout(timer);
			this.signal.removeEventListener("abort", abort);
		}
	}
}
