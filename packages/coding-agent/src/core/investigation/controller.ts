import { CandidateBuilder } from "./candidates.js";
import { bytes, canonical, exactKeys, fourDecimal, freeze, hash, Handoff, InvocationBudget, InvestigationToolError, jsonObject, nonnegative, probability, record } from "./common.js";
import { parseInput } from "./policy.js";
import type { ActionCandidate, ChoiceEvidence, DecisionSelection, Evidence, InvestigationDependencies, InvestigationResult, OperationObservation, ScopeSnapshot } from "./types.js";

/** Defense in depth: even an injected decision client cannot authorize arguments or invent usage. */
export function validateSelection(selection: DecisionSelection, candidates: readonly ActionCandidate[], deps: InvestigationDependencies, candidateSetHash: string): ChoiceEvidence {
	const ids = [...candidates.map((candidate) => candidate.id), "handoff"];
	if (!record(selection) || !record(selection.value) || !exactKeys(selection.value, ["actionId"]) || typeof selection.value.actionId !== "string" || !ids.includes(selection.value.actionId) || !record(selection.usage) || !exactKeys(selection.usage, ["inputTokens", "outputTokens"]) || !nonnegative(selection.usage.inputTokens) || !nonnegative(selection.usage.outputTokens)) throw new Handoff("decision_invalid");
	const evidence = selection.evidence;
	if (!record(evidence) || evidence.selectedId !== selection.value.actionId || !record(evidence.rawProbabilities) || !record(evidence.probabilities) || !exactKeys(evidence.rawProbabilities, ids) || !exactKeys(evidence.probabilities, ids)) throw new Handoff("decision_invalid");
	if (evidence.backendId !== deps.policy.profile.backendId || evidence.deploymentFingerprint !== deps.policy.profile.deploymentFingerprint || evidence.questionVersion !== deps.policy.profile.questionVersion) throw new Handoff("model_mismatch");
	if (evidence.candidateSetHash !== candidateSetHash || evidence.normalization !== "decider-four-decimal") throw new Handoff("decision_invalid");
	const raw = ids.map((id) => evidence.rawProbabilities[id]);
	if (!raw.every(fourDecimal)) throw new Handoff("decision_invalid");
	const sum = raw.reduce((total, value) => total + value, 0);
	if (sum <= 0 || Math.abs(sum - 1) > ids.length * 0.00005 + 0.000001) throw new Handoff("decision_invalid");
	for (const id of ids) if (!probability(evidence.probabilities[id]) || Math.abs(evidence.probabilities[id] - evidence.rawProbabilities[id] / sum) > 1e-12) throw new Handoff("decision_invalid");
	const sorted = Object.values(evidence.probabilities).sort((a, b) => b - a);
	if (evidence.probabilities[evidence.selectedId] !== sorted[0] || evidence.topProbability !== sorted[0] || Math.abs(evidence.topTwoMargin - (sorted[0] - sorted[1])) > 1e-12) throw new Handoff("decision_invalid");
	if ((evidence.providerConfidence !== undefined && (!probability(evidence.providerConfidence) || evidence.providerConfidence !== evidence.rawProbabilities[evidence.selectedId])) || (evidence.providerCertainty !== undefined && !probability(evidence.providerCertainty))) throw new Handoff("decision_invalid");
	return evidence;
}
export function validateObservation(observation: OperationObservation, candidate: ActionCandidate, scope: ScopeSnapshot, remainingBytes: number): void {
	if (!record(observation) || typeof observation.text !== "string" || bytes(observation.text) > remainingBytes || typeof observation.bounded !== "boolean" || !Array.isArray(observation.sources) || !nonnegative(observation.omittedEvidenceBytes) || (observation.omittedMatches !== null && !nonnegative(observation.omittedMatches))) throw new InvestigationToolError("contract");
	for (const source of observation.sources) if (!Object.hasOwn(scope.files, source.path) || source.version !== scope.files[source.path].version || !/^[a-f0-9]{64}$/.test(source.contentHash) || !nonnegative(source.bytesRead)) throw new Handoff("source_changed");
	if (candidate.action.kind === "read_range") {
		if (observation.kind !== "source_excerpt" || observation.path !== candidate.action.path || observation.startLine !== candidate.action.startLine || typeof observation.endLine !== "number" || observation.endLine > candidate.action.endLine || observation.endLine < observation.startLine - 1 || !Number.isSafeInteger(observation.endLine)) throw new InvestigationToolError("contract");
	} else {
		if (observation.kind !== "search_matches" || !Array.isArray(observation.matches) || typeof observation.scopeFullyScanned !== "boolean" || (!observation.scopeFullyScanned && observation.omittedMatches !== null)) throw new InvestigationToolError("contract");
		for (const match of observation.matches) if (!Object.hasOwn(scope.files, match.path) || !Number.isSafeInteger(match.line) || match.line <= 0 || typeof match.text !== "string" || typeof match.clipped !== "boolean") throw new InvestigationToolError("contract");
	}
}
export async function investigateCode(rawInput: unknown, deps: InvestigationDependencies, signal: AbortSignal = new AbortController().signal): Promise<InvestigationResult> {
	const budget = new InvocationBudget(deps.now, signal, deps.policy.limits.totalTimeoutMs, deps.startedAt);
	const limits = deps.policy.limits;
	const evidence: Evidence[] = [];
	let evidenceBytes = 0;
	let candidates: readonly ActionCandidate[] = [];
	let noProgress = 0;
	const counters = { actionsDispatched: 0, decisionRequests: 0, inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
	const omitted = { candidates: 0, matches: 0 as number | null, evidenceBytes: 0 };
	const history: Record<string, { actionId: string; kind: string; evidenceId: string | null; newEvidence: boolean }> = Object.create(null);
	const audit = (event: string, data: object) => {
		try { deps.trace.write(event, jsonObject({ invocationId: deps.invocationId, elapsedMs: budget.elapsed(), ...data })); }
		catch { throw new InvestigationToolError("audit_failed"); }
	};
	const active = () => { budget.check(); deps.policy.assertCurrent(); };
	const finish = (reason: InvestigationResult["reason"]): InvestigationResult => {
		// Cancellation is never converted into a normal handoff, including late provider replies.
		signal.throwIfAborted();
		counters.elapsedMs = budget.elapsed();
		const result: InvestigationResult = { schemaVersion: 1, invocationId: deps.invocationId, taskComplete: false, outcome: "handoff", reason, evidence, remainingCandidates: candidates.length, omitted, counters, traceId: deps.trace.id };
		audit("handoff", { reason, taskComplete: false, status: "returned", counters, omitted, remainingCandidates: candidates.length, evidenceIds: evidence.map((item) => item.id) });
		return result;
	};
	try {
		active();
		const input = parseInput(rawInput, limits);
		audit("invocation-start", { status: "incomplete", policyGeneration: deps.policy.generation, profile: deps.policy.profile, limits });
		if (!deps.policy.isSafe(canonical(input))) return finish("input_context_unsafe");
		const scope = freeze(await budget.run(limits.operationTimeoutMs, (childSignal) => deps.repository.prepare(childSignal)));
		active();
		if (!deps.policy.isSafe(canonical({ paths: Object.keys(scope.files), restrictions: scope.restrictions }))) return finish("input_context_unsafe");
		const builder = new CandidateBuilder(input, scope, deps.policy);
		const fresh = async () => { active(); await budget.run(limits.operationTimeoutMs, (childSignal) => deps.repository.assertFresh(scope, childSignal)); active(); };
		for (;;) {
			active();
			candidates = builder.build();
			if (candidates.length > limits.maxCandidates) { omitted.candidates = candidates.length; return finish("candidate_overflow"); }
			if (counters.actionsDispatched >= limits.maxActions || counters.decisionRequests >= limits.maxDecisionRequests) return finish("action_limit");
			if (noProgress >= 2) return finish("no_progress");
			if (!candidates.length) return finish("no_candidates");
			if (evidenceBytes >= limits.maxEvidenceBytes) return finish("context_limit");
			await fresh();
			const candidateSetHash = hash(canonical(candidates));
			const state = jsonObject({
				objective: input.objective,
				diagnosticText: input.diagnosticText ?? "",
				evidence: Object.fromEntries(evidence.map((item) => [item.id, item])),
				previousActions: history,
				candidates: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate])),
				restrictions: scope.restrictions,
				scope: { id: scope.id, revision: scope.revision, eligibleFiles: Object.keys(scope.files).length },
				budgets: { actions: limits.maxActions - counters.actionsDispatched, decisions: limits.maxDecisionRequests - counters.decisionRequests, timeMs: budget.remaining(), enumeratedEntries: deps.repository.accounting().entriesEnumerated, bytesScanned: deps.repository.accounting().bytesScanned, scanBytesRemaining: limits.maxScannedBytes - deps.repository.accounting().bytesScanned, evidenceBytes: limits.maxEvidenceBytes - evidenceBytes, limits },
				omitted,
			});
			const serializedState = canonical(state);
			if (bytes(serializedState) > limits.maxStateBytes) return finish("context_limit");
			if (!deps.policy.isSafe(serializedState)) return finish("input_context_unsafe");
			const stateHash = hash(serializedState);
			audit("decision-start", { stateHash, candidateSetHash, candidateIds: candidates.map((candidate) => candidate.id), budgets: state.budgets });
			active();
			counters.decisionRequests++;
			const selection = await budget.run(limits.decisionTimeoutMs, (childSignal) => deps.decide(freeze({ state, candidates, candidateSetHash, stateHash }), childSignal));
			active();
			const choice = validateSelection(selection, candidates, deps, candidateSetHash);
			counters.inputTokens += selection.usage.inputTokens;
			counters.outputTokens += selection.usage.outputTokens;
			audit("decision-result", { stateHash, candidateSetHash, choice, usage: selection.usage });
			if (choice.selectedId === "handoff") return finish("decider_handoff");
			if (choice.topTwoMargin <= 0 || choice.topProbability < deps.policy.profile.minTopProbability || choice.topTwoMargin < deps.policy.profile.minTopTwoMargin) return finish("uncertain");
			const candidate = candidates.find((item) => item.id === choice.selectedId);
			if (!candidate) return finish("decision_invalid");
			await fresh();
			const operationId = `${deps.invocationId}:${counters.actionsDispatched + 1}`;
			let dispatched = false;
			let observation: OperationObservation;
			try {
				observation = await budget.run(limits.operationTimeoutMs, (childSignal) => deps.repository.execute(candidate, {
					invocationId: deps.invocationId, operationId, signal: childSignal,
					remainingEvidenceBytes: limits.maxEvidenceBytes - evidenceBytes,
					markDispatched: () => {
						active(); childSignal.throwIfAborted();
						if (dispatched || counters.actionsDispatched >= limits.maxActions) throw new InvestigationToolError("contract");
						audit("action-start", { operationId, actionId: candidate.id, action: candidate.action, scopeRevision: scope.revision, profileId: deps.policy.profile.id });
						active(); childSignal.throwIfAborted();
						counters.actionsDispatched++; dispatched = true;
					},
				}));
				active();
				observation = freeze(JSON.parse(canonical(observation)) as OperationObservation);
				if (!dispatched) throw new InvestigationToolError("contract");
				validateObservation(observation, candidate, scope, limits.maxEvidenceBytes - evidenceBytes);
				if (!deps.policy.isSafe(canonical(observation))) throw new Handoff("input_context_unsafe");
				await fresh();
			} catch (error) {
				audit("action-result", { operationId, actionId: candidate.id, dispatched, status: signal.aborted ? "cancelled" : "error", reason: error instanceof Handoff ? error.reason : "tool_error" });
				throw error;
			}
			const contentHash = hash(observation.text);
			const duplicate = evidence.find((item) => item.kind === observation.kind && item.path === observation.path && item.startLine === observation.startLine && item.contentHash === contentHash);
			let added: Evidence | undefined;
			if (!duplicate && observation.text.length > 0) {
				added = { id: `e_${hash(canonical({ kind: observation.kind, path: observation.path ?? null, startLine: observation.startLine ?? null, contentHash })).slice(0, 32)}`, kind: observation.kind, text: observation.text, contentHash, actionId: candidate.id, bounded: observation.bounded };
				if (observation.path !== undefined) added.path = observation.path;
				if (observation.startLine !== undefined) added.startLine = observation.startLine;
				if (observation.endLine !== undefined) added.endLine = observation.endLine;
				// Evidence text is persisted once; subsequent trace records refer to its stable ID.
				audit("evidence", { evidence: added, sourceIdentities: observation.sources });
				evidence.push(added); evidenceBytes += bytes(added.text);
			}
			omitted.matches = omitted.matches === null || observation.omittedMatches === null ? null : omitted.matches + observation.omittedMatches;
			omitted.evidenceBytes += observation.omittedEvidenceBytes;
			audit("action-result", { operationId, actionId: candidate.id, dispatched: true, status: "ok", evidenceId: added?.id ?? duplicate?.id ?? null, scopeFullyScanned: observation.scopeFullyScanned ?? null, sources: observation.sources, omittedMatches: observation.omittedMatches, omittedEvidenceBytes: observation.omittedEvidenceBytes });
			const previousIds = new Set(candidates.map((item) => item.id));
			builder.update(candidate, observation, added ?? duplicate);
			candidates = builder.build();
			const newCandidates = candidates.some((item) => !previousIds.has(item.id));
			noProgress = added || newCandidates ? 0 : noProgress + 1;
			history[operationId] = { actionId: candidate.id, kind: candidate.action.kind, evidenceId: added?.id ?? duplicate?.id ?? null, newEvidence: Boolean(added) };
		}
	} catch (error) {
		if (!signal.aborted && error instanceof Handoff) return finish(error.reason);
		audit("error", { status: signal.aborted ? "cancelled" : "incomplete", reason: error instanceof InvestigationToolError ? error.code : "tool_error", counters, evidenceIds: evidence.map((item) => item.id) });
		if (signal.aborted) signal.throwIfAborted();
		throw error;
	} finally { deps.repository.close(); }
}
