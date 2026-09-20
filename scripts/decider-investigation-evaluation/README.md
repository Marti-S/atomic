# Decider investigation evaluation

These runners support the specification's third change set. **Checked-in data are synthetic
contract fixtures, not measurements of Decider or current Atomic.** They cannot produce an
approved deployment profile or establish non-inferiority.

For live runs, record the manifest's exact device, dtype, runtime fingerprint and token cap.
The standalone service supports explicit MPS eager float32; graph execution requires CUDA.
Separate startup/readiness time from first post-readiness and warm request time, retaining
the existing request deadline. Report cap rejections and deadline failures, never omit or
truncate them. A passing smoke or lower-cap deployment is not a calibrated profile or proof
of success at the default 8,192-token capacity. See the [operator guide](../../docs/experimental/decider-investigation.md).

## Reproduce the offline report

From the Atomic root:

```sh
python scripts/decider-investigation-evaluation/replay.py \
  scripts/decider-investigation-evaluation/fixtures/replay.jsonl \
  --output /absolute/private/replay-report.json
(cd scripts/decider-investigation-evaluation && python -m unittest -v test_evaluation)
```

The fixture population contains three eligible evaluation cases, one predeclared exclusion,
and a separate tuning case. It exercises multiple useful next actions, missing candidate
coverage, uncertainty, cold/warm service and an outage. `replay-report.json` is the reproducible
result. Its invented latency values exist only to test reporting formulas.

## Declare the experiment before collecting results

Commit an experiment declaration outside evaluated repository snapshots. Fix the eligible
issue slice without looking at candidate coverage, a repository/issue-family split, task
and verifier versions, main model and prompt versions, Decider snapshot/profile versions,
retrieval budgets, allowed initial information, outage/overload cases and cold/warm service
conditions. Never tune thresholds on evaluation labels. Keep multiple useful-action labels;
matching a single historical LLM action is not the sole correctness condition.

Each replay JSONL row uses this shape (see the full fixture for runnable data):

```text
schemaVersion: 1
id, repository, issueFamily, split: "tuning" | "evaluation"
eligible: boolean, exclusionReason: string | null
measurementKind: "live" | "fixture"
runs: { A?, B?, C? }
decisions: [{ candidateIds, usefulIds: string[] | null, selectedId,
              rawProbabilities, minTopProbability, minTopTwoMargin, admitted }]
```

`usefulIds` may include useful operations that were NOT in `candidateIds`; otherwise candidate
coverage would be tautological. An empty label set is distinct from an unreviewed `null` set.
Raw probabilities must obey the four-decimal compatibility contract. A decision's admission
must agree with its explicit profile, including tie and handoff rules.

Each run includes `status` (`completed`, `timeout`, `error`), independently verified
`verifiedSuccess` (`true`, `false`, or `null`), `evidenceUseful` with the same nullable semantics,
`investigationMs`, `totalTaskMs`, `llmTurns`, `tools` (retrieval actions), `bytesScanned`,
`evidenceBytes`, `handoff`, and `serviceState` (`not_applicable`, `cold`, `warm`, `outage`,
`overloaded`). Unknown metrics remain null. Do not convert unknown verification into success.

## Three arms and bounded task drivers

A is the unmodified current Atomic workflow. B is deterministic batched retrieval using the
same access/output budget. Its reusable implementation is
`core/investigation/deterministic-baseline.ts`; it shares the candidate builder, repository
facade, secret screening, access checks and audit boundaries, but performs no inference.
It is evaluation-only, never registered and never used as a provider fallback. C is the
Decider-controlled tool followed by the normal main-model continuation.

Run all arms on independent, identically initialized workspaces with identical initial
information and a pinned, trusted verifier. A provider outage must not remove the invoked
case from the reported population. Run deliberate overload and cold/warm service scenarios.
The supplied `benchmark.py` bounds process groups, task deadlines and driver output:

