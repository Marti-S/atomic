/** Run from an explicitly approved repository after local service readiness and host profile approval.
 * This example does not enable the feature, choose an endpoint, or grant permissions.
 */
import { createAgentSession } from "@bastani/atomic";

const objective = process.argv[2] ?? "Locate the structured-decision implementation and its tests.";
const { session } = await createAgentSession();
try {
	if (!session.getActiveToolNames().includes("investigate_code")) {
		throw new Error("The host has not enabled Decider investigation for this repository.");
	}
	// Both canonical read/search operations must remain enabled for the internal dispatcher.
	session.setActiveToolsByName(["read", "search", "investigate_code"]);
	session.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			process.stdout.write(event.assistantMessageEvent.delta);
		}
	});
	await session.prompt(
		"Call investigate_code once with the following input, then report the evidence it actually returns. " +
			"Do not edit files or claim that gathering evidence completes a coding task. " +
			JSON.stringify({ objective, literalTerms: ["inferStructuredOutput", "inferRouterDecision"] }),
	);
} finally {
	await session.dispose();
}
