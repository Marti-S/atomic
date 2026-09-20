# Conformance and validation ledger

This matrix identifies code and test evidence, not live-model qualification. Main-model diagnosis,
implementation and final-answer responsibility remain outside this tool. Current checkout
validation and unresolved gates are recorded in [source validation](decider-investigation-validation.md).

| Requirement | Implementation / CPU evidence | Remaining validation |
| --- | --- | --- |
| Default off / host-only enablement | `host-policy.ts`, host registry; absent config, unsafe config location, owner/mode, repository approval, argument-closure tests | Full installed-package and Bun startup tests |
| Jev isolation | Shared helpers plus unchanged existing auth/parser/tournament function-token regression, singleton and default parser checks | Unchanged complete upstream Jev/router repair suites |
| One-shot local decision / no fallback | `decider.ts`, `decider-transport.ts`; installed TypeBox runtime, malformed IDs, duplicate JSON, usage, mass, confidence, fingerprint and HTTP tests | Live model/transport with approved deployment |
| Exact state and candidate set | `controller.ts`, `candidates.ts`; state/wire caps, deterministic ordering, provenance, zero/one/overflow, closed input, literal terms | Real held-out useful-candidate coverage |
| Admission / budgets | Controller/profile tests; ties, threshold failures, five-action/request limits, dispatched failures, no-progress, monotonic local deadlines and late pre-dispatch rejection | Loaded-host wall-clock and GPU latency characterization |
| Canonical guarded dispatch | Shared ordinary/nested hook functions, host identity checks, parent IDs and actual args; denial/result mutation tests | Complete AgentSession integration/host extension regression suite |
| Read-only confined filesystem | Linux arm64 `openat2` worker; real file, binary, exclusion, symlink/directory replacement, source-version, UTF-8/CRLF, scan/entry cap tests | Loaded-filesystem race stress; unsupported platforms stay disabled |
| Cancellation / session concurrency | Abort/deadline tests and session lock; service queue cancellation/late GPU result tests | Real GPU disconnect behavior and host process shutdown |
| Evidence / audits | Exact excerpt hashes/lines, bounded matches, unknown omission counts, secrets, action-start audit failure and incomplete restart tests | Installed-session retention/inspection UX |
| Strict compatibility service | Exact token-item construction, no truncating builder, eager and graph-engine padding bounds, metadata/startup/runtime checks, bounded HTTP/queue tests | Pinned weights, tokenizer and runtime; live smoke invocation |
| Evaluation | Deterministic retrieval function, replay fixtures/report, clustered bootstrap, budgeted task-driver protocol and leakage tests | Real A/B/C task drivers/corpus, independent verification, held-out profile selection and pilot gates |

Explicit MPS eager deployments are covered by service tests for accelerator/OS identity,
unavailable-runtime rejection, drift before model loading and CUDA-only graph restrictions.
The current source-validation ledger records actual pinned MPS smoke and bounded-shape
observations separately from synthetic replay. These do not qualify every allowed shape,
loaded-host latency or a production profile. Standalone macOS service support does not change
Linux-only repository-tool registration.

## Original delivery environment (historical)

The original patch was developed against exact fetched source files from Atomic
`b2727b019c25c93e63dbb4645cf45bbe8a87ecbb`. A full Git clone and dependency installation were
not available in the execution environment. The three modified existing files were reconstructed
and checked against their Git blob identities before modification; other implementation files
are new. The delivered unified patch is checked against those exact original files.

Executed checks include the Node CPU conformance suite, Python service/evaluation suites,
syntax transpilation, and strict standalone TypeScript checking of the dependency-independent
controller/policy/transport/accessor modules. This is **not** a successful full Atomic build,
Biome check, TypeBox runtime test or complete workspace regression run. No weights or GPU
were available; no live inference or real task benchmark is represented by the fixture report.

No production threshold, checkpoint, calibration claim or broader rollout approval is supplied.
A source review and the remaining validation above are required before calling the feature
release-conformant or performance-qualified. Follow the setup/rollback procedure in
[the feature guide](decider-investigation.md).
