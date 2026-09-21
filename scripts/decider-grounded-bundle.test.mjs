import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deliverPrefetch, evaluationEntry } from "./decider-investigation-evaluation/evaluation-entry.mjs";

// Execute the real dependency-free controllers, not a reimplementation or a live-model benchmark.
const root = fileURLToPath(new URL("../packages/coding-agent/src/core/investigation/", import.meta.url));
const compiled = mkdtempSync(join(tmpdir(), "atomic-grounded-test-"));
after(() => rmSync(compiled, { recursive: true, force: true }));
writeFileSync(join(compiled, "package.json"), '{"type":"module"}');
for (const name of ["types", "common", "policy", "candidates", "grounded-version", "grounded-candidates",
	"decision-state", "controller", "deterministic-baseline"]) {
	writeFileSync(join(compiled, `${name}.js`), stripTypeScriptTypes(readFileSync(join(root, `${name}.ts`), "utf8")));
}
const load = (name) => import(pathToFileURL(join(compiled, `${name}.js`)).href);
const { CandidateBuilder } = await load("candidates");
const { effectivePolicy, parseProfile } = await load("policy");
const { CANDIDATE_POLICY_VERSION, QUESTION_VERSION, RENDERING_VERSION, hash, Handoff } = await load("common");
const { GROUNDED_CANDIDATE_POLICY_VERSION: V2 } = await load("grounded-version");
const { relativeSourceTargets, firstUncoveredRange, continuationRange } = await load("grounded-candidates");
const { compactDecisionState } = await load("decision-state");
const { investigateCode } = await load("controller");
const { deterministicBatchedRetrieval } = await load("deterministic-baseline");

function profile(version = V2) {
	return {
		id: "fixture-grounded", approved: true, minTopProbability: 0.6, minTopTwoMargin: 0.05,
		backendId: "decider/test", deploymentFingerprint: "a".repeat(64), configHash: "b".repeat(64),
		weightsRevision: "c".repeat(40), tokenizerRevision: "d".repeat(40), temperature: 1.3,
		renderingVersion: RENDERING_VERSION, questionVersion: QUESTION_VERSION,
		candidatePolicyVersion: version, precision: "decider-four-decimal", evaluationId: "fixture-test-only",
	};
}
function policy(version = V2, limits = {}, extra = {}) {
	return effectivePolicy({ profile: profile(version), scopePaths: ["src"], limits, ...extra }, () => {}, () => true);
}
function scope(paths) {
	return { id: "test", revision: "scope-v1", entriesEnumerated: paths.length, restrictions: { readOnly: true },
		files: Object.fromEntries(paths.map((path) => [path, { version: "file-v1", size: 200 }])) };
}
function evidence(text, path = "src/main.ts", startLine = 1, endLine = 1) {
	return { id: "e_test", kind: "source_excerpt", text, path, startLine, endLine,
		contentHash: hash(text), actionId: "a_test", bounded: true };
}
function observation(item) {
	return { ...item, coveredEndLine: item.endLine, omittedEvidenceBytes: 0, omittedMatches: 0, sources: [] };
}
function fixture(files, version = V2, limits = {}) {
	const seen = [], decisions = [], events = [];
	const snapshot = scope(Object.keys(files));
	let closed = 0;
	const deps = {
		invocationId: "fixture", policy: policy(version, limits), now: () => 0,
		trace: { id: "fixture-trace", write: (event, data) => events.push({ event, ...data }) },
		repository: {
			accounting: () => ({ entriesEnumerated: Object.keys(files).length, bytesScanned: 0 }),
			prepare: async () => snapshot, assertFresh: async () => {}, close: () => closed++,
			execute: async (candidate, context) => {
				context.signal.throwIfAborted(); context.markDispatched(); seen.push(candidate.action);
				const action = candidate.action;
				if (action.kind === "search_literal") {
					return { kind: "search_matches", text: "src/main.ts:1: matched", bounded: true,
						matches: [{ path: "src/main.ts", line: 1, text: files["src/main.ts"].split("\n")[0], clipped: false }],
						scopeFullyScanned: true, omittedMatches: 0, omittedEvidenceBytes: 0, sources: [] };
				}
				const lines = files[action.path].split("\n").slice(action.startLine - 1, action.endLine);
				return observation(evidence(lines.join("\n"), action.path, action.startLine, action.startLine + lines.length - 1));
			},
		},
		decide: async (step) => {
			decisions.push(step);
			const selectedId = step.candidates[0].id;
			const probabilities = Object.fromEntries([...step.candidates.map((item) => [item.id, item.id === selectedId ? 1 : 0]), ["handoff", 0]]);
			return { value: { actionId: selectedId }, usage: { inputTokens: 10, outputTokens: 0 }, evidence: {
				selectedId, rawProbabilities: probabilities, probabilities, topProbability: 1, topTwoMargin: 1,
				normalization: "decider-four-decimal", backendId: deps.policy.profile.backendId,
				deploymentFingerprint: deps.policy.profile.deploymentFingerprint, questionVersion: QUESTION_VERSION,
				candidateSetHash: step.candidateSetHash,
			} };
		},
	};
	return { deps, seen, decisions, events, closed: () => closed };
}
const chain = {
	"src/main.ts": 'import { next } from "./dep.js";\nexport const result = next();',
	"src/dep.ts": 'export { next } from "./leaf";',
	"src/leaf.ts": "export const next = () => 42;",
};
const input = { objective: "Find the source for next", seedLocations: [{ path: "src/main.ts" }] };

