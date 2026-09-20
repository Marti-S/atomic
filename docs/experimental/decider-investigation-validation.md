# Decider source validation, 2026-09-20

All required repository gates pass on the frozen combined implementation. Explicit MPS eager float32 also passes the unchanged strict live smoke and sampled requests for a 1,024-token deployment. **This does not establish the two-second deadline at the default 8,192-token capacity, universal latency, calibration or rollout approval.** Independent workflow approval remains separate. No PR was created.

## Contract and amendments received

Validate and repair the experimental candidate while preserving default-off behavior, Jev contracts, host approval, read-only confinement and the specified source identities.

Original user messages, verbatim:

> and you have access to the model here: /dev/decider

> You have access to spin up the local model at /dev/decider

The controller interpreted those messages as permission for supported-startup discovery and a bounded exact-source/immutable-asset live attempt. Downloads were limited to documented startup needs, outside both repositories.

Subsequent user decisions and scoped approvals:

- **"Correct stale tests (Recommended)"** allowed only the two obsolete metadata/system-prompt MCP topic strings to become `mcp-servers`. Assertions and documentation architecture were preserved; the attempted compatibility file/prompt workaround was removed.
- **"continue workflow"** superseded the earlier evidence-only boundary.
- The controller relayed approval to make only the stored-credential OAuth refresh-failure case deterministic at the provider HTTP boundary, preserving exit5, empty stdout and byte-identical auth, with separate existing-timeout taxonomy coverage.
- The controller relayed approval to make only the detached-output fixture deterministic while retaining actual processes/pipes and adding below/above-idle-cutoff coverage. Production100ms cutoff, other timers and suite budgets were unchanged.
- **"Keep dependency unchanged (Recommended)"** prohibited a Jiti patch/fork/pin/lockfile change or production monkeypatch. Scratch dependency experiments remain diagnostic only.
- The user then requested **"find a solution to the issue"** and selected **"Both; keep Jiti unchanged (Recommended)"**. Atomic-owned loading optimizations and supported pinned local inference configuration were authorized to address both full-suite timeouts and the strict local deadline. Fresh editable-source evaluation, host/session identity, isolation, reload semantics, deadlines, assertions and suite concurrency/budgets remain mandatory. No remote GPU purchase, global enablement, PR or calibration/rollout claim is authorized.
- **"Accept 1,024-token scope (Recommended)"** accepts the verified explicit 1,024-token MPS float32 deployment with pinned identities, unchanged strict deadline and explicit overflow rejection. Full 8,192-token latency qualification is out of scope for this task, not a pending acceptance decision. The default remains unchanged; this is not calibration, rollout approval, a universal latency guarantee or authorization to register the Linux-only tool on macOS.

## Source and environment identity

- Candidate `afe9942e60971542fdc2ac1819c0b7a8d30e6ba1` retains parent/base `b2727b019c25c93e63dbb4645cf45bbe8a87ecbb`. No new worktree or rebase was used.
- Decider imported files match all seven pinned blobs at `a59466dc52f3ad5cc75758f80a4fa0109fd56b08`; its existing different HEAD and clean worktree were preserved.
- Jiti remains2.7.0; resolver SHA256 `a0b3b8d5e06a0519c66b62179e29200533057920f6f11370546e979dacd24c49` matches the cached package archive. Dependency manifests/lockfile are unchanged.
- Final gates use Node22.19.0 from `/Users/martistaerfeldt/.cache/atomic-decider-validation/node22/bin`, private Bun1.4.2, npm11.12.1 and Python3.13.5. Isolated `HOME=/tmp/atomic-decider-round2/empty-home` avoids personal skill discovery without changing user resources.
- Initial fresh installation using the isolated HOME's cache failed network `ETIMEDOUT` while unpacking yaml/unpdf. The exact retry used existing `npm_config_cache=/Users/martistaerfeldt/.npm` and `npm_config_prefer_offline=true`, installing567packages with no reported vulnerabilities. No dependency version changed. Both attempts are retained.
- The retry's initial identity command found Jiti missing after the failed install and exited1; this is not a source-identity failure claim. Post-install `final-source-identity.log` records the successful actual identity checks.

## Combined implementation command provenance

Durable private evidence directory:

`/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/086c30b2`

