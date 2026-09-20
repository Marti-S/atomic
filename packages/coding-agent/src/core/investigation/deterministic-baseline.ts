/** Evaluation arm B only. Not registered as a tool and never used as a Decider fallback. */
import { CandidateBuilder } from "./candidates.js";
import {
	bytes,
	canonical,
	freeze,
	Handoff,
	hash,
	InvestigationToolError,
	InvocationBudget,
	jsonObject,
	snapshot,
} from "./common.js";
import { validateObservation } from "./controller.js";
import { parseInput } from "./policy.js";
import type { ActionCandidate, Evidence, InvestigationDependencies, InvestigationResult } from "./types.js";

export async function deterministicBatchedRetrieval(
	input: unknown,
	deps: Omit<InvestigationDependencies, "decide">,
	signal: AbortSignal = new AbortController().signal,
): Promise<InvestigationResult> {
	const budget = new InvocationBudget(deps.now, signal, deps.policy.limits.totalTimeoutMs, deps.startedAt);
	const limits = deps.policy.limits;
	const evidence: Evidence[] = [];
	const omitted = { candidates: 0, matches: 0 as number | null, evidenceBytes: 0 };
	const counters = { actionsDispatched: 0, decisionRequests: 0, inputTokens: 0, outputTokens: 0, elapsedMs: 0 };
	let remaining: readonly ActionCandidate[] = [];
	let evidenceBytes = 0;
	let noProgress = 0;
	const active = () => {
		budget.check();
		deps.policy.assertCurrent();
	};
	const audit = (event: string, data: object) => {
		try {
			deps.trace.write(
				event,
				jsonObject({ invocationId: deps.invocationId, arm: "B", elapsedMs: budget.elapsed(), ...data }),
			);
		} catch {
			throw new InvestigationToolError("audit_failed");
		}
	};
	const finish = (reason: InvestigationResult["reason"]): InvestigationResult => {
		signal.throwIfAborted();
		counters.elapsedMs = budget.elapsed();
		audit("handoff", { reason, status: "returned", counters, omitted, evidenceIds: evidence.map((item) => item.id) });
		return {
			schemaVersion: 1,
			invocationId: deps.invocationId,
			taskComplete: false,
			outcome: "handoff",
			reason,
			evidence,
			remainingCandidates: remaining.length,
			omitted,
			counters,
			traceId: deps.trace.id,
		};
	};
	try {
		active();
		const parsed = parseInput(input, limits);
		audit("invocation-start", { status: "incomplete", limits, policyGeneration: deps.policy.generation });
		if (!deps.policy.isSafe(canonical(parsed))) return finish("input_context_unsafe");
		const scope = freeze(await budget.run(limits.operationTimeoutMs, (child) => deps.repository.prepare(child)));
		active();
		if (!deps.policy.isSafe(canonical(scope))) return finish("input_context_unsafe");
		const builder = new CandidateBuilder(parsed, scope, deps.policy);
		for (;;) {
			active();
			remaining = builder.build();
			if (remaining.length > limits.maxCandidates) {
				omitted.candidates = remaining.length;
				return finish("candidate_overflow");
			}
			if (counters.actionsDispatched >= limits.maxActions) return finish("action_limit");
			if (!remaining.length) return finish("no_candidates");
			if (noProgress >= 2) return finish("no_progress");
			if (evidenceBytes >= limits.maxEvidenceBytes) return finish("context_limit");
			const candidate = remaining[0]; // Fixed documented candidate ordering; no semantic selector.
			await budget.run(limits.operationTimeoutMs, (child) => deps.repository.assertFresh(scope, child));
			active();
			const operationId = `baseline_${counters.actionsDispatched + 1}`;
			let dispatched = false;
			const observation = freeze(
				snapshot(
					await budget.run(limits.operationTimeoutMs, (child) =>
						deps.repository.execute(candidate, {
							invocationId: deps.invocationId,
							operationId,
							signal: child,
							remainingEvidenceBytes: limits.maxEvidenceBytes - evidenceBytes,
							markDispatched() {
								active();
								if (dispatched) throw new InvestigationToolError("contract");
								audit("action-start", { operationId, candidate });
								active();
								dispatched = true;
								counters.actionsDispatched++;
							},
						}),
					),
				),
			);
			active();
			if (!dispatched) throw new InvestigationToolError("contract");
			await budget.run(limits.operationTimeoutMs, (child) => deps.repository.assertFresh(scope, child));
			active();
			validateObservation(observation, candidate, scope, limits.maxEvidenceBytes - evidenceBytes);
			if (!deps.policy.isSafe(canonical(observation))) return finish("input_context_unsafe");
			audit("action-result", {
				operationId,
				actionId: candidate.id,
				sources: observation.sources,
				bounded: observation.bounded,
			});
			const contentHash = hash(observation.text);
			let added: Evidence | undefined;
			if (
				observation.text &&
				!evidence.some((item) => item.contentHash === contentHash && item.path === observation.path)
			) {
				added = {
					id: `e_${hash(`${operationId}:${contentHash}`).slice(0, 24)}`,
					kind: observation.kind,
					...(observation.path
						? { path: observation.path, startLine: observation.startLine, endLine: observation.endLine }
						: {}),
					text: observation.text,
					contentHash,
					actionId: candidate.id,
					bounded: observation.bounded,
				};
				audit("evidence", { evidence: added });
				evidence.push(added);
				evidenceBytes += bytes(added.text);
			}
			omitted.matches =
				omitted.matches === null || observation.omittedMatches === null
					? null
					: omitted.matches + observation.omittedMatches;
			omitted.evidenceBytes += observation.omittedEvidenceBytes;
			const before = new Set(remaining.map((item) => item.id));
			builder.update(candidate, observation, added);
			const created = builder.build().some((item) => !before.has(item.id));
			noProgress = added || created ? 0 : noProgress + 1;
		}
	} catch (error) {
		if (signal.aborted) {
			audit("error", { status: "cancelled" });
			signal.throwIfAborted();
		}
		if (error instanceof Handoff) return finish(error.reason);
		audit("error", {
			status: "incomplete",
			reason: error instanceof InvestigationToolError ? error.code : "programmer_error",
		});
		throw error;
	} finally {
		deps.repository.close();
	}
}
