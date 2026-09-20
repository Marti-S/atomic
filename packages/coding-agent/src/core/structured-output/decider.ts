/** Internal one-shot entrypoint. No chat provider, public provider registry, routing or auth fallback. */
import type { Static, TSchema } from "typebox";
import { Check } from "typebox/value";
import { abortable, canonical, Handoff } from "../investigation/common.js";
import type { ChoiceEvidence } from "../investigation/types.js";
import { type ResolvedDeciderBackend, requestDecider } from "./decider-transport.js";
import type { StructuredOutputRequest, StructuredOutputResult } from "./types.js";

export async function inferDeciderDecision<T extends TSchema>(
	request: Omit<StructuredOutputRequest<T>, "model" | "modelRegistry">,
	backend: ResolvedDeciderBackend,
	candidateSetHash: string,
): Promise<StructuredOutputResult<Static<T>> & { evidence: ChoiceEvidence }> {
	request.signal?.throwIfAborted();
	const timeoutMs = request.timeoutMs ?? backend.limits.decisionTimeoutMs;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > backend.limits.decisionTimeoutMs)
		throw new Handoff("decision_invalid");
	const controller = new AbortController();
	const cancel = () => controller.abort(request.signal?.reason);
	request.signal?.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(() => controller.abort(new Handoff("deadline")), timeoutMs);
	try {
		if (request.signal?.aborted) cancel();
		const state = JSON.parse(canonical(request.state));
		const questions = JSON.parse(canonical(request.jev.questions));
		const schema = JSON.parse(canonical(request.schema)) as T;
		const result = await abortable(
			requestDecider(state, questions, request.instructions, backend, candidateSetHash, controller.signal),
			controller.signal,
		);
		controller.signal.throwIfAborted();
		const value = JSON.parse(canonical(request.jev.decode(result.choices))) as Static<T>;
		// Same TypeBox decision validation as inferStructuredOutput / inferRouterDecision.
		if (!Check(schema, value)) throw new Handoff("decision_invalid");
		controller.signal.throwIfAborted();
		return {
			value,
			model: backend.profile.backendId,
			responseModel: backend.profile.backendId,
			usage: result.usage,
			evidence: result.evidence,
		};
	} finally {
		clearTimeout(timer);
		request.signal?.removeEventListener("abort", cancel);
	}
}
