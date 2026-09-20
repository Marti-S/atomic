import { InvestigationToolError } from "./common.js";

// Process-local session ownership; no queue and no persistence/replay after restart.
const activeSessions = new Set<string>();
export function acquireInvestigationSession(sessionId: string): () => void {
	if (activeSessions.has(sessionId)) throw new InvestigationToolError("busy");
	activeSessions.add(sessionId);
	let released = false;
	return () => {
		if (!released) {
			released = true;
			activeSessions.delete(sessionId);
		}
	};
}
