# Decider source validation, 2026-09-20

Source-validation acceptance remains **incomplete**. This is not calibration, a performance benchmark or rollout approval. No PR was created.

## Contract and source identities

Validate and repair the experimental investigation candidate while preserving default-off behavior, Jev contracts, host approval and read-only confinement.

- Candidate `afe9942e60971542fdc2ac1819c0b7a8d30e6ba1` has parent `b2727b019c25c93e63dbb4645cf45bbe8a87ecbb`; ancestry is preserved. No new worktree was created.
- Decider imported source is pinned to `a59466dc52f3ad5cc75758f80a4fa0109fd56b08`. All seven backend source-blob identities were checked against Git objects, not the checkout's different HEAD. Its worktree remains unchanged.
- AGENTS.md and complete feature, conformance and evaluation guides were read. The candidate was treated as unverified; build, accessor, deadline, padding, default-off and response-cleanup defects were reproduced before repair.
- Conventional repair commits match repository history; relevant prior commits are unsigned. No signing configuration was bypassed.

## Contract amendments received

Original user messages, verbatim:

> and you have access to the model here: /dev/decider

> You have access to spin up the local model at /dev/decider

The controller interpreted these as authorization for supported-startup/runtime/cache discovery and a bounded live service/smoke attempt using exact immutable assets and pinned source. Downloads were limited to documented startup needs. No global feature enablement, production profile or empirical A/B/C claim was authorized.

In round 2 the user selected **"Correct stale tests (Recommended)"** after being informed that the architecture test forbids `docs/mcp.md` while metadata/system-prompt tests require it. The unchanged-suite requirement is relaxed **only** for these two obsolete path expectations. Both topic strings now name canonical `mcp-servers`; their assertions and coverage remain intact. This supersedes the controller's earlier suggestion to add a compatibility document. The attempted compatibility file and runtime-prompt reference were removed. No other existing test, timeout, skip, worker count or suite configuration was changed.

## Repairs and durable regression evidence

Round 1 committed repairs remain documented in the earlier workflow receipt and archived logs:

- Restored standalone accessor source byte-for-byte from the embedded worker; the parity test previously failed ENOENT.
- Preserved the exact dynamic TypeBox runtime union while correcting its static string type; replaced unsupported ES2023 `findLast` under existing ES2022 settings.
- Updated the isolated test runner for TypeScript 7 without changing six Jev token hashes or synthetic fixtures.
- Added monotonic operation checks before dispatch and result admission; deterministic-clock regressions failed before and pass after.
- Checked actual pinned engine buckets as well as eager64 padding; graph regressions failed before and pass after.
- Kept the feature unavailable on OS-account lookup failure without trusting HOME; an actual unmapped Linux UID and portable regression reproduce the original import crash.
- Awaited SDK disposal, added shipped guidance under existing tools documentation and one Unreleased Added entry. Released sections are unchanged. Required Biome formatting was limited to candidate files.

Round 2 fixes the consolidated findings:

1. Fatal UTF-8 decoding previously released the reader without cancelling an unfinished response. Both independent reviewer probes failed. New `scripts/decider-response-cleanup.test.mjs` exercises `inferDeciderDecision` against a real localhost HTTP server that sends an invalid byte and never ends the body. It failed before repair and passes afterward. The shared reader tracks EOF and cancels unfinished bodies in `finally`; normal decoding and Jev parsing are unchanged.
2. The bundle contamination producer is now proven. `test/ci/native-builtin-bundle-imports.test.ts` invokes the build with Vitest's inherited `NODE_ENV=test`. Before repair, its nine tests passed while generated predicates became `|| true`, selecting fake child output. Explicit runtime NODE_ENV defines at both Bun.build boundaries preserve runtime selection. The same unchanged CI command and packed installed-package tests pass afterward. Full CI rebuilds preserve both runtime predicates; full integration now passes. Logs `bundle-producer-{before,after}`, `bundle-predicates-final` and `integration-final` retain the repeatable check.
3. The two stale MCP expectations were corrected under the explicit user exception above. The canonical documentation architecture and runtime prompt were not changed.

## Environment and exact command evidence

Round 2 logs, command files, exit codes, scripts, timing evidence and checksums are archived privately at:

`/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/25021dd4`

Working files are under `/tmp/atomic-decider-round2`. Earlier evidence remains in sibling archive `5a2fa852`. Shell scripts record exact environment and commands. Private Bun1.4.2 satisfies the repository floor without changing the system Bun1.4.0. Round 2 uses Node22.19.0, npm11.12.1 and Python3.13.5. No dependency manifests changed.

The first Node22 binary lived under `/private/tmp`; one unchanged doctor test rejects the word `private` anywhere in its JSON, including `process.execPath`. Copying the identical executable to `/Users/martistaerfeldt/.cache/atomic-decider-validation/node22/bin/node` removed that false positive without changing the test.

