import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Check } from "typebox/value";
import { createEventBus } from "../../packages/coding-agent/dist/core/event-bus.js";
import {
	createExtensionRuntime,
	loadExtensionFromFactory,
} from "../../packages/coding-agent/dist/core/extensions/loader.js";
import { ExtensionRunner } from "../../packages/coding-agent/dist/core/extensions/runner.js";
import { createInvestigationDispatcher } from "../../packages/coding-agent/dist/core/investigation/guarded-dispatch.js";
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

for (const [label, lines, path, returnedLines] of [
	["bare", 121, "sample.ts", 121],
	["context-expanded range", 200, "sample.ts:1-120", 123],
]) {
	test(`canonical hooks reject ${label} read above the actual returned-line limit before accepting evidence`, async () => {
		const { root, account, events } = fixture();
		try {
			writeFileSync(join(root, "sample.ts"), "x\n".repeat(lines));
			const repo = new EvaluationRepository(
				root,
				["sample.ts"],
				account,
				{ write: (event, data) => events.push({ event, data }) },
				() => true,
			);
			const signal = new AbortController().signal;
			const raw = await repo.read.execute("raw", { path }, signal);
			assert.equal([...raw.content[0].text.matchAll(/^\d+:/gm)].length, returnedLines);
			const hooks = [];
			const runtime = createExtensionRuntime();
			const extension = await loadExtensionFromFactory(
				(pi) => {
					pi.on("tool_call", (event) => {
						hooks.push(event);
					});
					pi.on("tool_result", (event) => {
						hooks.push(event);
					});
				},
				root,
				createEventBus(),
				runtime,
				"read-limit-observer",
			);
			const runner = new ExtensionRunner([extension], runtime, root, {}, {});
			const dispatch = createInvestigationDispatcher(
				{ _extensionRunner: runner, _agentEventQueue: Promise.resolve() },
				() => {},
			);
			await assert.rejects(
				dispatch(
					{ toolName: "read", operationId: "limit", parentInvocationId: "investigation", args: { path } },
					async () => ({ text: (await repo.canonicalCall("read", "limit", { path }, signal)).content[0].text }),
					signal,
				),
				/context_limit/,
			);
			assert.equal(account.metrics().evidenceBytes, 0);
			assert.equal(account.metrics().chargedBytes, lines * 2);
			assert.equal(account.metrics().tools, 1);
			assert.deepEqual(
				events.map(({ event }) => event),
				["retrieval-start"],
			);
			assert.deepEqual(
				hooks.map(({ type }) => type),
				["tool_call", "tool_result"],
			);
			assert.equal(hooks[1].isError, true);
			assert.doesNotMatch(hooks[1].content[0].text, /^\d+:/m);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}

for (const name of ["read", "search"]) {
	for (const finishedAt of [199, 200, 201]) {
		test(`canonical ${name} enforces the shared deadline at completion time ${finishedAt}`, async (t) => {
			const { root, repo, account, events } = fixture();
			let now = 100;
			t.mock.method(performance, "now", () => now);
			repo.retrievalDeadline = 200;
			const execute = repo[name].execute.bind(repo[name]);
			let underlyingResult;
			let dispatched = 0;
			repo[name] = {
				...repo[name],
				async execute(...args) {
					underlyingResult = await execute(...args);
					now = finishedAt;
					return underlyingResult;
				},
			};
			const args = name === "read" ? { path: "sample.ts:1-1" } : { pattern: "answer", paths: ["sample.ts"] };
			try {
				if (finishedAt < repo.retrievalDeadline) {
					const result = await repo.canonicalCall(name, "on-time", args);
					assert.match(result.content[0].text, /answer/);
					assert.equal(account.metrics().evidenceBytes, Buffer.byteLength(result.content[0].text));
					assert.deepEqual(
						events.map(({ event }) => event),
						["retrieval-start", "retrieval-result"],
					);
					return;
				}
				await assert.rejects(
					repo.canonicalCall(name, "late", args, undefined, () => dispatched++),
					(error) => {
						assert.match(error.message, /deadline/);
						assert.doesNotMatch(error.message, /answer/);
						return true;
					},
				);
				assert.equal(dispatched, 1);
				assert.equal(account.metrics().tools, 1);
				assert.equal(account.metrics().chargedBytes, 26);
				assert.equal(account.metrics().bytesScanned, null);
				assert.equal(account.metrics().evidenceBytes, 0);
				assert.deepEqual(
					events.map(({ event }) => event),
					["retrieval-start", "retrieval-rejected"],
				);
				assert.equal(events[1].data.reason, "deadline");
				assert.deepEqual(events[1].data.result, underlyingResult);
				assert.equal(events[1].data.evidenceBytes, 0);
				await assert.rejects(repo.canonicalCall(name, "next", args), /deadline/);
				assert.equal(account.metrics().tools, 1);
				assert.equal(events.length, 2);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	}
}

test("canonical retrieval also rejects time exhausted while validating the returned evidence", async (t) => {
	const { root, repo, account, events } = fixture();
	let now = 100;
	t.mock.method(performance, "now", () => now);
	repo.retrievalDeadline = 200;
	repo.safe = () => {
		now = 200;
		return true;
	};
	try {
		await assert.rejects(repo.canonicalCall("read", "validation", { path: "sample.ts:1-1" }), /deadline/);
		assert.equal(account.metrics().tools, 1);
		assert.equal(account.metrics().chargedBytes, 26);
		assert.equal(account.metrics().evidenceBytes, 0);
		assert.deepEqual(
			events.map(({ event }) => event),
			["retrieval-start", "retrieval-rejected"],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
