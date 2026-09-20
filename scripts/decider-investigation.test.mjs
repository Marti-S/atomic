/** CPU conformance suite: node --test scripts/decider-investigation.test.mjs. No weights, service, or GPU. */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync, chmodSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = join(root, 'packages/coding-agent/src/core');
const built = mkdtempSync(join(tmpdir(), 'atomic-decider-tests-'));
writeFileSync(join(built, 'package.json'), '{"type":"module"}');
for (const directory of ['investigation', 'structured-output', 'tools']) {
  mkdirSync(join(built, directory), { recursive: true });
  for (const name of readdirSync(join(core, directory)).filter((file) => file.endsWith('.ts'))) {
    const source = readFileSync(join(core, directory, name), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext }, fileName: name });
    writeFileSync(join(built, directory, name.replace(/\.ts$/, '.js')), output.outputText);
  }
}
const load = (path) => import(pathToFileURL(join(built, path)));
const { MAXIMUM_LIMITS, hash, canonical, Handoff, InvestigationToolError, QUESTION_VERSION, RENDERING_VERSION, CANDIDATE_POLICY_VERSION } = await load('investigation/common.js');
const { parseInput, parseLimits, parseProfile, effectivePolicy, createSecretScreen, validateEndpoint } = await load('investigation/policy.js');
const { CandidateBuilder } = await load('investigation/candidates.js');
const { investigateCode } = await load('investigation/controller.js');
const { parseStrictJson, parseDeciderResponse, requestDecider, choiceQuestions } = await load('structured-output/decider-transport.js');
const { LinuxRepositoryFacade, supportsRepositoryAccessor } = await load('investigation/executor.js');
const { readHostConfiguration, resolveHostSecrets } = await load('investigation/host-policy.js');
const { createInvestigationDispatcher } = await load('investigation/guarded-dispatch.js');
const { acquireInvestigationSession } = await load('investigation/session-lock.js');
const { FileTraceSink, inspectTrace } = await load('investigation/trace.js');
const { REPOSITORY_WORKER } = await load('investigation/repository-worker.js');
after(() => rmSync(built, { recursive: true, force: true }));

const PROFILE = Object.freeze({ id: 'fixture-only', approved: true, minTopProbability: 0.7, minTopTwoMargin: 0.2,
  backendId: 'decider/fixture', deploymentFingerprint: 'a'.repeat(64), weightsRevision: 'fixture-weights', tokenizerRevision: 'fixture-tokenizer',
  configHash: 'b'.repeat(64), temperature: 1.25, renderingVersion: RENDERING_VERSION, questionVersion: QUESTION_VERSION,
  candidatePolicyVersion: CANDIDATE_POLICY_VERSION, precision: 'decider-four-decimal', evaluationId: 'fixture-not-production' });
const compatibility = Object.fromEntries(['precision','renderingVersion','weightsRevision','tokenizerRevision','configHash','temperature','questionVersion','candidatePolicyVersion'].map((key) => [key, PROFILE[key]]));
const backend = (extra = {}) => ({ endpoint: 'http://127.0.0.1:8000/v1/systemone', token: 'fixture-not-real-service-token-123456789', profile: PROFILE, limits: MAXIMUM_LIMITS, isSafe: () => true, ...extra });
const policy = (extra = {}, check = () => {}, screen = () => true) => effectivePolicy({ profile: PROFILE, scopePaths: ['.'], ...extra }, check, screen);
const trace = () => { const events = []; return { id: 'fixture-trace', events, write(event, data) { events.push({ event, ...structuredClone(data) }); } }; };
function scope(names = ['src/a.ts']) { return { id: 'fixture-scope', revision: 'fixture-revision', entriesEnumerated: names.length,
  files: Object.fromEntries(names.map((name) => [name, { version: `v:${name}`, size: 8 }])), restrictions: { readOnly: true, lateRestriction: 'no writes' } }; }