Four personal `~/.agents/skills` also contaminated SDK tests expecting no skills. The unchanged inherited-getter test fails4-versus0 with the real HOME and passes with isolated HOME. No user resources were changed. The latest root/package commands use `HOME=/tmp/atomic-decider-round2/empty-home`; scripts preserve this setup. This fixes the specific discovery contamination, not the remaining timing failures.

| Command / gate | Current evidence |
| --- | --- |
| `npm ci --ignore-scripts` | Exit0, `install-final.log`; no subsequent dependency changes. |
| `npm run build` | Exit0, `build-final.log`. |
| `npm run check` | Exit0, `check-final.log`; Biome, both typechecks and shrinkwrap. Initial formatting failure in the new regression was corrected before suite runs. |
| `node --test scripts/decider-investigation.test.mjs` | Exit0, macOS38pass/12platform skips, `focused-final.log`. |
| `node --test scripts/decider-response-cleanup.test.mjs` | Exit0, real HTTP adapter cleanup, `cleanup-final.log`; failed-before log retained. |
| Linux combined focused commands | Exit0,51pass/no skips, `linux-final.log`. Cached node:25-bookworm, read-only checkout mount, actual openat2 and HTTP cleanup. Exact Docker command in `closure-gates.sh`. |
| `(cd scripts/decider-investigation-service && python -m unittest -v test_contract)` | Exit0,12tests, `service-final.log`. |
| `(cd scripts/decider-investigation-evaluation && python -m unittest -v test_evaluation)` | Exit0,7tests, `evaluation-final.log`. |
| Private fresh replay | Exit0, semantic equality with fixture; rolloutApproved false. `replay-final.command/log` records private absolute output path and comparison. Fixtures unchanged. |
| `npm run test:ci-contracts` | Exit0,115tests/18files, `ci-final.log`; generated runtime predicates inspected afterward. |
| `npm run test:scripts` | Exit0,122pass/12platform skips, `scripts-final.log`, including new cleanup regression. |
| `npm run test:integration` | Exit0,1161pass/12skip,83passed/2skipped files,880.78s, `integration-final.log`. Includes packed Node consumer and installed-package coverage. |
| `npm run test:unit` | Latest isolated-HOME exit1:9928pass/23skip/8fail, `unit-isolated.log`. Earlier repaired run9934pass/2fail; runtime-location retry9935pass/1fail. None is a passing complete gate. |
| `npm run test --workspace=@bastani/atomic` | Latest isolated-HOME exit1:4910pass/52skip/20fail, `package-isolated.log`. Earlier repaired run4908pass/22fail. None is a passing complete gate. |
| Supplemental Qlty | `qlty smells --no-upgrade-check packages/coding-agent/src/core/structured-output/system-one.ts packages/coding-agent/scripts/copy-builtin-packages.ts` exits0; existing duplication reports retained, no speculative refactoring. Existing configuration preserved. |

Build/check and suites ran sequentially; no generated-data rebuild overlapped integration/package execution. Code was frozen before these runs. Post-validation changes are evidence notes only. Existing suite concurrency and budgets remain unchanged.

## Acceptance matrix

| Literal requirement | Current evidence / remaining gate |
| --- | --- |
| Atomic base/candidate ancestry and pinned Decider identity | Git ancestry and seven blob checks; neither repository moved to another worktree. |
| Complete instructions/guides; candidate not correct by construction | Read and independently inspected; reproduced defects listed above. |
| Changed code and existing Atomic host/tool conventions | Prior independent audits and round2 risk regression; canonical hook behavior retained. |
| Preserve Jev public contracts except shared extraction | Six token hashes unchanged; prior independent differential/type probes and full Jev/router coverage. New cancellation affects only unfinished response cleanup. |
| Clean install/build/Biome/typechecks/shrinkwrap | Exact successful commands above. |
| Focused Node/Python conformance | Successful macOS/Linux/HTTP/Python results above; not substituted for full suites. |
| Private fresh replay, no synthetic evidence rewriting | Semantic equality, explicit fixture status and rollout false. |
| Complete root unit | Still red; exact latest failures retained in issues.md/logs. |
| Complete root integration | Green1161pass, includes installed package. |
| Complete CI and script suites | Green115 and122pass respectively. |
| Complete coding-agent suite | Still red20fail; exact logs retained. |
| Explicit Jev/router/installed coverage | Root includes jev-tournament, jev-stored-auth-routing, structured-output-provider-contracts, router-output-repair, workflow-router and subagent-model-router suites. Package includes model-runtime-jev-auth. Integration includes installed-package-node-extensions and now passes in full. |
| Default-off and unsupported non-registration | Absent/disabled/unresolved-account configuration returns no tool; unsupported macOS SDK smoke and actual Linux UID regression. |
| Strict host-only configuration and secrets | OS-account path, private owner/mode, outside-repository checks, closed schema and dedicated token; negative conformance probes pass. |
| Guarded canonical nested dispatch and hook identity | Shared ordinary/nested hooks, canonical implementations and IDs; denial, mutation and failure-event probes. |
| Read-only Linux openat2 confinement | Actual Linux51test run covers symlinks, replacement, scans/audits and source identity. |
| Bounded parsing/transport/audit | Strict parser/size limits, persisted action-start and bounded evidence; newly repaired unfinished-body cancellation tested over real HTTP. |
| Cancellation/concurrency/deadlines | Lock/busy/reacquisition, abort-not-handoff, queue/late-reply rejection, monotonic operation and total deadlines. |
| No Jev/cloud fallback or false completion | Explicit local backend only; every ordinary result retains literal taskComplete:false. |
| Configuration/code-only rollback | Disable/restart/cancel instructions; no migration or tool repository writes. |
| User docs/changelog policy | Existing tools guide and operator/conformance docs reflect behavior; one Unreleased feature entry, released sections untouched. Internal cleanup/build repairs require no new user configuration. |
| Exact commands/exits/commit/clean state/issues | Logs and receipt; unresolved issues retained. Final commit/status recorded by workflow receipt. |
| No production profile, fabricated calibration/performance or PR | None added or claimed. Fixture report unchanged; approved startup downloads separate from feature enablement. |
| Live amendment | Exact-source immutable-asset CPU readiness observed; strict two-second smoke failed. Details below, no live-success claim. |
| Stale-tests amendment | Exactly two obsolete topic strings changed; no substantive assertion removed or compatibility workaround. |
| Fresh reviewers and approval | Workflow quorum/reducer still required; implementation does not grant acceptance. |

