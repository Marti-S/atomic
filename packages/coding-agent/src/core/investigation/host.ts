import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import type { AgentSessionInternalSurface as AgentSession } from "../agent-session-methods.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { inferDeciderDecision } from "../structured-output/decider.js";
import { choiceQuestions, INVESTIGATION_INSTRUCTIONS } from "../structured-output/decider-transport.js";
import { canonical, Handoff, InvestigationToolError } from "./common.js";
import { investigateCode } from "./controller.js";
import { LinuxRepositoryFacade, supportsRepositoryAccessor } from "./executor.js";
import { createInvestigationDispatcher } from "./guarded-dispatch.js";
import { USER_HOST_CONFIG_PATH, readHostConfiguration, resolveHostSecrets } from "./host-policy.js";
import { effectivePolicy } from "./policy.js";
import { acquireInvestigationSession } from "./session-lock.js";
import { FileTraceSink } from "./trace.js";
import type { InvestigationResult } from "./types.js";

let accessorSupported: boolean | undefined;
const inputSchema = Type.Object({
	objective: Type.String({ minLength: 1, description: "Information to gather. This does not authorize edits or arbitrary tools." }),
	diagnosticText: Type.Optional(Type.String()),
	seedLocations: Type.Optional(Type.Array(Type.Object({ path: Type.String(), line: Type.Optional(Type.Integer({ minimum: 1 })) }, { additionalProperties: false }), { maxItems: 8 })),
	literalTerms: Type.Optional(Type.Array(Type.String({ description: "A literal term of 2–128 Unicode characters; not a regex." }), { maxItems: 8 })),
}, { additionalProperties: false });

/** A host-managed opt-in custom tool. No UI, model registry, router setting or extension-context dispatcher. */
export function createHostInvestigationTool(session: AgentSession, hostSecretFilter?: (text: string) => boolean): ToolDefinition<typeof inputSchema, InvestigationResult> | undefined {
	// Default off does not probe Python, read repo settings, connect to a service or resolve any secret.
	if (process.platform !== "linux") return undefined;
	const initial = readHostConfiguration(USER_HOST_CONFIG_PATH, session._cwd);
	if (!initial) return undefined;
	accessorSupported ??= supportsRepositoryAccessor();
	if (!accessorSupported) return undefined;
	return {
		name: "investigate_code", label: "Investigate code (experimental)",
		description: "Delegate one bounded, read-only repository investigation. Returns source evidence, not a diagnosis or completed coding task. A local Decider selects up to five already-constructed reads/searches; the main model continues normally.",
		promptSnippet: "Gather bounded repository evidence with the explicitly enabled local Decider investigation tool.",
		parameters: inputSchema,
		async execute(toolCallId, input, signal) {
			const startedAt = performance.now();
			signal?.throwIfAborted();
			const sessionId = session.sessionManager.getSessionId();
			const release = acquireInvestigationSession(sessionId);
			let trace: FileTraceSink | undefined;
			try {
				const config = readHostConfiguration(USER_HOST_CONFIG_PATH, session._cwd);
				if (!config || config.sourceHash !== initial.sourceHash) throw new InvestigationToolError("permission_denied");
				const secrets = resolveHostSecrets(config, hostSecretFilter);
				const readDefinition = session._baseToolDefinitions.get("read");
				const searchDefinition = session._baseToolDefinitions.get("search");
				const owningDefinition = session._toolDefinitions.get("investigate_code")?.definition;
				const runner = session._extensionRunner;
				const assertCurrent = () => {
					signal?.throwIfAborted();
					const live = readHostConfiguration(USER_HOST_CONFIG_PATH, session._cwd);
					if (!live || live.sourceHash !== config.sourceHash || session._cwd !== config.root || session.sessionManager.getSessionId() !== sessionId || session._extensionRunner !== runner || session._baseToolsOverride || !readDefinition || !searchDefinition) throw new InvestigationToolError("permission_denied");
					const names = session.getActiveToolNames();
					for (const name of ["read", "search", "investigate_code"]) if (!names.includes(name) || session._excludedToolNames?.has(name) || (session._allowedToolNames && !session._allowedToolNames.has(name))) throw new InvestigationToolError("permission_denied");
					if (session._toolDefinitions.get("read")?.definition !== readDefinition || session._toolDefinitions.get("search")?.definition !== searchDefinition || session._toolDefinitions.get("investigate_code")?.definition !== owningDefinition || resolveHostSecrets(live, hostSecretFilter).signature !== secrets.signature) throw new InvestigationToolError("permission_denied");
				};
				assertCurrent();
				const policy = effectivePolicy(config, assertCurrent, secrets.isSafe);
				const directory = session.sessionManager.getSessionDir();
				if (!directory) throw new InvestigationToolError("audit_failed");
				trace = new FileTraceSink(directory, config.root, randomUUID(), secrets.isSafe);
				trace.write("parent-invocation", { parentInvocationId: toolCallId, sessionId, startedAt });
				const repository = new LinuxRepositoryFacade({ root: config.root, policy, trace, dispatch: createInvestigationDispatcher(session, assertCurrent) });
				const backend = Object.freeze({ endpoint: config.endpoint, token: secrets.token, profile: config.profile, limits: config.limits, isSafe: secrets.isSafe });
				const result = await investigateCode(input, {
					invocationId: toolCallId, startedAt, policy, repository, trace, now: () => performance.now(),
					decide: async (step, childSignal) => {
						const ids = [...step.candidates.map((candidate) => candidate.id), "handoff"];
						const schema = Type.Object({ actionId: Type.Union(ids.map((id) => Type.Literal(id))) }, { additionalProperties: false });
						const decision = await inferDeciderDecision({ state: step.state, schema, instructions: INVESTIGATION_INSTRUCTIONS, signal: childSignal,
							jev: { questions: choiceQuestions(step.candidates), decode: (choices) => {
								if (!ids.includes(choices.next)) throw new Handoff("decision_invalid");
								return { actionId: choices.next };
							} },
						}, backend, step.candidateSetHash);
						assertCurrent();
						return { value: decision.value, evidence: decision.evidence, usage: decision.usage };
					},
				}, signal);
				return { content: [{ type: "text", text: canonical(result) }], details: result };
			} finally { try { trace?.close(); } finally { release(); } }
		},
	};
}
