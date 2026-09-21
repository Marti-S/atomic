import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../packages/coding-agent/src/core/", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "atomic-call-accounting-"));
after(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
for (const name of ["model-call-accounting", "model-runtime-streaming"]) {
	const source = stripTypeScriptTypes(readFileSync(join(root, `${name}.ts`), "utf8"));
	writeFileSync(join(dir, `${name}.js`), source.replace(/\.ts"/g, '.js"'));
}
// Unit-test collaborators only. Full SDK/Bun/provider integration still runs in the workspace suite.
writeFileSync(join(dir, "fast-model-routing.js"), `
export const usesChatGptCodexTransport = () => false;
export const withChatGptCodexTransportRouting = (_model, options) => options;
`);
writeFileSync(join(dir, "fast-model-routing-transport.js"), "export const installCodexFastRouteWebSocketIdentity = () => {};\n");
const pkg = join(dir, "node_modules", "@bastani", "pi-ai");
mkdirSync(pkg, { recursive: true });
writeFileSync(join(pkg, "package.json"), '{"type":"module","exports":"./index.js"}');
writeFileSync(join(pkg, "index.js"), `
export class ModelsError extends Error { constructor(_kind, message) { super(message); } }
export function lazyStream(_model, start) {
	let completion;
	return { result() { return completion ??= Promise.resolve().then(start).then((stream) => stream.result()); } };
}
`);
const { ModelCallLedger, captureModelCall, withModelCallPurpose } = await import(pathToFileURL(join(dir, "model-call-accounting.js")).href);
const { ModelRuntimeStreaming } = await import(pathToFileURL(join(dir, "model-runtime-streaming.js")).href);
const model = { id: "test", provider: "test", api: "test" };
const context = { messages: [] };
function runtime({ auth = async () => ({ auth: { apiKey: "test-only" } }), fail = false } = {}) {
	let dispatched = 0;
	const result = { stopReason: "stop", content: [] };
	const send = () => { dispatched++; if (fail) throw new Error("provider failure"); return { result: async () => result }; };
	const provider = { stream: send, streamSimple: send, fetchDeferred: send, cancelDeferred: async () => {} };
	return { streaming: new ModelRuntimeStreaming({ getProvider: () => provider }, auth, () => false), dispatched: () => dispatched, result };
}

test("no opt-in scope means no telemetry activation or retained payload", () => {
	captureModelCall("stream")();
	assert.equal(new ModelCallLedger().snapshot().generativeRequests, 0);
});
test("nested purposes keep one ledger and independent counters", async () => {
	const ledger = new ModelCallLedger();
	await ledger.run(async () => {
		captureModelCall("stream")();
		await withModelCallPurpose("routing", async () => { await Promise.resolve(); captureModelCall("streamSimple")(); });
		captureModelCall("stream")();
	}, "main");
	const counts = ledger.snapshot();
	assert.equal(counts.generativeRequests, 3);
	assert.equal(counts.byPurpose.main, 2);
	assert.equal(counts.byPurpose.routing, 1);
	assert.equal(counts.providerNetworkAttempts, null);
});
test("concurrent runs and lazy cross-context consumption remain isolated", async () => {
	const a = new ModelCallLedger(), b = new ModelCallLedger();
	let fromA, fromB;
	await Promise.all([
		a.run(async () => { await Promise.resolve(); fromA = captureModelCall("stream"); }, "main"),
		b.run(async () => { fromB = captureModelCall("streamSimple"); await Promise.resolve(); }, "subagent"),
	]);
	b.run(() => fromA()); a.run(() => fromB());
	assert.equal(a.snapshot().byPurpose.main, 1);
	assert.equal(b.snapshot().byPurpose.subagent, 1);
	assert.equal(a.snapshot().generativeRequests, 1);
	assert.equal(b.snapshot().generativeRequests, 1);
});
test("closed ledgers cannot be mutated by late dispatches or returned snapshots", () => {
	const ledger = new ModelCallLedger();
	const record = ledger.run(() => captureModelCall("stream"));
	record();
	const final = ledger.close(); final.byPurpose.unclassified = 99;
	record();
	assert.equal(ledger.snapshot().generativeRequests, 1);
	assert.equal(ledger.snapshot().byPurpose.unclassified, 1);
	assert.throws(() => ledger.run(() => {}), /closed/);
});
test("complete and completeSimple count once, not once per wrapper", async () => {
	const ledger = new ModelCallLedger(), f = runtime();
	await ledger.run(async () => {
		assert.equal(await f.streaming.complete(model, context), f.result);
		assert.equal(await f.streaming.completeSimple(model, context), f.result);
	}, "main");
	assert.equal(ledger.snapshot().generativeRequests, 2);
	assert.equal(f.dispatched(), 2);
});
test("stream creation does not count a request; actual provider dispatch does", async () => {
	const a = new ModelCallLedger(), b = new ModelCallLedger(), f = runtime();
	const stream = a.run(() => f.streaming.streamSimple(model, context), "main");
	assert.equal(a.snapshot().generativeRequests, 0);
	await b.run(() => stream.result(), "subagent");
	assert.equal(a.snapshot().generativeRequests, 1);
	assert.equal(b.snapshot().generativeRequests, 0);
});
test("authentication rejection and pre-dispatch cancellation are not provider calls", async () => {
	const ledger = new ModelCallLedger(), missing = runtime({ auth: async () => undefined });
	await assert.rejects(ledger.run(() => missing.streaming.complete(model, context)), /not configured/);
	const abort = new AbortController(); abort.abort(new Error("cancelled"));
	const f = runtime();
	await assert.rejects(ledger.run(() => f.streaming.completeSimple(model, context, { signal: abort.signal })), /cancelled/);
	assert.equal(ledger.snapshot().generativeRequests, 0);
	assert.equal(f.dispatched(), 0);
});
test("failed provider dispatches still count, without changing their exception", async () => {
	const ledger = new ModelCallLedger(), f = runtime({ fail: true });
	await assert.rejects(ledger.run(() => f.streaming.complete(model, context)), /provider failure/);
	assert.equal(ledger.snapshot().generativeRequests, 1);
});
test("deferred polling is recorded separately and cancellation is not generation", async () => {
	const ledger = new ModelCallLedger(), f = runtime();
	await ledger.run(async () => {
		await f.streaming.fetchDeferred(model, {});
		await f.streaming.cancelDeferred(model, {});
	});
	assert.equal(ledger.snapshot().generativeRequests, 0);
	assert.equal(ledger.snapshot().deferredFetches, 1);
});
test("observer failure cannot break inference and is visible to the evaluator", async () => {
	const ledger = new ModelCallLedger(() => { throw new Error("sink unavailable"); }), f = runtime();
	assert.equal(await ledger.run(() => f.streaming.complete(model, context)), f.result);
	assert.equal(ledger.snapshot().observerErrors, 1);
	assert.equal(ledger.snapshot().generativeRequests, 1);
});
test("records contain only purpose/method/sequence, never model credentials or context", async () => {
	const records = [], ledger = new ModelCallLedger((record) => records.push(record)), f = runtime();
	await ledger.run(() => f.streaming.completeSimple(model, { messages: [{ content: "private prompt" }] }));
	assert.deepEqual(records, [{ sequence: 1, purpose: "unclassified", method: "streamSimple" }]);
});
