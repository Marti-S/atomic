import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("Decider rejects malformed UTF-8 and closes the unfinished HTTP response", async () => {
	const directory = await mkdtemp(join(tmpdir(), "decider-cleanup-"));
	const server = createServer((_request, response) => {
		response.writeHead(200, { "Content-Type": "application/json" });
		response.write(Buffer.from([0xff]));
		// Deliberately leave the response open: terminal rejection must cancel it.
		response.once("close", () => closed.resolve());
	});
	const closed = Promise.withResolvers();
	let timeout;
	try {
		const outfile = join(directory, "adapter.mjs");
		await build({
			entryPoints: ["packages/coding-agent/src/core/structured-output/decider.ts"],
			outfile,
			bundle: true,
			platform: "node",
			format: "esm",
		});
		const { inferDeciderDecision } = await import(pathToFileURL(outfile));
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		await assert.rejects(
			inferDeciderDecision(
				{
					state: { objective: "Inspect cleanup" },
					schema: { type: "object", properties: { actionId: { type: "string" } } },
					instructions: "choose",
					jev: {
						questions: { next: { instructions: "choose", criteria: { a: "read", handoff: "return" } } },
						decode: (value) => ({ actionId: value.next }),
					},
				},
				{
					endpoint: `http://127.0.0.1:${server.address().port}/v1/systemone`,
					token: "fixture-service-token-123456789012345",
					profile: { backendId: "fixture", deploymentFingerprint: "a".repeat(64) },
					limits: {
						decisionTimeoutMs: 2000,
						maxStateBytes: 32768,
						maxRequestBytes: 65536,
						maxResponseBytes: 1048576,
					},
					isSafe: () => true,
				},
				"fixture-hash",
			),
			(error) => error.reason === "decision_invalid",
		);
		await Promise.race([
			closed.promise,
			new Promise((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Rejected response remains open beyond decision deadline")),
					3000,
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		await rm(directory, { recursive: true, force: true });
	}
});