```sh
python scripts/decider-investigation-evaluation/benchmark.py \
  --tasks /absolute/private/task-starts.jsonl \
  --drivers /absolute/private/driver-manifest.json \
  --output /absolute/private/measurements.jsonl
```

The driver manifest is trusted operator configuration, not model arguments:

```json
{
  "measurementKind": "live",
  "taskTimeoutMs": 60000,
  "verifierIdentity": "YOUR_PINNED_VERIFIER_REVISION",
  "drivers": {
    "A": ["/absolute/path/to/your-task-runner", "--arm", "A"],
    "B": ["/absolute/path/to/your-task-runner", "--arm", "B"],
    "C": ["/absolute/path/to/your-task-runner", "--arm", "C"]
  }
}
```

No shell is used. The task-start rows add `repositoryRoot`, `input` (the investigation input)
and `serviceState` to task identity/eligibility fields. Only a fixed allowlist of initial fields
is sent to each driver; labels, future observations and eventual fixes are excluded. Each
driver receives one JSON object on stdin and must return one JSON metric record on stdout,
including `measurementKind` and a nonempty independently auditable `traceRef`. Logs belong in
protected trace files, not stdout. The harness retains timeouts/errors as unverified cases.
It rejects reported retrieval/output budget violations and caps output at 1 MiB. Enforce the
access limits in the shared host facade as well; the harness is **not an OS sandbox for an
untrusted driver**, and cannot infer correctness from a driver's self-reported success flag.
Join independent verifier results and human useful-action labels before replay reporting.

When canonical native search does not expose scanned-byte telemetry, retain `bytesScanned: null`.
For this protocol, budget enforcement may instead use `chargedBytes`: debit the full explicit
regular-file scope before every retrieval operation, equally across all arms. This is a
conservative scan upper bound, not a measured number of bytes scanned. A null scan metric
requires a numeric charge within the scan budget, `accountingMethod: "full_scope_precharge"`,
and `bytesScannedObserved: false`; legacy numeric measured rows remain supported.
`evidenceBytes` must always remain numeric and authoritative. Precharge time belongs in the
timed operation. Full-scope charging can exhaust a budget earlier than an actual small read
would: this conservative bias must be the same in every arm. Record this limitation
in the private predeclaration, operation traces, and final report; do not infer actual scan
cost or scanned-byte savings from charges. This does not authorize production instrumentation
or a duplicate scanner.

The corpus, main-model account and independent task-outcome verifier remain evaluator-supplied
and private. The protocol test executes fixture subprocesses for all three arms and verifies
label isolation; it is not itself a live Atomic end-to-end run.

## Evaluation-only macOS SDK driver

`evaluation-only-driver.mjs` is an explicit CLI, not an extension or production registration.
It imports only this checkout's built SDK/controller/transport/canonical tools. Build first:

```sh
npm run build --workspace=@bastani/atomic
node --test scripts/decider-investigation-evaluation/*.test.mjs
(cd scripts/decider-investigation-evaluation && python3 -m unittest -v test_evaluation)
```

Use the same command for all three trusted manifest arms; the harness supplies `arm` on stdin:

```text
node /absolute/source/scripts/decider-investigation-evaluation/evaluation-only-driver.mjs \
  --evaluation-only /absolute/private/driver-config.json
```

The private configuration supplies `outputRoot` (a private directory outside source/evaluated
snapshots), `scopePaths` (explicit regular files), `scopeHashes` (UTF-8 SHA-256 by relative path),
`authPath`, `modelsPath`, `provider`, `model`, `thinkingLevel`, `sourceCommit`, `endpoint`, and
the existing full evaluation `profile` accepted by `effectivePolicy`. Credentials are read
into an in-memory store, never copied into task snapshots. Start a separately owned, ready
local service with its exact private manifest and pass its ephemeral token through
`ATOMIC_DECIDER_SERVICE_TOKEN`; the driver does not start/download a model or write global
configuration. Fingerprints must match that manifest, not a profile's human-readable name.

