import { constants, closeSync, fsyncSync, fstatSync, openSync, readFileSync, realpathSync, writeSync } from "node:fs";
import { join } from "node:path";
import { canonical, InvestigationToolError, record } from "./common.js";
import { withinRoot } from "./policy.js";
import type { JsonObject, TraceSink } from "./types.js";

/** Durable JSONL outside the repository. A start without a terminal event is incomplete, never resumable. */
export class FileTraceSink implements TraceSink {
	readonly id: string;
	readonly path: string;
	private fd: number;
	private readonly isSafe: (text: string) => boolean;
	constructor(directory: string, repositoryRoot: string, invocationId: string, isSafe: (text: string) => boolean) {
		this.id = invocationId;
		this.isSafe = isSafe;
		if (!/^[a-zA-Z0-9_-]{1,128}$/.test(invocationId) || withinRoot(repositoryRoot, directory)) throw new InvestigationToolError("audit_failed");
		try {
			// The owning host supplies an existing private session directory. Do not mkdir
			// through an untrusted symlink before checking where the write would go.
			const dir = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
			try {
				const st = fstatSync(dir);
				const actual = realpathSync(`/proc/self/fd/${dir}`);
				if (!st.isDirectory() || (st.mode & 0o022) !== 0 || st.uid !== process.getuid?.() || withinRoot(realpathSync(repositoryRoot), actual)) throw new Error();
				this.path = join(actual, `${invocationId}.jsonl`);
				this.fd = openSync(`/proc/self/fd/${dir}/${invocationId}.jsonl`, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
				fsyncSync(dir);
			} finally { closeSync(dir); }
		} catch { throw new InvestigationToolError("audit_failed"); }
	}
	write(event: string, data: JsonObject): void {
		const text = canonical({ schemaVersion: 1, event, ...data });
		if (!this.isSafe(text) || this.fd < 0) throw new InvestigationToolError("audit_failed");
		try {
			const buffer = Buffer.from(`${text}\n`, "utf8");
			for (let offset = 0; offset < buffer.length;) {
				const written = writeSync(this.fd, buffer, offset);
				if (written <= 0) throw new Error();
				offset += written;
			}
			fsyncSync(this.fd);
		} catch { throw new InvestigationToolError("audit_failed"); }
	}
	close(): void { if (this.fd >= 0) { const fd = this.fd; this.fd = -1; closeSync(fd); } }
}
export function inspectTrace(path: string): { status: "incomplete" | "cancelled" | "returned"; evidence: JsonObject[]; terminal?: JsonObject } {
	const entries: JsonObject[] = [];
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (!line) continue;
		try { const value: unknown = JSON.parse(line); if (!record(value)) break; entries.push(value as JsonObject); } catch { break; }
	}
	const terminal = entries.findLast((item) => item.event === "handoff" || item.event === "error");
	return { status: terminal?.status === "returned" ? "returned" : terminal?.status === "cancelled" ? "cancelled" : "incomplete", evidence: entries.filter((item) => item.event === "evidence"), ...(terminal ? { terminal } : {}) };
}