Working logs: `/tmp/atomic-decider-both-final`. `run.sh`, `environment.txt`, command/start/end/exit sidecars, full logs and checksums retain exact invocations. Code and user guides were frozen before these gates; later edits are repository evidence notes only. Build/check and every complete suite ran sequentially, with no build overlapping tests. Existing per-file parallelism, timeout budgets and skips were not altered.

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Exit0,567packages; successful cache-backed retry. |
| `npm run build` | Exit0, complete AI/native/Atomic build. |
| `npm run check` | Exit0, Biome, both workspace typechecks and shrinkwrap. Commit hooks recheck the final staged tree. |
| `node --test scripts/decider-investigation.test.mjs scripts/decider-response-cleanup.test.mjs` | Exit0,39pass/12Linux-platform skips on macOS. |
| Same combined focused commands in read-only Linux Docker mount | Exit0,51pass/no skips, including actual openat2 and real HTTP cleanup. Cached `node:25-bookworm`; disposable Linux esbuild only. Exact command in `run.sh`. |
| `(cd scripts/decider-investigation-service && python -m unittest -v test_contract)` | Exit0,15tests. |
| `(cd scripts/decider-investigation-evaluation && python -m unittest -v test_evaluation)` | Exit0,7tests. |
| `python scripts/decider-investigation-evaluation/replay.py scripts/decider-investigation-evaluation/fixtures/replay.jsonl --output /tmp/atomic-decider-both-replay.YNRfnI/report.json` | Exit0; private directory, semantic equality with unchanged fixture, invoked4, `contains-fixtures`, rolloutApproved:false. |
| `npm run test:ci-contracts` | Exit0,115tests/18files;9.57s. Generated builtin runtime NODE_ENV predicates verified afterward. |
| `npm run test:scripts` | Exit0,122pass/12Linux-platform skips. |
| `npm run test:unit` | Exit0,9936pass/23skip,899passed files;166.06s. |
| `npm run test:integration` | Exit0,1161pass/12skip,83passed/2skipped files;213.73s. |
| `npm run test --workspace=@bastani/atomic` | Exit0,4943pass/52skip,567passed/5skipped files;83.16s. |
| Supplemental `qlty smells --no-upgrade-check` on both loader files and service backend/manifest | Exit0; guard-expression/multiple-return and validation-expression findings retained without suppression. Existing Qlty configuration preserved; Biome remains authoritative. |

These results supersede historical root1/package19 and earlier failed complete runs. They are not inferred from narrow passes. Root coverage records include Jev tournament/stored-auth, router-output repair, workflow-router and subagent-model-router variants; package `model-runtime-jev-auth`, source-import regressions and approved OAuth/drain fixtures pass. Full integration includes passing `installed-package-node-extensions`. Complete result caches and targeted coverage extracts are archived.

## Repairs and durable regression evidence

- Prior branch repairs restored omitted accessor source, corrected TypeBox static typing/ES2022 trace handling and the TypeScript7 test runner, preserved six Jev token hashes, enforced monotonic pre-dispatch/result deadlines, validated actual eager/engine padding, awaited SDK disposal and kept unavailable-account imports default-off. Before/after evidence remains in earlier archives.
- Fatal UTF8 cleanup now cancels unfinished response bodies; a real localhost HTTP adapter regression failed before and passes after. The default Jev parser behavior remains separate.
- Bun builds now preserve runtime NODE_ENV predicates. The exact CI rebuild producer previously wrote test-mode constants despite passing its own tests; unchanged CI and installed-package tests now pass.
- Approved OAuth rejection/timeout cases retain exit5 versus existing deadline exit2, empty stdout and unchanged auth bytes. Approved drain tests preserve actual post-exit processes/pipes and all30ticks, with99ms re-arm/101ms cutoff coverage and mutation sensitivity. Production timers are unchanged.
- The new Atomic-owned source preflight uses supported Jiti transform and virtual-module hooks, not a dependency patch or evaluated-module cache. Runtime filesystem checks preserve source additions/deletions and fresh module state. Ten real-loader regressions and full suites pass. Independent review reproduced and repaired filename/require lexical-mutation and explicit cache-policy defects;20 final differential comparisons pass. Mechanism, exact measurements and semantic cases: [loader evidence](atomic-source-loader-optimization.md).
- MPS service support explicitly fingerprints accelerator/macOS/architecture, rejects unavailable or drifted runtime before model loading, and keeps graph execution CUDA-only. Three new conformance tests failed before and pass after. CPU identity remains unchanged.

Inherited artifacts are copied under this archive's `inherited/`: source-loader implementation evidence, final differential review and MPS runtime report/logs. Earlier archives `5a2fa852`, `25021dd4`, `bca2f72a` and `8df57b4a` preserve prior failures, scoped repairs and diagnostic qualifications. No old failure is reclassified as environmental merely because current gates pass.

## Exact live configuration and limits

Model/tokenizer: `Mapika/decider-2b`, immutable revision `b37f7e1ba3fbc9238004cf531fabbee2619973fd`, existing actual regular snapshot files outside both repositories. Pinned source and snapshot hashes are unchanged. Upstream fitted temperature1.3, eager float32 and exact-item scoring are preserved; no quantization, incompatible checkpoint or engine substitution.