Each invocation creates a fresh read-only, hash-checked file copy, private agent/model-store
directory, in-memory settings and session. No installed CLI, global resource registration,
Linux platform gate or openat2 implementation is changed. Scope confinement uses stat/realpath
checks on evaluator-owned immutable copies: **not an OS sandbox or Linux security equivalence**.
Source identities in controller observations are empty rather than invented native-read
telemetry; file-copy hashes and version checks are retained separately.

A exposes canonical `read`/`search` behind the common scope/budget wrapper, with no Decider
interception. B additionally exposes the existing deterministic controller as `investigate_code`;
C exposes the real Decider controller/transport. Both internal paths use SDK permission/result
hooks. All arms share the prompt, configured main model, first-tool-start retrieval deadline,
access/output bounds and canonical implementations. Before evidence acceptance, the common
wrapper rejects oversized read output (bytes or actual returned numbered source lines, including
bare paths and neighboring context), excess search matches and excess explicit entries. It never
clips evidence to fit. Invalid/failed calls stay in the private hook trace; `tools` counts admitted
retrieval attempts, not every attempted tool call.

`minimalInputSchema: true` is only for a **separately declared feasibility cohort** with one
seed path and no line selector: its closed schema binds that seed and objective to the given
initial input. It does not substitute a tool call or consult verifier labels. Declare this
interface difference before calls and never merge its results silently with flexible-input
cohorts. Preserve model skips, added terms, uncertainty, overflow and errors as outcomes.

Trace events include main-model turn starts, SDK hooks, charged retrieval starts, accepted
canonical text and controller decisions/handoffs. `llmTurns` counts SDK turns, not underlying
provider network retries. `evidenceBytes` is accepted canonical text, excluding result-envelope
metadata. `investigationMs` spans setup through the last top-level tool completion;
`totalTaskMs` includes continuation and disposal. Both include snapshot/precharge overhead.
The controller's legacy numeric `budgets.bytesScanned` receives the conservative debit;
exported metrics/decision trace budgets retain actual `bytesScanned: null` and label the charge.
Never call that compatibility budget field measured telemetry.

Join verifiers in a separate process after execution; the driver emits `verifiedSuccess: null`.
Distinguish declared cold/warm scheduling from actual first/subsequent Decider requests, and
mark runs that never contact the service separately. Retain raw traces when adding derived
annotations. Capacity sweeps require their own frozen rule/tasks and fingerprinted manifests;
never silently raise the pinned service cap/deadline or infer universal capacity from a few
successful requests. Pilot reports, labels, traces and capacity selections stay private.

## Metrics and decision rule

`replay.py` rejects repository/issue-family leakage across splits. It reports all invoked
cases, exclusions and reasons, missing arms and unverified outcomes; candidate coverage is
separate from accepted-selection utility. It includes p50/p95 investigation/total-task
latencies, LLM turns removed, extra retrieval actions, evidence usefulness, handoffs and
service-state subgroups. Every aggregate carries its sample count or numerator/denominator.
Missing candidate labels are reported, not silently scored as correct.

The predeclared confidence interval is a paired percentile bootstrap: resample repositories
with replacement, retain all paired tasks within each sampled repository, compute task-weighted
C-minus-A verified-success differences, 10,000 replicates, seed 20260920, 2.5th and 97.5th
percentiles. Fewer than two repository clusters produces no interval. Do not change these
choices after inspecting results without declaring a new analysis.

Proposed metric gates are at least 95% useful-candidate coverage, 30% decision admission,
lower 95% paired-success bound at least -0.02, and at least 20% median investigation latency
improvement over A with value over B. p95 and full-task regressions remain separate explicit
review items. The reporter never sets `rolloutApproved: true`: metric gates cannot replace
safety/conformance testing, appropriate sample-size/cluster review, profile provenance or
human approval. Synthetic or incomplete populations cannot pass all metric gates.