function response(ids, selected = ids[0], values = ids.map((_, i) => i === 0 ? 1 : 0)) {
  const probs = Object.fromEntries(ids.map((id, i) => [id, values[i]]));
  return { model: PROFILE.backendId, deploymentFingerprint: PROFILE.deploymentFingerprint, compatibility,
    usage: { input_tokens: 123, output_tokens: 0 }, answers: { next: { type: 'choice', choice: selected, confidence: probs[selected], certainty: 0.5, probabilities: probs } } };
}
function selection(step, selected, values) {
  const ids = [...step.candidates.map((candidate) => candidate.id), 'handoff'];
  const chosen = selected ?? ids[0];
  const ps = values ?? ids.map((id) => id === chosen ? 1 : 0);
  const parsed = parseDeciderResponse(response(ids, chosen, ps), choiceQuestions(step.candidates), backend(), step.candidateSetHash);
  return { value: { actionId: chosen }, evidence: parsed.evidence, usage: parsed.usage };
}
function mockRepository(s = scope(), options = {}) {
  return { dispatched: 0, closed: false, prepare: async () => s, assertFresh: async () => {}, accounting: () => ({ entriesEnumerated: s.entriesEnumerated, bytesScanned: 0 }),
    async execute(candidate, context) { context.markDispatched(); this.dispatched++; return candidate.action.kind === 'read_range'
      ? { kind: 'source_excerpt', path: candidate.action.path, startLine: candidate.action.startLine, endLine: candidate.action.startLine, coveredEndLine: candidate.action.startLine,
          text: `${candidate.action.path}: fact\n`, bounded: true, omittedMatches: 0, omittedEvidenceBytes: 0,
          sources: [{ path: candidate.action.path, version: s.files[candidate.action.path].version, contentHash: hash('fact'), bytesRead: 4 }] }
      : { kind: 'search_matches', text: '', matches: [], scopeFullyScanned: true, bounded: false, omittedMatches: 0, omittedEvidenceBytes: 0, sources: [] }; },
    close() { this.closed = true; }, ...options };
}
async function run(input, overrides = {}) {
  const repository = overrides.repository ?? mockRepository();
  const audit = overrides.trace ?? trace();
  const deps = { invocationId: 'parent-call', policy: policy(), repository, trace: audit, now: () => performance.now(), decide: async (step) => selection(step), ...overrides };
  const result = await investigateCode(input, deps, overrides.signal);
  return { result, repository, audit };
}
const reason = (code) => (error) => error instanceof Handoff && error.reason === code;
const toolError = (code) => (error) => error instanceof InvestigationToolError && error.code === code;

