import { InvestigationToolError } from "./common.js";
import { GROUNDED_CANDIDATE_POLICY_VERSION } from "./grounded-version.js";
import type { Json, JsonObject } from "./types.js";

function fields(value: Json, names: readonly string[]): JsonObject {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvestigationToolError("contract");
	return Object.fromEntries(names.filter((name) => Object.hasOwn(value, name)).map((name) => [name, value[name]]));
}

/**
 * Lossless with respect to evidence text: remove duplicate audit metadata, not source content.
 * Full candidates remain in the Choice question and host-side hash validation. Full evidence
 * identities remain in the audit/result. Byte/token overflow still causes handoff; never truncate.
 */
export function compactDecisionState(state: JsonObject): JsonObject {
	const evidence = state.evidence;
	if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
		throw new InvestigationToolError("contract");
	return {
		stateVersion: GROUNDED_CANDIDATE_POLICY_VERSION,
		...fields(state, ["objective", "diagnosticText", "previousActions", "restrictions", "omitted"]),
		evidence: Object.fromEntries(Object.entries(evidence).map(([id, item]) => [
			id, fields(item, ["kind", "path", "startLine", "endLine", "text", "bounded"]),
		])),
		scope: fields(state.scope, ["id", "eligibleFiles"]),
		budgets: fields(state.budgets, ["actions", "decisions", "timeMs", "scanBytesRemaining", "evidenceBytes"]),
	};
}
