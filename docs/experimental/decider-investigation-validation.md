# Decider source validation, 2026-09-20

This is source-validation evidence, not release approval, calibration or a live-model benchmark. Required full-suite results remain unresolved below. No PR was created.

## Scope and source identity

Validate and repair the experimental `investigate_code` candidate while preserving default-off behavior, Jev contracts, read-only confinement and explicit host approval.

- Candidate `afe9942e60971542fdc2ac1819c0b7a8d30e6ba1` has parent `b2727b019c25c93e63dbb4645cf45bbe8a87ecbb`. `git merge-base --is-ancestor b2727b019 HEAD` returned 0. No rebase or additional worktree was used.
- Decider was inspected through Git objects at `a59466dc52f3ad5cc75758f80a4fa0109fd56b08`, not its different current HEAD. All seven `SOURCE_BLOBS` entries in `backend.py` match `git rev-parse <revision>:decider/<name>`. Its working tree remained unchanged.
- Read `AGENTS.md` and the complete feature, conformance and evaluation guides before repairs. Inspected the changed controller, host, dispatch, transport, accessor and Python service/evaluation code and relevant pinned Decider prompt/rendering/scoring code.
- Repository history uses conventional repair subjects. Candidate and recent requesting-user repairs are unsigned; no signing configuration is set. Read-only GitHub inspection of merged PR #3119 confirms the base renamed `mcp.md` to `mcp-servers.md`.

## Repairs and regression evidence

- Restored the omitted `scripts/decider-investigation-access.py` byte-for-byte from the embedded worker. The existing parity test failed with ENOENT before restoration and passes afterward.
- Preserved the runtime dynamic Choice union while supplying TypeBox's explicit static string type. The original build inferred `never`. Installed-TypeBox adapter tests accept dynamic action/handoff values and reject invented decoded values.
- Replaced ES2023 `findLast` with non-mutating reverse/find under the existing ES2022 library. Trace inspection tests retain chronological evidence and choose the latest terminal even with an incomplete trailing record.
- Updated the focused runner for the installed TypeScript 7 API. Existing esbuild handles transpilation; Babel identifies function spans and TypeScript's scanner preserves all six original Jev token hashes. No compatibility fixture hashes changed.
- Enforced monotonic per-operation deadlines before dispatch and result admission, not only via timer callbacks. Both deterministic-clock regressions failed before the fix and pass afterward.
- Bound lower deployment caps against actual pinned engine buckets as well as eager 64-token padding. Two graph-path regression cases failed before the fix; eager and graph positive/negative cases now pass without loading a model.
- An unmapped Linux UID crashed import of host policy via top-level `userInfo()`, even with the experiment off. Actual Docker UID 12345 and a portable child-process regression reproduce the pre-fix failure; both pass after account lookup failure leaves host approval unavailable without trusting `HOME`.
- Awaited SDK example disposal, added shipped user guidance and one Unreleased Added entry. Released changelog sections are untouched.
- Applied required Biome formatting/import fixes only to candidate files, and replaced an implicit observation type and unused test binding. No suite configuration, retry policy or shared timeout was changed.
- The unchanged documentation architecture test rejected a new standalone guide route. Integrated the guidance into existing `tools.md` instead; no route list or test expectations were changed. The focused architecture rerun passes all 29 tests.

## Command evidence

Logs and rerunnable command scripts are copied to `/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/5a2fa852` (private directory). Working logs/runtime/assets are under `/tmp/atomic-decider-validation`. Node is v25.9.0, npm 11.12.1, Python is the installed `python`. System Bun 1.4.0 was below the repository floor, so `npm install --prefix /tmp/atomic-decider-validation/runtime --no-package-lock --no-save bun@1.4.2` installed a private runtime. Subsequent repository commands prepend `/tmp/atomic-decider-validation/runtime/node_modules/.bin` to `PATH`, leaving system Bun and repository dependency manifests unchanged. Node differs from CI's Node22 but meets engines; this is not asserted as a failure cause.

