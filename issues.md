# Unresolved Decider source-validation gates

Acceptance matrix: `docs/experimental/decider-investigation-validation.md`.
Round2 evidence: `/Users/martistaerfeldt/.atomic/agent/sessions/--Users-martistaerfeldt-dev-atomic-decider-investigation--/subagent-artifacts/validation/25021dd4`; working logs `/tmp/atomic-decider-round2`.

## Required gates still red

- Latest complete root unit run, isolated HOME and Node22.19/Bun1.4.2: exit1,9928passed23skipped8failed. Seven30s timeouts across default-tools-setting, install-shell, interactive-mode-keybinding-lifecycle, structured-output-session-isolation and subagents-fork-context-session-model; interactive-engine-shortcut-reload missed its second shortcut before the bounded assertion. `unit-isolated.log` retains exact names/errors. Earlier relocated-runtime run had one default-tools timeout; no complete green claim.
- Latest complete coding-agent run, same isolated environment: exit1,4910passed52skipped20failed. Eighteen30s timeouts across runtime events, shell wait, Herdr reload, deferred startup and runtime replacement; credential-print returned exit2 rather than5 and detached bash output lacked TICK30. `package-isolated.log` retains exact names/errors. Both latter unchanged cases pass together in2.79s in `timing-narrow.log`; this is diagnosis, not passing full validation.
- After full runs ended, unchanged default-tools and shortcut files passed all ten tests in 72.60s (`root-timing-narrow.log`). This includes every default-tools scenario and the missed shortcut; it is not a replacement for the failed full-root gate.
- Host load116 on12CPUs and Jiti import-resolution CPU cost were observed. No blanket environmental cause is proven. No timeout increases, worker caps, file serialization, new skips or assertion weakening were applied. Existing-test edits remain restricted to the user-approved stale MCP expectations; further test-duration changes require a scope decision.
- Earlier exact-source CPU live service reached authenticated readiness, but unchanged two-second smoke timed out. No CUDA on host; no live inference/calibration/rollout success claim. Earlier immutable revision/fingerprint and logs remain in prior archive5a2fa852.

## Resolved round2 findings

- Fatal UTF8 unfinished response is cancelled before reader release. New adapter/real-HTTP regression failed before and passes after. Linux combined focused51/51, no skips.
- Exact bundle-contamination producer reproduced: native-builtin CI invokes builds under NODE_ENV=test. Both Bun.build boundaries now preserve runtime NODE_ENV predicates. Unchanged CI115/115 and complete integration1161pass12skip, including packed installed-package parity, pass.
- User selected "Correct stale tests (Recommended)": only metadata/system-prompt MCP topic strings changed to mcp-servers. Compatibility-file/prompt attempt removed; architecture and substantive assertions preserved.
- Personal four ~/.agents skills caused SDK expected0/actual4 assertions. Unchanged narrow test fails with real HOME and passes with isolated HOME. No user resources changed. A doctor test's /private regex false-positive on process.execPath disappeared after moving the identical private Node22 executable to user cache.
- Clean install/build/check, service12, evaluation7, replay equality, CI115 and scripts122pass12platform skips all pass on repaired code. Synthetic fixtures and released changelog sections unchanged.

Keep this file until required validation failures are resolved. No PR created.