Runtime: Apple M2 Max, arm64, macOS26.6.2; Python3.13.5, torch2.14.0, transformers5.17.0. CUDA is unavailable, MPS available. Exact package lock and reference-kernel observations are retained in the runtime report. Diagnostic processes used OMP_NUM_THREADS=8; no global setting changed.

- Explicit MPS1,024-cap fingerprint: `78c8d3f9f8e0e41e08986a2e5c0c47dc210f84e47d74105fe952eccc162390ef`.
- MPS8,192-cap fingerprint: `94f7246e7d12c643db62e1cd9f0804c3ccc6df84b80bcd0650c8326175e793ff`.
- Original CPU fingerprint still validates: `c6a7af49c5da0eddebecee1b17ac53ba7cfe4a5d6441c24b03f15db59b89f271`.

The supported manifest configuration adds `--device mps --dtype float32 --max-total-tokens 1024` to the exact-revision command. Graphs remain off. This uses the existing explicit lower deployment cap; the shipped default remains8,192. No profile was installed.

Final fresh-process startup reached authenticated readiness in9.187s. The **first post-readiness**1,024-token/33-option request returned HTTP200 in1.296s, warm repetition1.287s. There was no manual large-shape prewarming; only unchanged startup warm-up. Warm smoke-shaped request took0.102s. Overflow1,025tokens returned HTTP422/context_limit in0.0031s, without truncation. The unchanged `smoke.py` exited0, contractPassed:true, repositoryActions:0, qualityGateEvaluated:false. Each client and service kept the existing two-second deadline. All owned services stopped in finally.

These are sampled single-process compatibility observations, not a controlled performance benchmark or universal latency guarantee. Initial raw MPS inference before readiness warm-up took5.615s. MPS2,048 and8,192-token requests still timed out at2.001s; no late result was admitted. The exact supported CUDA graph path needs CUDA-capable hardware/runtime absent here, and no particular additional GPU is proven to meet2s. No remote purchase was made. Full-cap latency qualification is documented out-of-scope follow-up under the user's accepted 1,024-token scope. Standalone macOS service support does not register the Linux-only repository tool on macOS.

## Acceptance matrix

| Literal requirement | Current evidence / limitation |
| --- | --- |
| Candidate/base ancestry, designated checkout and pinned Decider | Git ancestry/source identities; both worktrees unchanged except committed Atomic repairs, no extra worktree. |
| Read complete instructions/feature/evaluation/conformance docs; inspect candidate, host conventions and pinned source | Implementation and independent audits; reproduced regressions, not assumed correctness. |
| Preserve Jev API/behavior except shared helper | Original token hashes, differential probes, full root/router and package Jev coverage pass. |
| Clean npm install | Exact successful cache-backed `npm ci --ignore-scripts`; failed network attempt retained. |
| Full build | Exit0. |
| Biome, both typechecks, shrinkwrap | Exit0, no suppression or dependency changes. |
| Focused Node/Python conformance | macOS39/12skip, Linux51, service15, evaluation7 pass. |
| Private replay and unchanged synthetic evidence | Exact private output and semantic equality; no empirical inference from fixtures. |
| Complete root unit/integration/CI/scripts and package | All fresh complete commands pass, counts above. |
| Explicit Jev/router and installed-package coverage | Current caches/logs identify passing relevant suites; no narrow substitute. |
| Default off / unsupported platform non-registration | Config/OS-account and Linux/macos probes; standalone MPS does not alter tool platform gate. |
| Host-only config/secrets | Private OS-account config, closed schemas, owner/mode/repository checks and dedicated token tests. |
| Guarded canonical nested dispatch / hook identity | Parent/operation IDs, canonical definitions, denial/revocation/mutation tests and complete lifecycle suites. |
| Read-only Linux openat2 | Actual Linux source/symlink/replacement/scan/audit tests pass. |
| Bounded parsing/transport/audit | Strict parser/size/queue/audit tests plus real unfinished-response cancellation. |
| Cancellation/concurrency/deadlines | Lock/reacquisition, abort-not-handoff, queued/late discard and monotonic deadlines; no budgets raised. |
| No Jev/cloud fallback or false task completion | Explicit loopback backend; ordinary results retain literal taskComplete:false. |
| Configuration/code-only rollback | Disable/restart/cancel guidance, no migration or repository-tool writes. |
| Docs/changelog | Actionable MPS flags, identity drift, readiness and cap rejection documented; loader speed entry and MPS capability under Unreleased only. |
| Exact commands/commits/clean status/issues | Private logs/checksums/Git receipt; out-of-scope full-cap qualification is documented here rather than retained as an acceptance issue. |
| No production profile, implicit downloads, fabricated calibration/performance, PR | None supplied/claimed; initial downloads separately authorized, this slice reused assets offline. |
| Source freshness, session/host isolation and reload semantics | Eleven real-loader tests, independent comparisons and complete lifecycle suites; Jiti dependency unchanged. |
| Both-solutions amendment and accepted 1,024-token scope | Full-suite timeouts resolved in recorded complete runs; strict live smoke and sampled bounded MPS requests pass. User explicitly accepts this deployment; full8,192 latency is out of scope, not an unresolved gate. |
| Cold/first/warm identity and hardware evidence | Exact manifest/runtime/source hashes and HTTP timings above; startup separate from request deadline. |
| Approved test exceptions only | Two MCP strings and scoped OAuth/drain fixture changes; no other existing assertions/budgets/concurrency modified. |
| Fresh independent approval | Specialist audits incorporated; workflow reviewers/reducer retain final authority. |