test('input is closed, UTF-8 bounded, and cannot carry host policy', () => {
  for (const input of [{ objective: 'x', endpoint: 'http://remote' }, { objective: 'x', budget: 6 }, { objective: '😀'.repeat(513) },
    { objective: 'x', diagnosticText: 'x'.repeat(8193) }, { objective: 'x', literalTerms: ['x'] }, { objective: 'x', literalTerms: Array(9).fill('xx') },
    { objective: 'x', seedLocations: [{ path: 'src/a.ts', line: 0 }] }]) assert.throws(() => parseInput(input, MAXIMUM_LIMITS), toolError('invalid_input'));
  for (const path of ['../secret', '/etc/passwd', 'src/../a.ts', '.env', 'src/auth.json', 'C:\\device', 'src/a.ts:1-10', 'src/*'])
    assert.throws(() => parseInput({ objective: 'x', seedLocations: [{ path }] }, MAXIMUM_LIMITS), toolError('permission_denied'));
  const valid = parseInput({ objective: 'test', literalTerms: ['😀😀'], seedLocations: [{ path: './src/a.ts' }] }, MAXIMUM_LIMITS);
  assert.equal(valid.seedLocations[0].path, 'src/a.ts'); assert.ok(Object.isFrozen(valid));
});
test('host limits can only decrease and zero is invalid', () => {
  for (const [key, max] of Object.entries(MAXIMUM_LIMITS)) for (const n of [0, -1, max + 1, 1.1, Infinity])
    assert.throws(() => parseLimits({ [key]: n }), toolError('host_configuration'));
  assert.equal(parseLimits({ maxActions: 2 }).maxActions, 2);
  assert.throws(() => parseLimits({ invented: 3 }), toolError('host_configuration'));
});
test('admission profile has no threshold defaults and binds exact versions', () => {
  assert.deepEqual(parseProfile(PROFILE), PROFILE);
  for (const key of ['minTopProbability', 'minTopTwoMargin', 'deploymentFingerprint', 'temperature', 'evaluationId']) {
    const copy = { ...PROFILE }; delete copy[key]; assert.throws(() => parseProfile(copy), toolError('host_configuration'));
  }
  assert.throws(() => parseProfile({ ...PROFILE, questionVersion: 'other' }), toolError('host_configuration'));
});
test('endpoint admits only literal loopback with no credentials, query, or redirect destination', () => {
  for (const endpoint of ['https://127.0.0.1/v1/systemone','http://localhost/v1/systemone','http://127.1/v1/systemone','http://2130706433/v1/systemone',
    'http://127.0.0.1@evil/v1/systemone','http://127.0.0.1/v1/systemone?x=y','http://127.0.0.1:65536/v1/systemone','http://[::ffff:127.0.0.1]/v1/systemone'])
    assert.throws(() => validateEndpoint(endpoint));
  assert.equal(validateEndpoint('http://[::1]:8000/v1/systemone'), 'http://[::1]:8000/v1/systemone');
});
test('candidate generation is deterministic, deduplicated, complete and factual', () => {
  const s = scope(['src/b.ts','src/a.ts']); const p = policy();
  const input = { objective: 'find evidence', diagnosticText: 'at src/b.ts:100:1', seedLocations: [{ path: 'src/a.ts' }, { path: 'src/b.ts', line: 100 }], literalTerms: ['abc','abc'] };
  const a = new CandidateBuilder(input, s, p).build(); const b = new CandidateBuilder(input, s, p).build();
  assert.deepEqual(a, b); assert.equal(a.length, 3); assert.equal(a[0].provenance.source, 'diagnostic');
  assert.deepEqual(a[0].action, { kind: 'read_range', path: 'src/b.ts', startLine: 70, endLine: 189 });
  assert.equal(a[1].action.path, 'src/a.ts'); assert.equal(a[2].action.term, 'abc');
  assert.ok(Object.isFrozen(a[0].action)); assert.ok(a.every((item) => !/fixes|proves/.test(item.description)));
});
test('unchanged operations and fully covered ranges are removed', () => {
  const s = scope(); const builder = new CandidateBuilder({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }, { path: 'src/a.ts', line: 2 }] }, s, policy());
  const first = builder.build().find((c) => c.action.endLine === 120);
  builder.update(first, { kind: 'source_excerpt', path: 'src/a.ts', startLine: 1, coveredEndLine: 120, text: '', sources: [] });
  assert.equal(builder.build().length, 0);
});
test('zero candidates performs no decision or content access', async () => {
  const { result } = await run({ objective: 'x' }, { decide: () => assert.fail('provider called') });
  assert.equal(result.reason, 'no_candidates'); assert.equal(result.counters.decisionRequests, 0); assert.equal(result.counters.actionsDispatched, 0);
});
test('one candidate is sent with handoff, not executed automatically', async () => {
  let calls = 0;
  const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { decide: async (step) => {
    calls++; assert.equal(step.candidates.length, 1); assert.equal(Object.keys(choiceQuestions(step.candidates).next.criteria).length, 2); return selection(step, 'handoff');
  } });
  assert.equal(calls, 1); assert.equal(result.reason, 'decider_handoff'); assert.equal(result.counters.actionsDispatched, 0);
});
test('33 candidates hand off without tournament or provider request', async () => {
  const names = Array.from({ length: 33 }, (_, i) => `src/f${i}.ts`);
  const { result } = await run({ objective: 'x', diagnosticText: names.map((name) => `${name}:1:1`).join('\n') }, {
    repository: mockRepository(scope(names)), decide: () => assert.fail('provider called') });
  assert.equal(result.reason, 'candidate_overflow'); assert.equal(result.remainingCandidates, 33); assert.equal(result.omitted.candidates, 33);
});
test('tie and both uncertainty gates refuse dispatch', async () => {
  for (const values of [[0.5,0.5], [0.6,0.4]]) {
    const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { decide: async (step) => selection(step, undefined, values) });
    assert.equal(result.reason, 'uncertain'); assert.equal(result.counters.actionsDispatched, 0);
  }
  const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { policy: policy({ profile: { ...PROFILE, minTopTwoMargin: 0.9 } }), decide: async (step) => selection(step, undefined, [0.8,0.2]) });
  assert.equal(result.reason, 'uncertain');
});
test('at most five actions and five decisions, with no extra exhausted-budget decision', async () => {
  const names = Array.from({ length: 8 }, (_, i) => `src/f${i}.ts`);
  const { result } = await run({ objective: 'x', seedLocations: names.map((path) => ({ path })) }, { repository: mockRepository(scope(names)) });
  assert.equal(result.reason, 'action_limit'); assert.equal(result.counters.actionsDispatched, 5); assert.equal(result.counters.decisionRequests, 5); assert.equal(result.evidence.length, 5);
  assert.equal(result.taskComplete, false); assert.equal(result.outcome, 'handoff');
});
test('failed dispatched operation consumes an action slot', async () => {
  const repository = mockRepository(scope(), { execute: async (_candidate, context) => { context.markDispatched(); throw new Handoff('operation_failed'); } });
  const { result, audit } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { repository });
  assert.equal(result.reason, 'operation_failed'); assert.equal(result.counters.actionsDispatched, 1);
  assert.ok(audit.events.some((item) => item.event === 'action-result' && item.dispatched && item.status === 'error'));
});
test('two consecutive operations without new evidence or candidates stop', async () => {
  const { result } = await run({ objective: 'x', literalTerms: ['term1','term2','term3'] });
  assert.equal(result.reason, 'no_progress'); assert.equal(result.counters.actionsDispatched, 2);
});
test('provider failure is one-shot with no fallback', async () => {
  let calls = 0;
  const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { decide: async () => { calls++; throw new Handoff('provider_unavailable'); } });
  assert.equal(result.reason, 'provider_unavailable'); assert.equal(calls, 1); assert.equal(result.counters.actionsDispatched, 0);
});
test('malformed or mismatched injected decisions never dispatch', async () => {
  for (const change of [s => { s.value.extra = true; }, s => { s.value.actionId = 'not-listed'; }, s => { s.usage.inputTokens = NaN; },
    s => { s.evidence.deploymentFingerprint = 'c'.repeat(64); }, s => { s.evidence.topProbability = 0.1; }, s => { s.evidence.probabilities.handoff = 1; }]) {
    const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { decide: async (step) => { const s = selection(step); change(s); return s; } });
    assert.ok(['decision_invalid','model_mismatch'].includes(result.reason)); assert.equal(result.counters.actionsDispatched, 0);
  }
});
test('Decider rounded uniform 3/33 options normalize; excess discrepancy rejects', () => {
  for (const n of [3,33]) {
    const ids = Array.from({ length: n }, (_, i) => `a${i}`); const questions = { next: { instructions: 'choose', criteria: Object.fromEntries(ids.map((id) => [id, 'read'])) } };
    const values = ids.map(() => Number((1 / n).toFixed(4)));
    const parsed = parseDeciderResponse(response(ids, ids[0], values), questions, backend(), 'set-hash');
    assert.equal(parsed.evidence.normalization, 'decider-four-decimal'); assert.equal(parsed.evidence.topTwoMargin, 0);
    assert.ok(Math.abs(Object.values(parsed.evidence.probabilities).reduce((a,b) => a+b,0) - 1) < 1e-12);
    assert.throws(() => parseDeciderResponse(response(ids, ids[0], values.map((p) => p + 0.0001)), questions, backend(), 'set-hash'), reason('decision_invalid'));
  }
});
test('strict parser rejects missing, extra, duplicate, nonfinite, nonmaximal, and invalid usage', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":{"b":1,"b":2}}','{"a":1,"\\u0061":2}','[1,]','{"a":NaN}','{"a":1e999}', '{"a":1} trailing'])
    assert.throws(() => parseStrictJson(text), reason('decision_invalid'));
  const qs = { next: { instructions: 'choose', criteria: { a: 'read', handoff: 'stop' } } };
  for (const mutate of [r => { delete r.answers.next.confidence; }, r => { r.extra = 1; }, r => { r.answers.next.probabilities.extra = 0; },
    r => { r.answers.next.choice = 'handoff'; r.answers.next.confidence = 0; }, r => { r.usage.output_tokens = -1; }, r => { r.answers.next.probabilities.a = Infinity; }]) {
    const r = response(['a','handoff']); mutate(r); assert.throws(() => parseDeciderResponse(r, qs, backend(), 'hash'), reason('decision_invalid'));
  }
});
test('full wire request overflow is rejected without fetch and restrictions are not truncated', async () => {
  const qs = { next: { instructions: 'choose', criteria: { a: 'read', handoff: 'stop' } } }; let calls = 0;
  const client = backend({ fetch: async (_url, init) => { calls++; const body = JSON.parse(init.body); assert.equal(body.state.lastRestriction, 'do not change permissions'); assert.equal(init.redirect, 'error'); return new Response(JSON.stringify(response(['a','handoff']))); } });
  await requestDecider({ objective: 'find', lastRestriction: 'do not change permissions' }, qs, 'instructions', client, 'hash', new AbortController().signal);
  assert.equal(calls, 1);
  await assert.rejects(requestDecider({ text: 'x'.repeat(32769) }, qs, 'i', client, 'hash', new AbortController().signal), reason('context_limit'));
  await assert.rejects(requestDecider({ text: 'x' }, qs, 'i'.repeat(65536), client, 'hash', new AbortController().signal), reason('context_limit'));
  assert.equal(calls, 1);
});
test('body bounds, duplicate HTTP response keys and model mismatch cannot admit a decision', async () => {
  const qs = { next: { instructions: 'choose', criteria: { a: 'read', handoff: 'stop' } } };
  for (const body of [' '.repeat(1048577), '{"model":"x","model":"y"}', JSON.stringify({ ...response(['a','handoff']), deploymentFingerprint: 'wrong' })]) {
    await assert.rejects(requestDecider({ objective: 'x' }, qs, 'i', backend({ fetch: async () => new Response(body) }), 'hash', new AbortController().signal));
  }
});
test('unsafe input never reaches the provider or trace text', async () => {
  const sensitive = 'fixture-sensitive-value-DO-NOT-PERSIST';
  const audit = trace(); const { result } = await run({ objective: sensitive }, { trace: audit, policy: policy({}, () => {}, createSecretScreen([sensitive])), decide: () => assert.fail('called') });
  assert.equal(result.reason, 'input_context_unsafe'); assert.ok(!JSON.stringify(audit.events).includes(sensitive));
});
test('cancellation during decision throws host cancellation and records cancelled, never dispatches late result', async () => {
  const abort = new AbortController(); const audit = trace(); let late;
  const operation = run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { signal: abort.signal, trace: audit,
    decide: (step) => new Promise((resolve) => { late = () => resolve(selection(step)); abort.abort(new Error('user cancelled')); }) });
  await assert.rejects(operation, /user cancelled/); late(); await Promise.resolve();
  assert.ok(audit.events.some((item) => item.event === 'error' && item.status === 'cancelled'));
  assert.ok(!audit.events.some((item) => item.event === 'action-start'));
});
test('shared deadline includes preparation and caps an uncooperative provider', async () => {
  const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, {
    policy: policy({ limits: { totalTimeoutMs: 20, decisionTimeoutMs: 15 } }), decide: () => new Promise(() => {}) });
  assert.equal(result.reason, 'deadline'); assert.equal(result.counters.actionsDispatched, 0);
  let now = 0; const repository = mockRepository(scope(), { prepare: async () => { now = 100; return scope(); } });
  const second = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { policy: policy({ limits: { totalTimeoutMs: 50 } }), now: () => now, repository });
  assert.equal(second.result.reason, 'deadline'); assert.equal(second.result.counters.decisionRequests, 0);
});
test('policy change across an await is denied, and audit failure prevents dispatch', async () => {
  let current = true;
  const p = policy({}, () => { if (!current) throw new InvestigationToolError('permission_denied'); });
  await assert.rejects(run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { policy: p, decide: async (step) => { current = false; return selection(step); } }), toolError('permission_denied'));
  const repository = mockRepository();
  await assert.rejects(run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { repository, trace: { id: 'x', write(event) { if (event === 'action-start') throw new Error('disk failure'); } } }), toolError('audit_failed'));
  assert.equal(repository.dispatched, 0);
});
test('source changes before action result prevent evidence admission', async () => {
  let checks = 0; const repository = mockRepository(scope(), { assertFresh: async () => { if (++checks >= 3) throw new Handoff('source_changed'); } });
  const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, { repository });
  assert.equal(result.reason, 'source_changed'); assert.equal(result.evidence.length, 0);
});
test('fixed accessor source is embedded byte-for-byte and unsupported platforms do not fall back', () => {
  assert.equal(REPOSITORY_WORKER, readFileSync(join(root, 'scripts/decider-investigation-access.py'), 'utf8'));
  assert.equal(supportsRepositoryAccessor('/not/a/python'), false);
  if (process.platform === 'linux') assert.equal(supportsRepositoryAccessor(), true);
});

