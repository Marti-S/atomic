import type { AgentSessionInternalSurface as AgentSession } from "../agent-session-methods.ts";
import { emitGuardedToolCall, emitGuardedToolResult } from "../tools/internal-dispatch.js";
import { canonical, Handoff, InvestigationToolError } from "./common.js";
import type { GuardedRepositoryDispatcher } from "./executor.js";
import type { OperationObservation } from "./types.js";

/** Only a host-built, root-confined read/search thunk enters this boundary. Not a general executeTool API. */
export function createInvestigationDispatcher(
	session: AgentSession,
	assertCurrent: () => void,
): GuardedRepositoryDispatcher {
	return async (call, execute, signal) => {
		const active = () => {
			signal.throwIfAborted();
			assertCurrent();
		};
		active();
		await session._agentEventQueue;
		active();
		const runner = session._extensionRunner;
		const metadata = {
			toolName: call.toolName,
			toolCallId: call.operationId,
			input: call.args,
			parentInvocationId: call.parentInvocationId,
			operationId: call.operationId,
		};
		try {
			const permission = runner.hasHandlers("tool_call")
				? await emitGuardedToolCall(runner, { type: "tool_call", ...metadata })
				: undefined;
			active();
			if (permission?.block) throw new InvestigationToolError("permission_denied");
		} catch (error) {
			signal.throwIfAborted();
			if (error instanceof InvestigationToolError) throw error;
			throw new InvestigationToolError("permission_denied");
		}
		let observation: OperationObservation;
		try {
			observation = await execute();
		} catch (error) {
			// Result hooks see dispatched failures as well, but never private exception text.
			if (runner.hasHandlers("tool_result"))
				await emitGuardedToolResult(
					runner,
					{
						type: "tool_result",
						...metadata,
						content: [{ type: "text", text: "Investigation repository operation failed." }],
						details: {},
						isError: true,
					},
					true,
				);
			throw error;
		}
		active();
		const content = [{ type: "text" as const, text: observation.text }];
		// Snapshot before invoking extensions: in-place mutation is also a filter, not a bypass.
		const contentBefore = canonical(content);
		const detailsBefore = canonical(observation);
		const filtered = runner.hasHandlers("tool_result")
			? await emitGuardedToolResult(
					runner,
					{ type: "tool_result", ...metadata, content, details: observation, isError: false },
					true,
				)
			: undefined;
		active();
		if (
			filtered?.isError ||
			canonical(filtered?.content ?? content) !== contentBefore ||
			canonical(filtered?.details ?? observation) !== detailsBefore
		) {
			// Cannot claim a redacted or replaced excerpt is an exact observed source. Fail closed instead of
			// recovering the original unfiltered body from details, or parsing invented search matches.
			throw new Handoff("operation_failed");
		}
		return observation;
	};
}
