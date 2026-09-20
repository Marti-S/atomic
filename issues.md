# Remaining local inference capacity qualification

All required repository gates now pass on the frozen combined loader/MPS implementation: root9936, integration1161, CI115, scripts122 and package4943 passed; platform skips are unchanged. Historical root1/package19 and the initial cache-miss installation network failure are resolved. Exact results and acceptance matrix: `docs/experimental/decider-investigation-validation.md`.

The unchanged strict live smoke passes with explicit MPS eager float32 and exact pinned source/model/tokenizer. An existing explicit1,024-token manifest passes sampled first/warm maximum-token/33-option requests, rejecting1,025tokens rather than truncating. No profile or global feature setting was installed.

**Default8,192-token deadline qualification remains open.** Actual2,048/8,192-token requests exceed the unchanged two-second deadline on this M2 Max configuration. The default cap was not reduced. Supporting an uncompromised8,192-token workload requires a demonstrated compatible accelerator/runtime configuration meeting that deadline; the pinned accelerated graph path requires CUDA hardware/runtime absent here. No particular GPU is proven sufficient, no remote purchase was made, and no exhaustive impossibility proof for future MPS optimization is claimed.

Evidence: private archive `subagent-artifacts/validation/086c30b2/inherited/mps-runtime`, including exact manifests, runtime/source identity, cold/startup/first/warm timings and failed larger-shape probes. This limitation must not be relabeled as a passing full-cap deployment, calibrated profile or rollout approval. Keep this issue until full-cap qualification is resolved or the user explicitly accepts the bounded deployment as the complete requested outcome.