function realFixture(files, overrides = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'atomic-decider-fs-')); const repo = join(temp, 'repo'); const auditDir = join(temp, 'audit');
  mkdirSync(repo, { mode: 0o700 }); mkdirSync(auditDir, { mode: 0o700 });
  for (const [name, content] of Object.entries(files)) { mkdirSync(dirname(join(repo,name)), { recursive: true }); writeFileSync(join(repo,name), content); }
  const audit = trace(); const p = overrides.policy ?? policy(); const calls = [];
  const repository = new LinuxRepositoryFacade({ root: repo, policy: p, trace: audit,
    dispatch: overrides.dispatch ?? (async (call, execute, signal) => { signal.throwIfAborted(); calls.push(call); return execute(); }) });
  return { temp, repo, auditDir, audit, repository, policy: p, calls, close() { repository.close(); rmSync(temp, { recursive: true, force: true }); } };
}
const linux = process.platform === 'linux';
test('real read returns exact UTF-8 text, LF line numbers, hashes and metered access', { skip: !linux }, async () => {
  const fixture = realFixture({ 'src/a.ts': 'first\r\nsecond😀\nthird\n' });
  try {
    const { result } = await run({ objective: 'x', seedLocations: [{ path: 'src/a.ts' }] }, fixture);
    assert.equal(result.evidence[0].text, 'first\r\nsecond😀\nthird\n'); assert.equal(result.evidence[0].endLine, 3);
    assert.equal(result.evidence[0].contentHash, hash(result.evidence[0].text));
    assert.equal(fixture.calls[0].toolName, 'read'); assert.equal(fixture.calls[0].parentInvocationId, 'parent-call');
    assert.deepEqual(fixture.calls[0].args, { path: 'src/a.ts:1-120' });
    assert.equal(fixture.audit.events.filter((e) => e.event === 'content-access').reduce((a,e) => a+e.bytes,0), Buffer.byteLength('first\r\nsecond😀\nthird\n'));
  } finally { fixture.close(); }
});
test('literal search is not a regex and produces bounded actual-location read candidates', { skip: !linux }, async () => {
  const fixture = realFixture({ 'src/a.ts': 'a.b\naxb\na.b\n' }); let decision = 0;
  try {
    const { result } = await run({ objective: 'x', literalTerms: ['a.b'] }, { ...fixture, decide: async (step) => {
      if (decision++ === 0) return selection(step);
      assert.ok(step.candidates.every((c) => c.action.kind === 'read_range' && c.action.path === 'src/a.ts'));
      return selection(step, 'handoff');
    } });
    const text = JSON.parse(result.evidence[0].text);
    assert.deepEqual(text.matches.map((m) => m.line), [1,3]); assert.equal(text.scopeFullyScanned, true);
    assert.deepEqual(fixture.calls[0].args, { pattern: 'a\\.b', paths: ['src/a.ts'], i: false, gitignore: false });
  } finally { fixture.close(); }
});
test('excluded names, symlinks, special files and oversized targets cannot become eligible', { skip: !linux }, async () => {
  const fixture = realFixture({ 'ok.ts': 'fine', '.env': 'SECRET', 'node_modules/x.ts': 'hidden', 'big.ts': Buffer.alloc(1048577) });
  try {
    symlinkSync('/etc/passwd', join(fixture.repo,'link.ts'));
    const s = await fixture.repository.prepare(new AbortController().signal);
    assert.deepEqual(Object.keys(s.files), ['ok.ts']);
  } finally { fixture.close(); }
});
test('symlink replacement during decision prevents content dispatch', { skip: !linux }, async () => {
  const fixture = realFixture({ 'a.ts': 'original\n' });
  try {
    const { result } = await run({ objective: 'x', seedLocations: [{ path: 'a.ts' }] }, { ...fixture, decide: async (step) => {
      rmSync(join(fixture.repo,'a.ts')); symlinkSync('/etc/passwd', join(fixture.repo,'a.ts')); return selection(step);
    } });
    assert.equal(result.reason, 'source_changed'); assert.equal(result.counters.actionsDispatched, 0);
  } finally { fixture.close(); }
});
test('canonical hook denial is a tool error and precedes every content access', { skip: !linux }, async () => {
  const fixture = realFixture({ 'a.ts': 'data' }, { dispatch: async () => { throw new InvestigationToolError('permission_denied'); } });
  try {
    await assert.rejects(run({ objective: 'x', seedLocations: [{ path: 'a.ts' }] }, fixture), toolError('permission_denied'));
    assert.equal(fixture.audit.events.filter((e) => e.event === 'content-access').length, 0);
  } finally { fixture.close(); }
});
test('binary reads fail safely, read bytes are capped, and incomplete searches report unknown omissions', { skip: !linux }, async () => {
  const binary = realFixture({ 'binary.txt': Buffer.from([65,0,66]) });
  try { const { result } = await run({ objective: 'x', seedLocations: [{ path: 'binary.txt' }] }, binary); assert.equal(result.reason,'operation_failed'); assert.equal(result.evidence.length,0); } finally { binary.close(); }
  const large = realFixture({ 'large.ts': '😀'.repeat(3000) });
  try { const { result } = await run({ objective: 'x', seedLocations: [{ path: 'large.ts' }] }, large); assert.equal(Buffer.byteLength(result.evidence[0].text),6144); assert.equal(result.evidence[0].bounded,true); assert.equal(result.omitted.evidenceBytes,5856); } finally { large.close(); }
  const search = realFixture({ 'many.ts': 'term\n'.repeat(30) });
  try { const { result } = await run({ objective: 'x', literalTerms: ['term'] }, { ...search, decide: async (step) => selection(step, step.candidates[0].action.kind === 'search_literal' ? undefined : 'handoff') });
    assert.equal(JSON.parse(result.evidence[0].text).matches.length,20); assert.equal(result.omitted.matches,null); } finally { search.close(); }
});
test('scan and enumeration budgets include preparation and all dispatched scans', { skip: !linux }, async () => {
  const fixture = realFixture({ 'a.ts': 'term\n', 'b.ts': 'term\n' }, { policy: policy({ limits: { maxScannedBytes: 5 } }) });
  try { const { result } = await run({ objective: 'x', literalTerms: ['term'] }, { ...fixture, decide: async (step) => selection(step, step.candidates[0].action.kind === 'search_literal' ? undefined : 'handoff') });
    assert.equal(result.omitted.matches,null); assert.equal(fixture.repository.accounting().bytesScanned,5); } finally { fixture.close(); }
  const capped = realFixture({ 'a.ts': 'a', 'b.ts':'b', 'c.ts':'c' }, { policy: policy({ limits: { maxEnumeratedEntries: 2 } }) });
  try { const { result } = await run({ objective:'x',literalTerms:['term'] },capped); assert.equal(result.reason,'context_limit'); assert.equal(result.counters.decisionRequests,0); assert.equal(capped.repository.accounting().entriesEnumerated,2); } finally { capped.close(); }
});
test('durable traces retain evidence once and never resume incomplete work', { skip: !linux }, async () => {
  const fixture = realFixture({ 'a.ts': 'permitted\n' });
  try {
    const audit = new FileTraceSink(fixture.auditDir,fixture.repo,'invocation',() => true);
    await run({ objective:'x',seedLocations:[{path:'a.ts'}] },{ ...fixture,trace:audit }); audit.close();
    const stored = inspectTrace(audit.path); assert.equal(stored.status,'returned'); assert.equal(stored.evidence.length,1);
    const incomplete = new FileTraceSink(fixture.auditDir,fixture.repo,'incomplete',() => true);
    incomplete.write('invocation-start',{status:'incomplete'}); incomplete.close();
    assert.equal(inspectTrace(incomplete.path).status,'incomplete');
    assert.throws(() => new FileTraceSink(fixture.repo,fixture.repo,'unsafe',() => true),toolError('audit_failed'));
    const link = join(fixture.temp,'audit-link'); symlinkSync(fixture.repo,link);
    assert.throws(() => new FileTraceSink(link,fixture.repo,'unsafe',() => true),toolError('audit_failed'));
    assert.ok(!readdirSync(fixture.repo).some((name) => name.endsWith('.jsonl')));
  } finally { fixture.close(); }
});