test("v1 is retained and unrecognized policy versions still fail closed", () => {
	assert.equal(parseProfile(profile(CANDIDATE_POLICY_VERSION)).candidatePolicyVersion, CANDIDATE_POLICY_VERSION);
	assert.equal(parseProfile(profile()).candidatePolicyVersion, V2);
	assert.throws(() => parseProfile(profile("unknown")), /host_configuration/);
	assert.notEqual(policy(V2).generation, policy(CANDIDATE_POLICY_VERSION).generation);
});
test("source alternatives exist in scope; ambiguity is retained, not called exact resolution", () => {
	const s = scope(["src/a.ts", "src/a.tsx", "src/a.js", "src/a.jsx", "src/a.d.ts"]);
	assert.deepEqual(relativeSourceTargets("src/main.ts", "./a.js", s, []),
		["src/a.ts", "src/a.tsx", "src/a.d.ts", "src/a.js", "src/a.jsx"]);
});
test("mjs, cjs, extensionless and directory source hints are bounded", () => {
	const s = scope(["src/a.mts", "src/b.cts", "src/c.ts", "src/c/index.ts"]);
	assert.deepEqual(relativeSourceTargets("src/main.ts", "./a.mjs", s, []), ["src/a.mts"]);
	assert.deepEqual(relativeSourceTargets("src/main.ts", "./b.cjs", s, []), ["src/b.cts"]);
	assert.deepEqual(relativeSourceTargets("src/main.ts", "./c", s, []), ["src/c.ts", "src/c/index.ts"]);
});
test("no packages, aliases, URLs, selectors, excluded paths or out-of-root targets", () => {
	const s = scope(["outside.ts", "src/.env.ts", "src/node_modules/a.ts", "src/hidden/a.ts"]);
	for (const spec of ["../../outside.js", "pkg", "@alias/a", "https://example.org/a.js", "./a.ts:1-2", "./.env.ts", "./node_modules/a", "./hidden/a"]) {
		assert.deepEqual(relativeSourceTargets("src/main.ts", spec, s, ["src/hidden"]), [], spec);
	}
	assert.deepEqual(relativeSourceTargets("src/sub/main.ts", "../missing.js", s, []), []);
});
test("v2 follows an import chain without a coding-model callback; v1 stops at the seed", async () => {
	for (const [version, count] of [[CANDIDATE_POLICY_VERSION, 1], [V2, 3]]) {
		const f = fixture(chain, version);
		const result = await investigateCode(input, f.deps);
		assert.equal(result.counters.actionsDispatched, count);
		assert.equal(result.counters.decisionRequests, count);
		assert.equal(result.taskComplete, false);
		assert.equal(result.reason, "no_candidates");
		assert.equal(f.closed(), 1);
		assert.deepEqual(result.evidence.map((item) => item.text), Object.values(chain).slice(0, count));
	}
});
test("deterministic and Decider arms share the same expanded candidates and operations", async () => {
	const deterministic = fixture(chain), decider = fixture(chain);
	const b = await deterministicBatchedRetrieval(input, deterministic.deps);
	const c = await investigateCode(input, decider.deps);
	assert.deepEqual(deterministic.seen, decider.seen);
	assert.equal(b.counters.decisionRequests, 0);
	assert.equal(c.counters.decisionRequests, 3);
	assert.deepEqual(b.evidence.map((item) => item.text), c.evidence.map((item) => item.text));
});
test("search -> matching range -> source alternatives remains inside one controller invocation", async () => {
	const f = fixture(chain);
	await investigateCode({ objective: input.objective, literalTerms: ["next"] }, f.deps);
	assert.deepEqual(f.seen.map((action) => action.kind), ["search_literal", "read_range", "read_range", "read_range"]);
});
test("fully observed ranges offer bounded continuation without overlapping accepted lines", async () => {
	const f = fixture({ "src/main.ts": "one\ntwo\nthree\nfour\nfive" }, V2, { maxReadLines: 3 });
	await investigateCode(input, f.deps);
	assert.deepEqual(f.seen.map(({ startLine, endLine }) => [startLine, endLine]), [[1, 3], [4, 6]]);
});
test("EOF, clipped output and unsafe line arithmetic do not imply a continuation", () => {
	const action = { kind: "read_range", path: "src/main.ts", startLine: 1, endLine: 3 };
	const obs = observation(evidence("one\ntwo\nthree", "src/main.ts", 1, 3));
	assert.equal(continuationRange(action, { ...obs, omittedEvidenceBytes: 1 }, 3), undefined);
	assert.equal(continuationRange(action, { ...obs, endLine: 2 }, 3), undefined);
	assert.equal(continuationRange(action, { ...obs, coveredEndLine: 2 }, 3), undefined);
	assert.equal(continuationRange({ ...action, endLine: Number.MAX_SAFE_INTEGER }, { ...obs, endLine: Number.MAX_SAFE_INTEGER, coveredEndLine: Number.MAX_SAFE_INTEGER }, 3), undefined);
});
test("overlapping reads offer only the first unobserved gap", () => {
	const action = { kind: "read_range", path: "src/main.ts", startLine: 1, endLine: 120 };
	assert.deepEqual(firstUncoveredRange(action, [[1, 20], [40, 80]]), { ...action, startLine: 21, endLine: 39 });
	assert.equal(firstUncoveredRange(action, [[1, 120]]), undefined);
});
test("builder retains scope identities and evidence provenance for grounded reads", () => {
	const s = scope(Object.keys(chain)), b = new CandidateBuilder(input, s, policy());
	const c = b.build()[0], e = evidence(chain["src/main.ts"], "src/main.ts", 1, 2);
	b.update(c, observation(e), e);
	const next = b.build()[0];
	assert.equal(next.action.path, "src/dep.ts");
	assert.equal(next.scopeRevision, s.revision);
	assert.equal(next.provenance.evidenceId, e.id);
	assert.match(next.id, /^a_[a-f0-9]{32}$/);
});
test("compact state preserves exact Unicode/CRLF evidence and safety-relevant restrictions", () => {
	const e = evidence("é\r\nλ\n"), s = { objective: "x", diagnosticText: "d", previousActions: {},
		evidence: { [e.id]: e }, candidates: { a: { action: "read" } }, restrictions: { readOnly: true },
		scope: { id: "s", revision: "large".repeat(40), eligibleFiles: 2 }, omitted: { matches: null },
		budgets: { actions: 4, decisions: 4, timeMs: 123, scanBytesRemaining: 1000, evidenceBytes: 1000, limits: {} } };
	const c = compactDecisionState(s);
	assert.equal(c.evidence[e.id].text, e.text);
	assert.deepEqual(c.restrictions, s.restrictions);
	assert.deepEqual(c.omitted, s.omitted);
	assert.equal(c.candidates, undefined);
	assert.equal(c.evidence[e.id].contentHash, undefined);
	assert.ok(JSON.stringify(c).length < JSON.stringify(s).length);
});
test("v2 uses compact state; overflow returns exact gathered evidence rather than truncating", async () => {
	const f = fixture({ ...chain, "src/main.ts": `${chain["src/main.ts"]}\n${"X".repeat(2000)}` }, V2, { maxStateBytes: 1500 });
	const result = await investigateCode(input, f.deps);
	assert.equal(f.decisions[0].state.stateVersion, V2);
	assert.equal(f.decisions[0].state.candidates, undefined);
	assert.equal(result.reason, "context_limit");
	assert.equal(result.counters.decisionRequests, 1);
	assert.ok(result.evidence[0].text.endsWith("X".repeat(2000)));
});
test("action and candidate caps are unchanged; no silent top-k truncation", async () => {
	const capped = fixture(chain, V2, { maxActions: 2 });
	assert.equal((await investigateCode(input, capped.deps)).reason, "action_limit");
	assert.equal(capped.seen.length, 2);
	const overflow = fixture({ ...chain, "src/dep.js": "export {};" }, V2, { maxCandidates: 1 });
	assert.equal((await investigateCode(input, overflow.deps)).reason, "candidate_overflow");
	assert.equal(overflow.seen.length, 1);
});
test("uncertainty does not dispatch and cancellation is not a normal handoff", async () => {
	const f = fixture(chain), decide = f.deps.decide;
	f.deps.decide = async (step) => {
		const choice = await decide(step), selectedId = choice.value.actionId;
		Object.assign(choice.evidence, { rawProbabilities: { [selectedId]: 0.55, handoff: 0.45 },
			probabilities: { [selectedId]: 0.55, handoff: 0.45 }, topProbability: 0.55, topTwoMargin: 0.1 });
		return choice;
	};
	assert.equal((await investigateCode(input, f.deps)).reason, "uncertain");
	assert.equal(f.seen.length, 0);
	const aborted = new AbortController(); aborted.abort(new Error("cancelled"));
	await assert.rejects(investigateCode(input, fixture(chain).deps, aborted.signal), /cancelled/);
});
test("revoked source identity and late operation results never become accepted evidence", async () => {
	const f = fixture(chain); f.deps.repository.assertFresh = async () => { throw new Handoff("source_changed"); };
	assert.equal((await investigateCode(input, f.deps)).reason, "source_changed");
	assert.equal(f.seen.length, 0);
	const late = fixture(chain); let now = 0; late.deps.now = () => now;
	const execute = late.deps.repository.execute;
	late.deps.repository.execute = async (...args) => { const result = await execute(...args); now = 2000; return result; };
	const result = await investigateCode(input, late.deps);
	assert.equal(result.reason, "deadline"); assert.equal(result.evidence.length, 0);
	assert.equal(result.counters.actionsDispatched, 1);
});
test("prefetch is explicit, versioned and cannot reuse the minimal-schema cohort", () => {
	assert.equal(evaluationEntry({}), "tool");
	assert.throws(() => evaluationEntry({ entryMode: "automatic" }), /Unknown/);
	assert.throws(() => evaluationEntry({ entryMode: "prefetch", profile: profile(CANDIDATE_POLICY_VERSION) }), /separately declared/);
	assert.throws(() => evaluationEntry({ entryMode: "prefetch", profile: profile(), minimalInputSchema: true }), /separately declared/);
	assert.equal(evaluationEntry({ entryMode: "prefetch", profile: profile() }), "prefetch");
});
test("prefetch delivers custom next-turn evidence without requesting a model turn", async () => {
	const calls = [], signal = new AbortController().signal;
	const session = { sendCustomMessage: async (...args) => calls.push(args) };
	await deliverPrefetch(session, async () => ({ content: [{ type: "text", text: "exact source" }],
		details: { taskComplete: false, outcome: "handoff", reason: "no_candidates" } }), signal);
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0][1], { triggerTurn: false, deliverAs: "nextTurn" });
	assert.equal(calls[0][0].content[0].text, "exact source");
});
test("prefetch never converts cancellation or a false completion claim into evidence", async () => {
	let delivered = false;
	const session = { sendCustomMessage: async () => { delivered = true; } };
	await assert.rejects(deliverPrefetch(session, async () => ({ details: { taskComplete: true } }), new AbortController().signal), /Invalid/);
	const abort = new AbortController();
	await assert.rejects(deliverPrefetch(session, async () => { abort.abort(new Error("cancelled")); return {}; }, abort.signal), /cancelled/);
	assert.equal(delivered, false);
});
