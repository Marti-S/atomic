/** Decider investigation v1. This module has no UI or provider dependencies. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface InvestigateCodeInput {
	objective: string;
	diagnosticText?: string;
	seedLocations?: Array<{ path: string; line?: number }>;
	literalTerms?: string[];
}
export type RepositoryAction =
	| { kind: "read_range"; path: string; startLine: number; endLine: number }
	| { kind: "search_literal"; term: string; scopeId: string };
export interface ActionCandidate {
	readonly id: string;
	readonly action: RepositoryAction;
	readonly description: string;
	readonly provenance: {
		readonly source: "input" | "diagnostic" | "search_match" | "observed_reference";
		readonly evidenceId?: string;
	};
	readonly scopeRevision: string;
}
export type HandoffReason =
	| "decider_handoff" | "uncertain" | "no_candidates" | "action_limit" | "deadline"
	| "no_progress" | "candidate_overflow" | "context_limit" | "source_changed"
	| "provider_unavailable" | "decision_invalid" | "model_mismatch"
	| "input_context_unsafe" | "operation_failed";
export interface Evidence {
	id: string;
	kind: "source_excerpt" | "search_matches";
	path?: string;
	startLine?: number;
	endLine?: number;
	text: string;
	contentHash: string;
	actionId: string;
	bounded: boolean;
}
export interface InvestigationResult {
	schemaVersion: 1;
	invocationId: string;
	taskComplete: false;
	outcome: "handoff";
	reason: HandoffReason;
	evidence: Evidence[];
	remainingCandidates: number;
	omitted: { candidates: number; matches: number | null; evidenceBytes: number };
	counters: { actionsDispatched: number; decisionRequests: number; inputTokens: number; outputTokens: number; elapsedMs: number };
	traceId: string;
}
export interface ChoiceEvidence {
	selectedId: string;
	rawProbabilities: Record<string, number>;
	probabilities: Record<string, number>;
	topProbability: number;
	topTwoMargin: number;
	providerConfidence?: number;
	providerCertainty?: number;
	normalization: "none" | "decider-four-decimal";
	backendId: string;
	deploymentFingerprint: string;
	questionVersion: string;
	candidateSetHash: string;
}
export interface Limits {
	maxActions: number;
	maxCandidates: number;
	maxDecisionRequests: number;
	totalTimeoutMs: number;
	decisionTimeoutMs: number;
	operationTimeoutMs: number;
	maxObjectiveBytes: number;
	maxDiagnosticBytes: number;
	maxSeedLocations: number;
	maxLiteralTerms: number;
	maxTermCharacters: number;
	maxReadLines: number;
	maxReadBytes: number;
	maxSearchMatches: number;
	maxFileBytes: number;
	maxEnumeratedEntries: number;
	maxScannedBytes: number;
	maxStateBytes: number;
	maxRequestBytes: number;
	maxEvidenceBytes: number;
	maxResponseBytes: number;
}
export interface AdmissionProfile {
	id: string;
	/** Explicit approval by the host, not by tool arguments or repository settings. */
	approved: true;
	minTopProbability: number;
	minTopTwoMargin: number;
	backendId: string;
	deploymentFingerprint: string;
	weightsRevision: string;
	tokenizerRevision: string;
	configHash: string;
	temperature: number;
	renderingVersion: string;
	questionVersion: string;
	candidatePolicyVersion: string;
	precision: "decider-four-decimal";
	/** Reference to held-out evaluation; a fixture reference is explicitly non-production. */
	evaluationId: string;
}
export interface EffectivePolicy {
	readonly generation: string;
	readonly profile: Readonly<AdmissionProfile>;
	readonly limits: Readonly<Limits>;
	readonly scopePaths: readonly string[];
	readonly excludedPaths: readonly string[];
	/** A synchronous live host check. May deny, but can never broaden this snapshot. */
	assertCurrent(): void;
	/** Must return false on configured secrets. Never return a redacted approximation. */
	isSafe(text: string): boolean;
}
export interface FileVersion {
	/** dev/inode/size/mtime_ns/ctime_ns, obtained from the opened object. */
	version: string;
	size: number;
}
export interface ScopeSnapshot {
	readonly id: string;
	readonly revision: string;
	readonly files: Readonly<Record<string, FileVersion>>;
	readonly entriesEnumerated: number;
	readonly restrictions: JsonObject;
}
export interface SearchMatch { path: string; line: number; text: string; clipped: boolean }
export interface SourceIdentity { path: string; version: string; contentHash: string; bytesRead: number }
export interface OperationObservation {
	kind: Evidence["kind"];
	text: string;
	path?: string;
	startLine?: number;
	endLine?: number;
	coveredEndLine?: number;
	bounded: boolean;
	matches?: SearchMatch[];
	scopeFullyScanned?: boolean;
	omittedMatches: number | null;
	omittedEvidenceBytes: number;
	sources: SourceIdentity[];
}
export interface DispatchContext {
	invocationId: string;
	operationId: string;
	signal: AbortSignal;
	remainingEvidenceBytes: number;
	/** Called exactly once, after permissions/hooks/audit, immediately before content access. */
	markDispatched(): void;
}
export interface RepositoryFacade {
	accounting(): { entriesEnumerated: number; bytesScanned: number };
	prepare(signal: AbortSignal): Promise<ScopeSnapshot>;
	assertFresh(scope: ScopeSnapshot, signal: AbortSignal): Promise<void>;
	execute(candidate: ActionCandidate, context: DispatchContext): Promise<OperationObservation>;
	close(): void;
}
export interface DecisionStep {
	state: JsonObject;
	candidates: readonly ActionCandidate[];
	candidateSetHash: string;
	stateHash: string;
}
export interface DecisionSelection {
	value: { actionId: string };
	evidence: ChoiceEvidence;
	usage: { inputTokens: number; outputTokens: number };
}
export type DecisionClient = (step: DecisionStep, signal: AbortSignal) => Promise<DecisionSelection>;
export interface TraceSink {
	readonly id: string;
	/** Synchronous, durable and fail-closed. Must not retain unscreened source or exception text. */
	write(event: string, data: JsonObject): void;
}
export interface InvestigationDependencies {
	/** Host invocation start, including configuration and trace preparation. */
	startedAt?: number;
	invocationId: string;
	policy: EffectivePolicy;
	repository: RepositoryFacade;
	decide: DecisionClient;
	now(): number;
	trace: TraceSink;
}