| Required command | Result and evidence |
| --- | --- |
| `npm ci --ignore-scripts` | Exit 0, 567 packages, no reported vulnerabilities; `install.log`. No dependency files changed afterward. |
| `npm run build` | Initial exit 2 exposed candidate type/library errors; frozen repaired code exits 0 in `build-account-fix.log`. |
| `npm run check` | Frozen code exit 0 in `check-closure.log`, including Biome, root/package typechecks and shrinkwrap. Earlier interrupted attempt has no exit claim. |
| `node --test scripts/decider-investigation.test.mjs` | Frozen code: macOS 38 pass, 12 platform skips (`focused-account-fix.log`); Linux 50 pass, no skips (`linux-focused.log`), exit 0. |
| `(cd scripts/decider-investigation-service && python -m unittest -v test_contract)` | Exit 0, 12 tests; `service-final.log`. No Python code changed afterward. |
| `(cd scripts/decider-investigation-evaluation && python -m unittest -v test_evaluation)` | Exit 0, 7 tests; `evaluation-final.log`. No evaluation code changed afterward. |
| `python scripts/decider-investigation-evaluation/replay.py scripts/decider-investigation-evaluation/fixtures/replay.jsonl --output /tmp/atomic-decider-replay.j69ZyR/replay-report.json` | Exit 0; private mode-0700 directory, JSON semantically equal to checked-in report, 4 invoked, `contains-fixtures`, `rolloutApproved: false`. Fixtures unchanged. |
| `npm run test:unit` | Latest complete run before final account-lookup guard: exit 1, 9932 passed, 23 skipped, 4 failed; `test-unit-retry.log`. Three default-tools 30s timeouts plus baseline missing docs/mcp.md. Final whole-root green remains unproven. |
| `npm run test:integration` | Frozen code exit 1, 1157 passed, 12 skipped, 4 failed; `test-integration-closure.log`. Packed consumer output byteCount 4 versus 14, one prompt-node 30s timeout and two retained-workflow 60s subprocess timeouts. Required installed-package gate remains red; the packed-child failure was subsequently traced to test-mode predicates folded into generated bundles, as detailed below. |
| `npm run test:ci-contracts` | Frozen code: exit 0, 115 tests across 18 files; `test-ci-contracts-retry.log`. |
| `npm run test:scripts` | Frozen code exit 0, 121 passed, 12 Linux-platform skips; `test-scripts-closure.log`. |
| `npm run test --workspace=@bastani/atomic` | Frozen code exit 1, 4826 passed, 52 skipped, 104 failed across 22 files; `package-retry.log`, exact failures in `package-failures.txt`. Timeouts, cleanup/persistence fallout and baseline docs/mcp.md mismatch remain unresolved. |

The Linux command mounts this checkout read-only into cached `node:25-bookworm`, whose runtime is Linux arm64 with Python 3.11.2. It installs only `esbuild@0.28.2` in the disposable container's `/tmp`, selects its Linux binary via `ESBUILD_BINARY_PATH`, and runs the unchanged focused command. `linux-suite.sh`, `linux-focused.log` and `linux-focused.exit` preserve the exact command and exit 0. This exercises actual openat2 file access, source/symlink replacement, hook denial, binary/UTF-8/CRLF behavior, scan/enumeration budgets, audit persistence and the evaluation baseline. It does not exercise a live model or claim GPU preemption.

Supplemental `qlty metrics --no-upgrade-check --functions` on `host.ts` and `trace.ts` and `qlty smells --no-upgrade-check` on `common.ts`, `host.ts`, `trace.ts` exited 0. The existing `.qlty/qlty.toml` was preserved. Qlty reports existing host complexity, not a correctness failure; no speculative restructuring was made. Biome remains authoritative. An earlier metrics attempt hit a 10-second observation timeout; the complete rerun is in `qlty-final.log` and `qlty-smells.log`.

## Acceptance matrix