test('absent explicit host configuration is off without reading repository state', () => {
  assert.equal(readHostConfiguration(undefined, '/path/that/does/not/exist'),undefined);
});
test('unapproved repositories and repository-local files cannot activate the feature', {skip:!linux}, () => {
  assert.equal(readHostConfiguration(undefined, '/path/that/does/not/exist'),undefined);
  const fixture = realFixture({ 'a.ts':'x' });
  const config = { experimental: { deciderInvestigation: { enabled:true, endpoint:'http://127.0.0.1:8000/v1/systemone', backendId:PROFILE.backendId,
    policyProfileId:PROFILE.id, profile:{ ...PROFILE,evaluationId:'heldout-test-fixture' }, tokenSecretRef:'env:ATOMIC_DECIDER_SERVICE_TOKEN', approvedRepositories:[{ root:fixture.repo,scopePaths:['.'] }] } } };
  const path = join(fixture.temp,'host.json');
  try {
    writeFileSync(path,JSON.stringify(config),{ mode:0o600 });
    const host = readHostConfiguration(path,fixture.repo); assert.equal(host.root,fixture.repo); assert.equal(host.endpoint,config.experimental.deciderInvestigation.endpoint);
    assert.equal(readHostConfiguration(path,fixture.auditDir),undefined);
    const inRepo = join(fixture.repo,'settings.json'); writeFileSync(inRepo,JSON.stringify(config),{mode:0o600});
    assert.throws(() => readHostConfiguration(inRepo,fixture.repo),toolError('host_configuration'));
    chmodSync(path,0o644); assert.throws(() => readHostConfiguration(path,fixture.repo),toolError('host_configuration'));
    chmodSync(path,0o600);
    config.experimental.deciderInvestigation.tokenSecretRef = 'env:TYPESAFE_API_KEY'; writeFileSync(path,JSON.stringify(config));
    assert.throws(() => readHostConfiguration(path,fixture.repo),toolError('host_configuration'));
  } finally { fixture.close(); }
});
test('session concurrency rejects a second invocation without queueing; fresh explicit invocation is allowed', () => {
  const release = acquireInvestigationSession('session-one');
  assert.throws(() => acquireInvestigationSession('session-one'),toolError('busy'));
  const other = acquireInvestigationSession('session-two'); other(); release(); release();
  acquireInvestigationSession('session-one')();
});
test('shared canonical hooks see actual arguments, parent IDs, failures, and filtered results cannot be bypassed', async () => {
  const seen = []; let mode = 'ok'; let executions = 0;
  const runner = { hasHandlers: () => true,
    async emitToolCall(event) { seen.push(event); return mode === 'deny' ? {block:true} : undefined; },
    async emitToolResult(event) { seen.push(structuredClone(event));
      if (mode === 'filter') return {content:[{type:'text',text:'filtered'}]};
      if (mode === 'mutate') event.details.text = 'in-place filter';
      return undefined;
    } };
  const dispatch = createInvestigationDispatcher({ _agentEventQueue:Promise.resolve(), _extensionRunner:runner },() => {});
  const call = {toolName:'read',operationId:'op-1',parentInvocationId:'parent-1',args:{path:'src/a.ts:1-120'}};
  const execute = async () => { executions++; if(mode === 'failure') throw new Handoff('operation_failed'); return {kind:'source_excerpt',text:'original',sources:[]}; };
  const signal = new AbortController().signal;
  assert.equal((await dispatch(call,execute,signal)).text,'original');
  assert.equal(seen[0].toolName,'read'); assert.equal(seen[0].parentInvocationId,'parent-1'); assert.deepEqual(seen[0].input,call.args);
  mode='deny'; await assert.rejects(dispatch(call,execute,signal),toolError('permission_denied')); assert.equal(executions,1);
  mode='filter'; await assert.rejects(dispatch(call,execute,signal),reason('operation_failed'));
  mode='mutate'; await assert.rejects(dispatch(call,execute,signal),reason('operation_failed'));
  mode='failure'; await assert.rejects(dispatch(call,execute,signal),reason('operation_failed')); assert.equal(seen.at(-1).isError,true);
});
test('root or directory replacement is detected across decision boundaries', {skip:!linux}, async () => {
  const fixture=realFixture({'sub/a.ts':'original'});
  try {
    const {result}=await run({objective:'x',seedLocations:[{path:'sub/a.ts'}]}, {...fixture,decide:async step => {
      renameSync(join(fixture.repo,'sub'),join(fixture.repo,'old')); mkdirSync(join(fixture.repo,'sub')); writeFileSync(join(fixture.repo,'sub/a.ts'),'replacement'); return selection(step);
    }});
    assert.equal(result.reason,'source_changed'); assert.equal(result.counters.actionsDispatched,0);
  } finally {fixture.close();}
});
test('source secrets are stopped before result hooks, provider transmission, or evidence persistence', {skip:!linux}, async () => {
  const value='configured-sensitive-value-123456789'; const fixture=realFixture({'a.ts':value},{policy:policy({},()=>{},createSecretScreen([value]))});
  try {
    const {result}=await run({objective:'x',seedLocations:[{path:'a.ts'}]},fixture);
    assert.equal(result.reason,'input_context_unsafe'); assert.equal(result.evidence.length,0); assert.ok(!JSON.stringify(fixture.audit.events).includes(value));
  } finally {fixture.close();}
});

