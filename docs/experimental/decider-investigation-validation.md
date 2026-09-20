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

In round 2 the user selected **"Correct stale tests (Recommended)"** after being informed that the architecture test forbids `docs/mcp.md` while metadata/system-prompt tests require it. Only those two obsolete topic strings changed to canonical `mcp-servers`; assertions and coverage remain intact. The attempted compatibility file and runtime-prompt reference were removed.

The user later said **"continue workflow"**, superseding the evidence-only boundary after the bounded diagnostic pass. The controller subsequently relayed two explicit, narrow test exceptions:

- Make only the stored-credential OAuth refresh-failure case deterministic at the provider HTTP boundary. Preserve exit 5, empty stdout and byte-identical stored auth; separately cover existing timeout taxonomy. No production exit-code or budget changes.
- Repair only the timing-sensitive detached-output fixture using deterministic control, preserving meaningful actual process/pipe evidence and adding below/above-idle-cutoff coverage. Do not change the production 100ms cutoff, other timers, drain policy or suite budgets. A smaller sleep alone is not sufficient.

The user subsequently selected **"Keep dependency unchanged (Recommended)"**. No Jiti patch, fork, pin, lockfile change, production monkeypatch or retained diagnostic node_modules modification is authorized. The single-comparison resolver proposal is deferred. All other test-contract changes still require approval.

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

## Round 3 approved fixture repairs

OAuth coverage now intercepts the child HTTP boundary after dispatcher initialization. A controlled pending response first reproduced the old exit-5 assertion failure, actual exit 2 after the existing authentication deadline. Controlled HTTP 400 now exercises the intended rejection and preserves all three original assertions. A separate timeout case verifies exit 2, explicit timeout stderr, empty stdout and unchanged credential bytes. Both cases assert exactly one intercepted POST; neither requires a live provider. Focused result: two passed, exit 0.

The detached-output fixture uses real parent/descendant processes and inherited pipes. After observing parent exit, the test requests all 30 ticks while controlling only the drain clock. Separate helper cases verify re-arm at 99ms and closure above the 100ms idle cutoff. All five cases pass. Private in-memory mutation checks fail when re-arm or idle cutoff is removed. Production child-process code and timers are unchanged.

Round 3 exact commands, before/after outputs, mutation configurations and checksums are archived at:

`/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/bca2f72a`

See `oauth/commands.md` and `drain/commands.md`. Focused checks do not replace complete gates; no full suites were run during this incorporation. Authoritative `npm run check` passed with exit 0 under Node22.19/Bun1.4.2 and isolated HOME; `check.command`, `check.log` and `check.exit` record the environment and result. Qlty on these test paths reported zero analyzed files, so its exit 0 is not substantive smell coverage. Biome remains authoritative.

## Coordinated final-candidate validation

Exactly one complete root run followed by one complete package run executed on clean candidate `9ecaea97b81bbd1e0388751da6d3a6d1a01cbb6f`, with Node22.19.0, Bun1.4.2 and isolated HOME. The approved fixture repairs were the concrete code change; initial host load was 8.83/7.33/9.06 rather than the earlier 47–116 observations. Load is not asserted as causal. No build overlapped either run, and generated subagent/workflow NODE_ENV predicates were verified dynamic before execution. Existing concurrency and budgets were unchanged. No additional retry followed.

Exact wrapper, environment, preflight, start/end timestamps, exit files, full logs and failure lists are archived at:

`/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/8df57b4a`

Root exited 1: **9,935 passed, 23 skipped, one failed**, in 449.63s. The remaining failure is `default-tools-setting > preserves explicit tool option precedence over the setting`, a 30s timeout. Package exited 1: **4,914 passed, 52 skipped, 19 failed**, in 579.23s. All 19 failures are 30s timeouts across runtime events, shell ownership, Herdr reload, deferred startup, SDK builtin parity and runtime replacement. OAuth and detached-output fixture assertions no longer fail in the complete package run. These results supersede the earlier root8/package20 counts, not the unmet gate status.

Manifest diffs are empty. An offline cached `npm pack jiti@2.7.0 --ignore-scripts` comparison found the installed `dist/jiti.cjs` byte hash identical to the package archive: `a0b3b8d5e06a0519c66b62179e29200533057920f6f11370546e979dacd24c49`. No dependency was installed or changed. This verifies the investigated resolver bundle, not every node_modules file.

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
| `npm run test:unit` | Candidate9ecaea97: exit1,9935pass/23skip/1fail; archive8df57b4a `unit.log/exit`. Exact remaining timeout described above. |
| `npm run test --workspace=@bastani/atomic` | Candidate9ecaea97: exit1,4914pass/52skip/19fail; archive8df57b4a `package.log/exit`. All failures are timeouts; approved fixture assertions pass. |
| Supplemental Qlty | `qlty smells --no-upgrade-check packages/coding-agent/src/core/structured-output/system-one.ts packages/coding-agent/scripts/copy-builtin-packages.ts` exits0; existing duplication reports retained, no speculative refactoring. Existing configuration preserved. |

