# Grounded evidence bundles and call accounting

This change adds an explicitly versioned experimental candidate policy, not a measured
coding speedup. V1 remains available with its original question, parser, thresholds,
state representation and candidate behavior. Nothing is enabled automatically.

## What is implemented

`code-investigation-grounded-v2` binds both a richer candidate builder and a compact
state projection. The existing guarded Decider controller and deterministic arm share
the same builder, repository facade, action/output budgets and evidence contracts.

After a permitted read, literal relative import-shaped text can propose existing scoped
source alternatives: `.js` to `.ts`/`.tsx`/`.d.ts`/`.js`/`.jsx`, `.mjs` to
`.mts`/`.d.mts`/`.mjs`, `.cjs` to `.cts`/`.d.cts`/`.cjs`, and extensionless relative
files or `index` files. All existing alternatives remain candidates, subject to the
unchanged overflow handoff. No candidate is invented outside the metadata snapshot.

These are **retrieval hypotheses**, not compiler-verified module resolution. Excerpts can
start inside comments or strings, and extensionless/directory resolution depends on the
runtime. There is no alias, package, conditional-export, tsconfig, symbol-graph or LSP
resolver in this change. There are no preparatory source reads or executable resolvers.
Unsupported relationships remain work for the main model. The substitutions follow the
families documented in the TypeScript module reference:
https://www.typescriptlang.org/docs/handbook/modules/reference.html#file-extension-substitution

A fully returned range can propose the next bounded page. Already observed intervals are
subtracted, and a short untruncated read records an observed EOF upper bound. The builder
never repeatedly reads the remainder of an already executed range after reaching EOF.
All derived reads still pass the existing permission, freshness, secret and audit checks.

The v2 state keeps exact source text, locations, boundedness, omissions, restrictions,
previous actions and remaining budgets. It removes duplicated candidate objects (their
complete descriptions remain in the Choice question) and evidence/scope audit hashes.
Full identities remain in the result and audit trail. There is no source-text clipping,
LLM summarization, added token capacity, changed precision or relaxed deadline.

## Profiles and deployment

A host profile must explicitly name `code-investigation-grounded-v2`. V1 is not migrated,
and unknown versions still fail closed. This is a different candidate/state distribution:
**do not relabel an approved v1 profile or inherit its calibration claim**. Obtain new
held-out evaluation, explicit approval and a distinct profile ID before production use.
The existing rendering/question versions remain unchanged because the service wire
contract and judgment instruction are unchanged. No thresholds or approved profile ship.

Default-off registration, the Linux production platform gate, local-only endpoint, host
ownership, credential separation and Jev routing behavior are unchanged. MPS remains a
standalone service/evaluation option, not a macOS production registration bypass.

## Explicit prefetch experiment

The evaluation-only macOS driver accepts trusted operator configuration:

```json
{
  "entryMode": "prefetch"
}
```

This is an addition to the existing private driver configuration, not a complete config.
It requires a grounded-v2 profile and rejects the separate `minimalInputSchema` cohort.
Omitting `entryMode` preserves `tool` mode and the original prompt.

In prefetch mode, B and C run the same existing controllers before `session.prompt`, with
the exact supplied initial input. The investigator is not exposed as a model-visible tool
in this cohort. Canonical read/search children still traverse the SDK hooks and the same
accounting wrapper. A host-prefetch origin is recorded rather than inventing an assistant
tool call. The result is queued as custom next-turn context with `triggerTurn: false`.
No synthetic `turn_start` is generated and no extra LLM call extracts the initial input.
A has the same cohort prompt but no prefetched evidence and retains ordinary read/search.

The shared retrieval deadline starts at prefetch admission for B/C, or the first ordinary
tool for A. Prefetch work counts toward task latency, action limits, scan charges and
evidence limits. Main-model continuation gets only the remaining budget. Cancellation,
failures, overflow and recovery reads remain outcomes; there is no automatic provider
fallback. This opt-in experiment does **not** install an automatic production preflight hook.

Use separately frozen A/B/C runs with v1 tool entry, v2 tool entry and v2 prefetch entry.
Record the profile, source commit, prompt hash, entry mode and initial information before
running. Do not pool those cohorts. Comparing B against A estimates bundle/entry value;
comparing C against B estimates Decider's incremental value. Keep an ordinary batched-tool
baseline and independent verification. Short single-read tasks may have no tool-mode
turn-saving headroom. No numeric turn-saving claim follows from the fixture tests.

## Call accounting

`ModelCallLedger` is an opt-in AsyncLocalStorage scope. It records calls at the
`ModelRuntimeStreaming` provider dispatch boundary after authentication and transport
preparation. `complete` delegates without double-counting. A lazy stream captures its
originating scope, even when consumed in another task. Deferred-response polling is a
separate counter, not generation. Provider-dispatch failures still count. Observer
failures cannot alter inference and increment `observerErrors`; the driver marks that
measurement erroneous. Closing a ledger prevents late work changing final metrics.

The driver retains the original stdout/replay schema and writes a private
`call-accounting` trace event containing:

- `mainAgentTurns`: the existing SDK turn counter, unchanged.
- `generativeRequests`, `byPurpose`: provider SDK dispatches within the accounting scope.
- `deciderDecisionRequests`: controller adapter attempts, including requests that fail
  before HTTP or return no accepted decision; not a GPU-forward-pass count.
- `toolOperations`: admitted canonical retrieval attempts; failures after admission count.
- `postBundleRetrievals`, `candidateCounts`, `handoffReason`: recovery and handoff diagnosis.

`providerNetworkAttempts` is deliberately **null**. Provider-internal HTTP retries,
WebSocket reconnects and transports bypassing ModelRuntime are not observed here.
Jev's separate HTTP tournament is not counted as generative inference, and is not newly
instrumented by this change. The evaluation driver labels its scoped requests `main`;
other callers default to `unclassified` unless they explicitly scope a known purpose.
This is not automatic comprehensive purpose attribution for every Atomic workflow.
No prompts, source text, model configuration or credentials enter model-call records.

Inspect the additive event without changing the existing replay input:

```sh
jq 'select(.event == "call-accounting")' /absolute/private/run/trace.jsonl
```

A lower main-agent turn count and a lower total generative-request count are separate
results. Report them together with verified success, p50/p95 task latency, service errors,
state overflow, scan charges and recovery. Do not infer actual scanned bytes from charges.

## Validation and boundaries

The focused tests execute the production candidate builder, both controllers, compact
projection and accounting module with deterministic collaborators. They cover v1
compatibility, ambiguous/scoped targets, import chains, search-to-read bundling, continuation,
EOF, overlap, caps, uncertainty, cancellation, source changes, late results, prefetch
message delivery, lazy attribution, concurrency, authentication failure and failed dispatch.
Streaming collaborators in the accounting unit test are test doubles, not live SDK proof.

```sh
node --test scripts/decider-grounded-bundle.test.mjs scripts/model-call-accounting.test.mjs
npm run check
npm run build
npm run test:unit
npm run test:integration
npm run test --workspace=@bastani/atomic
```

Run the existing Decider/response-cleanup, service and evaluation suites as well. New
fixture passes are not a substitute for the repository's pinned Node/Bun/TypeScript gates,
real SDK integration, an accelerator-qualified profile or independently verified coding
outcomes. Patch execution/validation bundles, learned utility admission, training,
compiler-backed semantic indexes and general automatic production prefetch are separate
capability changes, not included or enabled here.