## Interfaces and state transitions

No public return shape changed: plain objects, schemaVersion1, outcome handoff, literal taskComplete:false, ordered evidence/counters/trace ID and existing nullable omitted-match count. Closed input fields remain objective and optional diagnostic/seed/literal terms. Existing normalization, deduplication and ordering remain unchanged; raw text is not newly rewritten. Installed TypeBox and strict duplicate-key tests preserve Decider behavior; Jev retains its separate permissive parser.

Invocation states remain idle, preparing, deciding, guarded action, evidence and deciding/handoff, with error/cancelled exits. Busy refuses without queue; denied/unknown actions never dispatch; dispatched failures consume actions. Configuration/source changes stop admission. Incomplete traces never resume. Service readiness, one-running/at-most-one-queued, overload refusal and late-result discard remain unchanged. HTTP terminal decoding failure now cancels the unfinished body before releasing its reader.

## Live attempt and remaining empirical gates

The earlier user-authorized attempt materialized Mapika/decider-2b model/tokenizer revision `b37f7e1ba3fbc9238004cf531fabbee2619973fd` outside both repositories, preserving upstream fitted temperature1.3. Pinned imported source passed all blob checks. CPU/float32/graphs-off deployment fingerprint was `c6a7af49c5da0eddebecee1b17ac53ba7cfe4a5d6441c24b03f15db59b89f271`; Python3.13.5, torch2.14.0, transformers5.17.0. Manifest and lock remain in earlier private evidence.

`server.py --snapshot /tmp/atomic-decider-validation/live-model --manifest /tmp/atomic-decider-validation/live-deployment.json --bind 127.0.0.1 --port 18743` reached authenticated readiness. The unchanged `smoke.py --manifest /tmp/atomic-decider-validation/live-deployment.json --endpoint http://127.0.0.1:18743/v1/systemone` exited1 with TimeoutError at two seconds. Service stopped, no global enablement. M2 Max has no CUDA; reference-kernel fallback was recorded. Startup/readiness is not passing inference. Held-out A/B/C, Atomic calibration/profile selection, task non-inferiority, latency gains and rollout approval remain unperformed.

## Remaining failures and scope

Latest unit failures comprise seven 30s timeouts and one bounded shortcut-delivery assertion. Latest package failures comprise eighteen 30s timeouts plus credential exit-code and detached-output timing assertions. The latter two unchanged cases pass in a narrow two-test run in 2.79s. The unchanged default-tools and shortcut files subsequently pass all ten tests in 72.60s (`root-timing-narrow.log`). Earlier narrow default-tools/metadata and runtime-events/system-prompt runs also passed. These checks diagnose timing sensitivity but do not replace the failing complete gates.

Host load reached116 on12 logical CPUs, with unrelated simulator activity, and remained high across later runs. CPU sampling identified Jiti source-import resolution/statSync work. These observations are not proof that every remaining failure is environmental or permission to weaken tests. No broad retry is warranted without a new concrete condition or approved repair. Only the two stale MCP expectations are currently authorized existing-test edits. A decision on further constrained test-duration work or a suitable uncontended validation environment remains necessary if no in-scope source cause is established.

Out-of-scope complexity refactoring is deferred. Required root/package green and independent approval remain unproven; issues.md stays until resolved.