Round 2 build/check and suites ran sequentially; no generated-data rebuild overlapped integration/package execution. Integration1161, CI115, scripts122 and focused/Linux51 are prior green results on the same production code, not rerun by final validation. Root/package rows above are the new candidate9ecaea97 runs. Later evidence-only edits do not change executable code or tests.

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
| Complete root unit | Still red1fail on candidate9ecaea97; exact timeout retained in issues.md and archive8df57b4a. |
| Complete root integration | Green1161pass, includes installed package. |
| Complete CI and script suites | Green115 and122pass respectively. |
| Complete coding-agent suite | Still red19fail on candidate9ecaea97; exact timeout names/stacks retained in archive8df57b4a. |
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
| Continue-workflow amendment | Resumed focused repairs; no blind full reruns or unapproved dependency changes. |
| OAuth test exception | Controlled rejection retains exit5/stdout/auth assertions; separate existing-deadline exit2 case. Focused two-case pass and failed-before evidence archived. |
| Detached-output test exception | Real post-exit process/pipe coverage plus deterministic 99/101ms cases; five-case pass and mutation failures archived. Production timers unchanged. |
| Keep-dependency-unchanged amendment | No Jiti/manifest changes; installed resolver bundle matches offline cached package hash. Proposal deferred. |
| Fresh reviewers and approval | Workflow quorum/reducer still required; implementation does not grant acceptance. |

## Interfaces and state transitions

No public return shape changed: plain objects, schemaVersion1, outcome handoff, literal taskComplete:false, ordered evidence/counters/trace ID and existing nullable omitted-match count. Closed input fields remain objective and optional diagnostic/seed/literal terms. Existing normalization, deduplication and ordering remain unchanged; raw text is not newly rewritten. Installed TypeBox and strict duplicate-key tests preserve Decider behavior; Jev retains its separate permissive parser.

Invocation states remain idle, preparing, deciding, guarded action, evidence and deciding/handoff, with error/cancelled exits. Busy refuses without queue; denied/unknown actions never dispatch; dispatched failures consume actions. Configuration/source changes stop admission. Incomplete traces never resume. Service readiness, one-running/at-most-one-queued, overload refusal and late-result discard remain unchanged. HTTP terminal decoding failure now cancels the unfinished body before releasing its reader.

## Live attempt and remaining empirical gates

The earlier user-authorized attempt materialized Mapika/decider-2b model/tokenizer revision `b37f7e1ba3fbc9238004cf531fabbee2619973fd` outside both repositories, preserving upstream fitted temperature1.3. Pinned imported source passed all blob checks. CPU/float32/graphs-off deployment fingerprint was `c6a7af49c5da0eddebecee1b17ac53ba7cfe4a5d6441c24b03f15db59b89f271`; Python3.13.5, torch2.14.0, transformers5.17.0. Manifest and lock remain in earlier private evidence.

`server.py --snapshot /tmp/atomic-decider-validation/live-model --manifest /tmp/atomic-decider-validation/live-deployment.json --bind 127.0.0.1 --port 18743` reached authenticated readiness. The unchanged `smoke.py --manifest /tmp/atomic-decider-validation/live-deployment.json --endpoint http://127.0.0.1:18743/v1/systemone` exited1 with TimeoutError at two seconds. Service stopped, no global enablement. M2 Max has no CUDA; reference-kernel fallback was recorded. Startup/readiness is not passing inference. Held-out A/B/C, Atomic calibration/profile selection, task non-inferiority, latency gains and rollout approval remain unperformed.

## Remaining failures and scope

The latest complete runs leave one root timeout and nineteen package timeouts. The earlier shortcut, credential and detached-output assertions are not failures in these runs; historical narrow passes remain diagnostic rather than substitutes for complete gates. Both complete gates still exit 1.

Host load and Jiti resolution cost are observations, not proof that every failure is environmental. Scratch resolver instrumentation demonstrates expensive missing-path exception construction; an in-memory nonthrowing preflight reduces that work in a selected lifecycle case. This is a single diagnostic comparison, not a benchmark or complete-gate proof. The user selected "Keep dependency unchanged (Recommended)": the dependency-level remedy remains deferred and unapplied. No source repair or further broad retry was made during this validation.

Out-of-scope complexity refactoring is deferred. Required root/package green and independent approval remain unproven; issues.md stays until resolved.