| Literal requirement | Current evidence or remaining gate |
| --- | --- |
| Required candidate/base and pinned Decider identity; no mutation of Decider checkout | Git parent/ancestry and seven blob identities verified as above. |
| Read full instructions and feature/evaluation/conformance docs; treat candidate as unverified | Build, runner, accessor omission and deadline/padding defects reproduced before repair. |
| Inspect all changed code and existing host/tool conventions | Source inspection and independent read-only audit; shared ordinary/nested hook helpers preserve ordinary dispatch arguments. |
| Preserve Jev behavior/public contracts except shared extraction | Original six token hashes unchanged; singleton and duplicate-key Jev parsing tests pass. Full Jev/router suites are included in required root unit command; completion result below. |
| Clean install | Exit 0, exact command above. |
| Build | Exit 0 after repair. |
| Biome, root/package typechecks, shrinkwrap | Exit 0 after repair. |
| Focused Node conformance | Linux 50/50, including installed TypeBox and missing-account default-off regression. macOS 38 pass/12 platform skips. |
| Python service conformance | 12/12, fake backend only; no live inference claim. |
| Python evaluation conformance | 7/7. |
| Private fresh replay and semantic comparison without rewriting fixtures | Exact JSON equality; rollout remains false. |
| Complete root unit, unchanged | Red and not final whole-root green; exact latest complete-run failures above. |
| Complete root integration, unchanged | Frozen code exit 1; four failures including installed-package parity remain objective-relevant and unresolved. |
| Complete CI contracts, unchanged | Frozen code 115/115, exit 0. |
| Complete script suite | Frozen code exit 0, 121 pass/12 platform skips. |
| Complete coding-agent package suite | Frozen code exit 1, 4826 pass/52 skip/104 failures; not acceptance-ready. |
| Explicit Jev/router and installed-package identification | Root includes `jev-tournament`, `jev-stored-auth-routing`, `structured-output-provider-contracts`, `router-output-repair`, `workflow-router*`, `subagent-model-router*`; these passed in the complete root runs. Package `model-runtime-jev-auth` passed in the frozen complete run. Final integration includes `installed-package-node-extensions`: its packed consumer parity FAILED; do not substitute the earlier passing run. |
| Default off and unsupported-platform non-registration | Host returns before config/probe on non-Linux; missing/disabled config or unavailable OS account returns no tool. Actual unmapped Linux UID and portable account-failure regression pass. Built SDK macOS smoke confirms tool absent and canonical read/search active. |
| Strict host-only config and secrets | OS-account home, owner/private-mode/outside-repository checks, closed config and dedicated token reference; negative config/secret tests. No project setting enablement or TypeSafe forwarding. |
| Canonical guarded dispatch and hook identity | Live canonical read/search definition and session/runner checks, shared hook helpers, parent/operation IDs; denial, failure-event and mutation tests pass. |
| Read-only Linux openat2 confinement | Actual Linux arm64 tests pass; root-relative openat2 denies symlinks/magic links/mount crossings and opens content read-only. |
| Bounded parsing/transport/audit | Strict JSON/depth/body/state limits, source screening, mandatory persisted action-start before dispatch, bounded scans and evidence, service HTTP/queue tests. |
| Cancellation/concurrency/deadlines | Busy session refuses without queue, release permits new invocation; abort throws, never normal handoff; monotonic local and total deadlines; service rejects queued/late replies and serializes running inference. |
| No Jev/cloud fallback or false task completion | Only explicit loopback Decider backend; every ordinary result `taskComplete: false`; handoff/error tests. |
| Rollback configuration/code only | Configuration generation rechecked before dispatch; documented disable/restart/cancel, no migration or tool-created repository edits. |
| User docs/changelog policy | Shipped `docs/tools.md` investigate_code section, repository operator/conformance guides updated, single Unreleased Added item; no released changes. Unchanged docs architecture test passes 29/29. |
| Exact commands/exits/final commit; issues tracking; clean tree | Final SHA/status belong to receipt; unresolved failures remain in `issues.md`, not deleted or disguised. |
| No production profile, fabricated calibration/performance, implicit model downloads, or PR | No production profile or weights added to this checkout; fixture report unchanged and explicitly synthetic. The later user-authorized runtime attempt is separate from feature enablement. No PR creation. |
| Missing empirical gates reported, not made prerequisites | Initially no model/tokenizer assets existed in supplied checkout. The amended attempt below materialized an immutable snapshot outside it, but no suitable CUDA runtime exists and strict CPU smoke timed out. Held-out A/B/C, Atomic calibration/profile selection, task non-inferiority, latency gains and rollout approval remain unperformed. |
| User amendment: local Decider startup/discovery and bounded live smoke | Independent runtime worker's observed readiness, exact manifest and failed two-second smoke are recorded below. No global enablement or rollout claim. |
| Fresh reviewers and final acceptance | Reserved for workflow reviewers/reducer. Implementation evidence does not grant approval. |

