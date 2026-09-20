# Unresolved Decider source-validation gates

Acceptance matrix: `docs/experimental/decider-investigation-validation.md`.
Round2 evidence: `/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/25021dd4`; working logs `/tmp/atomic-decider-round2`.
Latest coordinated candidate9ecaea97 evidence: sibling archive `8df57b4a`; working logs `/tmp/atomic-decider-final-8df57b4a`.

## Required gates still red

- Latest complete root unit run on candidate9ecaea97, isolated HOME and Node22.19/Bun1.4.2: exit1,9935passed23skipped1failed. `default-tools-setting > preserves explicit tool option precedence over the setting` timed out at30s. `unit.log` retains exact error; total449.63s. This supersedes the earlier root8 result, not the failed gate status.
- Latest complete coding-agent run on the same candidate/environment: exit1,4914passed52skipped19failed. All19 are30s timeouts across runtime events, shell wait, Herdr reload, deferred startup, SDK builtin parity and runtime replacement. `package.log` and `package-failures.txt` retain exact names/stacks; total579.23s. OAuth and detached-output cases no longer fail in the complete suite.
- Exactly one root and one package command ran sequentially, without concurrent builds or further retries. Generated runtime predicates were inspected before execution. Prior integration1161/CI115/scripts122/focusedLinux51 green results are on the same production code, not rerun during this validation.
- Host load and Jiti import-resolution cost remain observations, not a blanket environmental cause. User selected "Keep dependency unchanged (Recommended)": no patch/fork/pin/lockfile or retained node_modules changes. Installed Jiti2.7.0 resolver bundle hash matches the offline cached package archive; manifests are unchanged. The single-comparison resolver proposal is deferred. No timeout increases, worker caps, file serialization or new skips were introduced.
- Earlier exact-source CPU live service reached authenticated readiness, but unchanged two-second smoke timed out. No CUDA on host; no live inference/calibration/rollout success claim. Earlier immutable revision/fingerprint and logs remain in prior archive5a2fa852.

## Resolved round2 findings

- Fatal UTF8 unfinished response is cancelled before reader release. New adapter/real-HTTP regression failed before and passes after. Linux combined focused51/51, no skips.
- Exact bundle-contamination producer reproduced: native-builtin CI invokes builds under NODE_ENV=test. Both Bun.build boundaries now preserve runtime NODE_ENV predicates. Unchanged CI115/115 and complete integration1161pass12skip, including packed installed-package parity, pass.
- User selected "Correct stale tests (Recommended)": only metadata/system-prompt MCP topic strings changed to mcp-servers. Compatibility-file/prompt attempt removed; architecture and substantive assertions preserved.
- Personal four ~/.agents skills caused SDK expected0/actual4 assertions. Unchanged narrow test fails with real HOME and passes with isolated HOME. No user resources changed. A doctor test's /private regex false-positive on process.execPath disappeared after moving the identical private Node22 executable to user cache.
- Clean install/build/check, service12, evaluation7, replay equality, CI115 and scripts122pass12platform skips all pass on repaired code. Synthetic fixtures and released changelog sections unchanged.

## Round3 scoped repairs and full-suite evidence

- User said "continue workflow" and separately approved the two fixture exceptions. OAuth now uses controlled HTTP rejection, retaining exit5/empty stdout/byte-identical auth assertions, plus a separate existing-deadline exit2 case. Focused two-case run passes; controlled pending HTTP reproduced the original assertion failure first.
- Detached-output test retains real post-exit process/pipe coverage with a controlled drain clock and all30ticks; new99ms/101ms cases cover re-arm/cutoff. Five cases pass, and private mutation checks fail as intended. Production timers/drain policy are unchanged.
- Focused evidence archive: `/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/bca2f72a`. Subsequent complete-suite archive8df57b4a records root1/package19, all timeouts. Required gates still fail; neither focused passes nor successful repaired cases imply acceptance.

Keep this file until required validation failures are resolved. No PR created.
