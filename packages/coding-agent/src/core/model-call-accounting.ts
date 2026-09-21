import { AsyncLocalStorage } from "node:async_hooks";

export type ModelCallPurpose = "main" | "routing" | "subagent" | "compaction" | "summary" | "unclassified";
export type ModelCallMethod = "stream" | "streamSimple" | "fetchDeferred";
export interface ModelCallRecord {
	sequence: number;
	purpose: ModelCallPurpose;
	method: ModelCallMethod;
}
export interface ModelCallCounts {
	/** Dispatches into provider SDKs, not HTTP attempts or successful completions. */
	generativeRequests: number;
	byPurpose: Record<ModelCallPurpose, number>;
	deferredFetches: number;
	/** Provider-internal retries and WebSocket reconnects are not observed at this boundary. */
	providerNetworkAttempts: null;
	observerErrors: number;
}
interface AccountingScope {
	ledger: ModelCallLedger;
	purpose: ModelCallPurpose;
}
const scopes = new AsyncLocalStorage<AccountingScope>();

/** Opt-in, task-local accounting. Never retains prompts, outputs, credentials or model configuration. */
export class ModelCallLedger {
	private readonly counts: ModelCallCounts = {
		generativeRequests: 0,
		byPurpose: { main: 0, routing: 0, subagent: 0, compaction: 0, summary: 0, unclassified: 0 },
		deferredFetches: 0,
		providerNetworkAttempts: null,
		observerErrors: 0,
	};
	private sequence = 0;
	private closed = false;
	private readonly observe?: (record: Readonly<ModelCallRecord>) => void;
	constructor(observe?: (record: Readonly<ModelCallRecord>) => void) {
		this.observe = observe;
	}
	run<T>(fn: () => T, purpose: ModelCallPurpose = "unclassified"): T {
		if (this.closed) throw new Error("Model call ledger is closed.");
		return scopes.run({ ledger: this, purpose }, fn);
	}
	/** Internal dispatch boundary; recording a failed dispatch does not imply task success. */
	record(purpose: ModelCallPurpose, method: ModelCallMethod): void {
		if (this.closed) return;
		if (method === "fetchDeferred") this.counts.deferredFetches++;
		else {
			this.counts.generativeRequests++;
			this.counts.byPurpose[purpose]++;
		}
		try {
			this.observe?.(Object.freeze({ sequence: ++this.sequence, purpose, method }));
		} catch {
			// Telemetry cannot break inference. Evaluators must reject an incomplete observer trace.
			this.counts.observerErrors++;
		}
	}
	snapshot(): ModelCallCounts {
		return { ...this.counts, byPurpose: { ...this.counts.byPurpose } };
	}
	close(): ModelCallCounts {
		this.closed = true;
		return this.snapshot();
	}
}

/** Nest a known purpose without replacing the task's ledger. Unknown callers remain unclassified. */
export function withModelCallPurpose<T>(purpose: ModelCallPurpose, fn: () => T): T {
	const scope = scopes.getStore();
	return scope ? scopes.run({ ...scope, purpose }, fn) : fn();
}

/**
 * Capture at stream construction, record only at provider dispatch after authentication.
 * Lazy streams consumed in another async context remain attributed to their originating task.
 * No stream wrapping, extra result() call, retries, global fetch patch or exception rewriting.
 */
export function captureModelCall(method: ModelCallMethod): () => void {
	const scope = scopes.getStore();
	return () => scope?.ledger.record(scope.purpose, method);
}
