import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Check } from "typebox/value";
import { EvaluationAccounting } from "./evaluation-only-accounting.mjs";
import { createMinimalInvestigationSchema, EvaluationRepository } from "./evaluation-only-driver.mjs";

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "atomic-evaluation-test-"));
	writeFileSync(join(root, "sample.ts"), "export const answer = 42;\n");
	const account = new EvaluationAccounting({ maxActions: 5, maxScannedBytes: 1024, maxEvidenceBytes: 1024 });
	const events = [];
	const repo = new EvaluationRepository(
		root,
		["sample.ts"],
		account,
		{ write: (event, data) => events.push({ event, data }) },
		() => true,
	);
	return { root, repo, account, events };
}

test("canonical read is confined, charged before access and represented honestly in traces", async () => {
	const { root, repo, account, events } = fixture();
	try {
		await assert.rejects(repo.canonicalCall("read", "outside", { path: "../outside" }), /scope/);
		assert.equal(account.metrics().tools, 0);
		const result = await repo.canonicalCall("read", "read", { path: "sample.ts:1-1" });
		assert.match(result.content[0].text, /answer = 42/);
		assert.equal(account.metrics().chargedBytes, 26);
		assert.equal(account.metrics().bytesScanned, null);
		assert.equal(account.metrics().evidenceBytes, Buffer.byteLength(result.content[0].text));
		assert.equal(events[0].event, "retrieval-start");
		assert.equal(events[0].data.chargedBytes, 26);
		assert.equal(events[1].data.bytesScanned, null);
		writeFileSync(join(root, "sample.ts"), "changed");
		await assert.rejects(repo.canonicalCall("read", "changed", { path: "sample.ts" }), /source_changed/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("canonical search requires explicit regular-file scope and never exposes selectors or symlinks", async () => {
	const { root, repo, account } = fixture();
	try {
		await assert.rejects(repo.canonicalCall("search", "outside", { pattern: "answer", paths: "." }), /scope/);
		assert.equal(account.metrics().tools, 0);
		const result = await repo.canonicalCall("search", "inside", { pattern: "answer", paths: ["sample.ts"] });
		assert.match(result.content[0].text, /answer/);
		assert.equal(account.metrics().bytesScanned, null);
		symlinkSync(join(root, "sample.ts"), join(root, "link.ts"));
		assert.throws(() => new EvaluationRepository(root, ["link.ts"], account, { write() {} }, () => true), /scope/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("feasibility schema permits only the predeclared initial minimal input, never extra terms or locations", () => {
	const input = { objective: "Read the session lock.", seedLocations: [{ path: "session-lock.ts" }] };
	const schema = createMinimalInvestigationSchema(input);
	assert.equal(Check(schema, input), true);
	assert.equal(Check(schema, { ...input, literalTerms: ["lock"] }), false);
	assert.equal(Check(schema, { ...input, objective: "Different task" }), false);
	assert.equal(Check(schema, { ...input, seedLocations: [{ path: "other.ts" }] }), false);
	assert.equal(Check(schema, { ...input, seedLocations: [...input.seedLocations, ...input.seedLocations] }), false);
});

test("evaluation enforces the existing search-match and explicit-entry limits", async () => {
	const { root, account } = fixture();
	try {
		assert.throws(
			() => new EvaluationRepository(root, Array(5001).fill("sample.ts"), account, { write() {} }, () => true),
			/entry/,
		);
		writeFileSync(join(root, "sample.ts"), "match\n".repeat(21));
		const repo = new EvaluationRepository(root, ["sample.ts"], account, { write() {} }, () => true);
		await assert.rejects(
			repo.canonicalCall("search", "limit", { pattern: "match", paths: ["sample.ts"] }),
			/context_limit/,
		);
		assert.equal(account.metrics().evidenceBytes, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
