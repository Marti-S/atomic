/** The shared extension interception boundary for ordinary and narrowly-scoped internal tool dispatch. */
import type { ExtensionRunner } from "../extensions/runner.ts";

export interface InternalInvocationMetadata {
	/** The actual owning model tool-call ID, not an invented nested user message. */
	parentInvocationId?: string;
	operationId?: string;
}
export function emitGuardedToolCall(
	runner: ExtensionRunner,
	event: Parameters<ExtensionRunner["emitToolCall"]>[0] & InternalInvocationMetadata,
) {
	return runner.emitToolCall(event);
}
export function emitGuardedToolResult(
	runner: ExtensionRunner,
	event: Parameters<ExtensionRunner["emitToolResult"]>[0] & InternalInvocationMetadata,
	throwOnError: boolean,
) {
	return runner.emitToolResult(event, throwOnError);
}