## Interfaces and state transitions

No public return shape was redesigned. Results remain plain objects with `schemaVersion: 1`, `outcome: "handoff"`, literal `taskComplete: false`, evidence array, nullable unknown omitted-match count, counters and trace ID. Inputs keep the existing closed objective/optional diagnostic/seed/literal-term schema. Existing explicit path normalization, candidate deduplication and priority/path/line/term ordering remain unchanged; raw objective/diagnostic/literal terms are not newly rewritten. Empty/omitted optional inputs, duplicate candidates, singleton/no-candidate behavior, invalid IDs, ties and strict provider duplicate-key rejection retain existing tests. Jev retains its separate permissive JSON behavior. Static TypeBox repair preserves the exact dynamic runtime `anyOf` schema.

Legal invocation flow is idle → preparing → deciding → guarded action → evidence → deciding/handoff, or error/cancelled from an active state. A second active session invocation is illegal and returns busy without a queue. Unknown/denied actions never dispatch; every dispatched failure consumes an action, pre-dispatch refusal does not. Configuration/source changes stop admission. A terminal trace is returned or cancelled; interrupted/error-only traces are incomplete and never resumed. Trace inspection preserves evidence order and chooses the most recent terminal. Service states are not-ready, ready-idle, one-running plus at-most-one-queued; overload refuses and cancellation/deadline discards queued or late results without overlapping a still-running scorer.

## Unresolved and deferred

The root metadata and package system-prompt tests still require `docs/mcp.md`, but that path was removed by the required base's merged documentation PR #3119. This is an unrelated base code/test mismatch, not an environmental failure, and no test or base documentation was rewritten to hide it. Qlty's host complexity is deferred as out-of-scope refactoring.

The installed-package failure is no longer unclassified. The unchanged packed `children` fixture reproduces byteCount 4 instead of 14 at `test/fixtures/consumer-parity.mjs:371`. The generated subagent bundle has folded the runtime `NODE_ENV === "test"` predicate to `true`, selecting the fake-session result `done` rather than `child complete`. Restoring only that predicate in a private installed bundle passes the byteCount assertion and exposes an analogous folded workflow predicate, causing the questionnaire assertion at line 381 to fail. Restoring both predicates only in the temporary installation makes the unchanged entire children fixture exit 0 twice, as reported by the debugger; the retained repeat exit file independently records 0. This classifies the immediate generated-artifact cause, not a repaired repository or a green full integration suite.

Both source predicates and `packages/coding-agent/scripts/copy-builtin-packages.ts` are unchanged from required base `b2727b019`. The Bun 1.4.2 probe emits `|| true` under `NODE_ENV=test` and `|| false` under production or unset environments. The exact process that produced the observed test-baked bundles remains unproven. No branch-source correction is inferred from this evidence, and all required red gates remain unresolved. Archived `packed-children-before.log`, `packed-children-after.log`, `packed-children-both-after*.log`, `packed-children-both-after-repeat.exit`, `bundle-env-probe.log` and `packed-children-reproduce.sh` preserve the observations and repeatable isolated procedure. The evidence-only follow-up launched no build or test retries; the existing commit hook automatically ran `npm run check` successfully, including its normal generated-data/typecheck steps. No executable source was edited.

The initial complete root suite had seven failures; the later complete retry retained three default-tools timeouts and the base documentation mismatch. Initial package execution had 53 failures; the frozen-code retry had 104. Timeouts persisted after separate suite commands were no longer overlapped; neither machine load nor Node version is asserted as their sole cause. Test names and errors are retained verbatim in the logs. A pre-closure integration retry was contaminated by rebuilding AI generated data while fixtures imported it (`amazon-bedrock.json` briefly absent); that attempt is not final evidence and is superseded by the closure run. No test-file serialization, worker cap, shared-timeout change or skip was introduced.

## Contract amendments received

Original user amendments, verbatim (corrected by the controller):

> and you have access to the model here: /dev/decider