## Interfaces, transitions and deferred work

Results remain plain objects with schemaVersion1, outcome handoff, literal taskComplete:false, ordered evidence/counters/trace ID and existing nullable omitted-match count. Inputs remain the closed objective/optional diagnostic/seed/literal-term schema; existing normalization/deduplication/order and raw-text preservation are unchanged. MPS is an explicit manifest device value; only its runtime identity adds macos/machine fields. CPU/CUDA identity is unchanged.

Invocation flow remains idle/preparing/deciding/guarded action/evidence/deciding or handoff, with error/cancelled exits. Busy refuses without queue; unknown/denied actions do not dispatch; dispatched failures consume actions. Configuration/source changes stop admission; incomplete traces do not resume. Service states remain not-ready, ready-idle, one-running plus at-most-one-queued; overload refuses, deadlines discard queued/late replies without overlapping running inference. MPS-unavailable/drift/graphs mismatches fail closed. Startup readiness is distinct from deadline-qualified requests.

Full-cap accelerator/runtime qualification, held-out A/B/C, Atomic calibration/profile selection, task non-inferiority and rollout approval remain out-of-scope follow-up, not acceptance claims. Unrelated complexity refactoring and the prohibited dependency-level resolver change remain deferred. The JSX repair and its final validation are recorded below.

## Final JSX review repair and accepted-scope closure

All three latest reviewers reproduced the same defect: with `JITI_JSX=true`, ordinary Jiti selects `state.js.jsx` ahead of `state.ts`, while the optimization selected TypeScript. Both the independent reviewer probe and the new production `loadExtensionModule` differential regression failed before repair. The minimal fix adds `JITI_JSX` to the existing explicit-policy bypass; no dependency or runtime policy is rewritten. The regression covers unset/true/false transitions, repeated loading and edits to the appended JSX source with cached transforms. All eleven loader tests and the original reviewer probe now pass.

Final repair evidence is archived privately at:

`/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/jsx-repair-final-20260920`

| Final affected command | Result |
| --- | --- |
| `npm run build` | Exit0; `build.log`. |
| `npm run check` | Exit0; `check.log`, both typechecks and shrinkwrap included. |
| `node /tmp/atomic-risk-loader-probe.mjs` | Before exit1, after exit0; `probe-red.log`, `probe-green.log`. |
| `npm run test --workspace=@bastani/atomic -- extensions-source-imports.test.ts` | Before new regression exit1; final exit0,11passed; regression logs retained. |
| `npm run test:ci-contracts` | Exit0,115passed. |
| `npm run test:scripts` | Exit0,122passed/12platform skips. |
| `npm run test:unit` | Exit0,9936passed/23skipped,183.92s. |
| `npm run test:integration` | Final instrumented revalidation exit0,1161passed/12skipped,225.07s. |
| `npm run test --workspace=@bastani/atomic` | Exit0,4944passed/52skipped,94.84s. |

The first complete integration attempt failed three timing-sensitive cases in411.97s: a built-CLI15s kill, a PostgreSQL doctor elapsed assertion and a workflow-auth child timeout. All three files then passed unchanged focused execution. The parent authorized exactly one full integration revalidation with periodic uptime/process/vm_stat observation; it passed with no concurrent build, code change, test-budget change or worker restriction. Both complete attempts and the focused check remain archived. Observation does not establish the cause of every earlier failure; no failure was hidden or relabeled as a proven environmental exception.

The clean install, Python/service, Linux confinement, replay and exact accepted MPS evidence above remain valid because the JSX repair changes only the Atomic loader policy and its regression. Those unaffected gates were not unnecessarily repeated. Dependency manifests remain unchanged; installed Jiti hash matches the recorded original. Supplemental Qlty analyzed the loader and retained existing conservative-guard complexity findings without suppression. Final scope bookkeeping changes only repository notes. Commit hooks run normally; final SHA and clean status are recorded in the workflow receipt and archived Git evidence.

The user-selected 1,024-token scope resolves the former capacity issue. Full8,192 qualification remains documented out-of-scope follow-up, with defaults and deadlines unchanged. No actual in-scope issue remains after the passing affected gates, so `issues.md` was removed. Final independent review and reducer approval remain separate from these implementation results.