test('Jev authentication, response validation, partitioning and tournament function tokens are unchanged', () => {
  const path = join(root,'packages/coding-agent/src/core/structured-output/jev.ts');
  const source = ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const expected = JSON.parse(readFileSync(join(root,'scripts/decider-investigation-evaluation/fixtures/jev-function-hashes.json'),'utf8'));
  for (const [name,digest] of Object.entries(expected)) {
    const node = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node,`Missing Jev function ${name}`);
    const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.Standard,node.getText(source));
    const tokens=[]; while(scanner.scan()!==ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
    assert.equal(hash(JSON.stringify(tokens)),digest,`Jev compatibility changed: ${name}`);
  }
});
test('shared System One helper preserves singleton requests and existing Jev parsing, not Decider strictness', async () => {
  const {compileQuestions,readResponse}=await load('structured-output/system-one.js');
  const singleton={q:{instructions:'Select the described value.',criteria:{one:'Only option.'}}};
  assert.equal(Object.keys(compileQuestions(singleton,'Pure lookup.').q.criteria).length,1);
  assert.deepEqual(await readResponse(new Response('{"x":1,"x":2}'),new AbortController().signal),{x:2});
  await assert.rejects(readResponse(new Response('x'.repeat(1048577)),new AbortController().signal),/1 MiB/);
});
test('Decider secret resolution reads only explicitly approved separate references', () => {
  const old=process.env.ATOMIC_DECIDER_SERVICE_TOKEN;
  try {
    process.env.ATOMIC_DECIDER_SERVICE_TOKEN='test-local-token-value-with-32-characters';
    const resolved=resolveHostSecrets({secretRefs:[]});
    assert.equal(resolved.token,process.env.ATOMIC_DECIDER_SERVICE_TOKEN);
    assert.equal(resolved.isSafe(resolved.token),false);
    assert.throws(() => resolveHostSecrets({secretRefs:['env:TYPESAFE_API_KEY']}),toolError('host_configuration'));
    const transportSource=readFileSync(join(core,'structured-output/decider-transport.ts'),'utf8');
    assert.ok(!transportSource.includes('TYPESAFE_API_KEY'));
  } finally {if(old===undefined) delete process.env.ATOMIC_DECIDER_SERVICE_TOKEN; else process.env.ATOMIC_DECIDER_SERVICE_TOKEN=old;}
});
test('deterministic evaluation baseline uses the same guarded action and output budget without inference', {skip:!linux}, async () => {
  const {deterministicBatchedRetrieval}=await load('investigation/deterministic-baseline.js');
  const fixture=realFixture({'src/a.ts':'export const answer = 42;\n'});
  try {
    const result=await deterministicBatchedRetrieval({objective:'Find answer',seedLocations:[{path:'src/a.ts'}]},
      {invocationId:'baseline',...fixture,trace:fixture.audit,now:()=>performance.now()});
    assert.equal(result.counters.decisionRequests,0);assert.equal(result.counters.actionsDispatched,1);
    assert.equal(result.evidence[0].text,'export const answer = 42;\n');
  } finally {fixture.close();}
});
test('lowered read/term limits remain respected for observed references', () => {
  const p=policy({limits:{maxReadLines:10,maxTermCharacters:4}});
  const builder=new CandidateBuilder({objective:'x',seedLocations:[{path:'src/a.ts',line:100}]},scope(),p);
  const action=builder.build()[0];assert.equal(action.action.startLine,91);assert.equal(action.action.endLine,100);
  builder.update(action,{kind:'source_excerpt',text:'ReferenceError: LongIdentifier',sources:[]},
    {id:'e-observed',kind:'source_excerpt',text:'ReferenceError: LongIdentifier',contentHash:hash('x'),actionId:action.id,bounded:true});
  assert.ok(builder.build().every(candidate=>candidate.action.kind!=='search_literal'));
});

test('host secret-filter failures fail closed without echoing private exceptions', () => {
  const filter=createSecretScreen([],()=>{throw new Error('private host filter diagnostic');});
  assert.equal(filter('ordinary text'),false);
});