> You have access to spin up the local model at /dev/decider

The following longer relay is **controller interpretation**, not a user quote:

> User scope update: the local Decider model may be spun up from `/dev/decider`; on this machine the repository resolves to `/Users/martistaerfeldt/dev/decider`. Do not treat live inference as unavailable merely because weights were not found inside the Git tree. Determine the repository's supported local startup path and available runtime/model cache, then attempt a bounded live service + smoke/integration invocation against pinned source revision `a59466dc52f3ad5cc75758f80a4fa0109fd56b08`. Network/model download is authorized only insofar as the documented Decider startup requires it; retain exact model/tokenizer revision and deployment fingerprint evidence, do not substitute mutable or uncalibrated assets, and do not enable the Atomic feature globally. If hardware/runtime or exact revision constraints make the attempt impossible, preserve exact evidence and report the blocker. This adds live compatibility evidence; it does not authorize production thresholds, empirical A/B/C claims, or rollout approval.

Under that controller interpretation, the additional gate is supported-startup and available runtime/cache discovery plus a bounded live service/smoke attempt against pinned source. Exact model/tokenizer revisions and fingerprint remain mandatory; no mutable substitutes, global feature enablement or rollout/A-B-C claims. Network/model downloads are authorized only as documented startup requires. The parent assigned this independent work to another worker; its logs were read and incorporated below. Earlier no-assets observations describe the initial local checkout.

## User-authorized live attempt

The independent runtime worker used a private Python environment and materialized actual regular snapshot files outside both repositories. Its logs show the following:

- Model/tokenizer: `Mapika/decider-2b`, immutable revision `b37f7e1ba3fbc9238004cf531fabbee2619973fd`. The fitted `temperature: 1.3` was copied from upstream metadata, not calibrated in this run.
- Decider imported source passed all pinned blob checks at `a59466dc52f3ad5cc75758f80a4fa0109fd56b08`. Imports used `PYTHONDONTWRITEBYTECODE=1`; Decider Git status remained clean.
- Manifest: `/tmp/atomic-decider-validation/live-deployment.json`; snapshot: `/tmp/atomic-decider-validation/live-model`; lock: `live-runtime.lock.txt`.
- Deployment fingerprint: `c6a7af49c5da0eddebecee1b17ac53ba7cfe4a5d6441c24b03f15db59b89f271`. CPU, float32, graphs disabled, Python 3.13.5, torch 2.14.0, transformers 5.17.0. CUDA is unavailable on this M2 Max host. The manifest calibration reference points to immutable upstream evaluation metadata, not an approved Atomic profile.

The unchanged service command was:

```sh
/tmp/atomic-decider-validation/live-env/bin/python scripts/decider-investigation-service/server.py \
  --snapshot /tmp/atomic-decider-validation/live-model \
  --manifest /tmp/atomic-decider-validation/live-deployment.json \
  --bind 127.0.0.1 --port 18743
```

Authenticated readiness returned `ready: true` and the exact fingerprint above after loading and warm-up. The unchanged smoke command was:

```sh
/tmp/atomic-decider-validation/live-env/bin/python scripts/decider-investigation-service/smoke.py \
  --manifest /tmp/atomic-decider-validation/live-deployment.json \
  --endpoint http://127.0.0.1:18743/v1/systemone
```

It exited **1**, `TimeoutError` while awaiting the POST response at the unchanged two-second deadline. The service was stopped afterward, with process exit -15. `live-service-smoke.log` and `live-server.log` retain the readiness, exact commands and failure. The server reported reference-kernel fallbacks. This proves startup/readiness on the discovered CPU runtime, not a passing live smoke, latency gain, calibrated Atomic profile or rollout approval. No deadline was raised and no global tool configuration was enabled.

## Closure

All listed complete suite commands were executed without changing their tests/configuration. Not all gates passed, and the whole-root unit suite was not rerun after the last account-lookup guard. The final integration and package results remain red; source-validation acceptance is **not ready**. Independent diagnosis/review and resolution of the exact required failures remain necessary. The last changes after frozen-code validation are this receipt and `issues.md`, not executable code. The conventional repair commit and clean status are recorded in the workflow receipt and durable Git evidence; no PR was created.
