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

Repository-specific full-task/verifier drivers are intentionally supplied by the evaluator:
there is no supplied issue corpus, eventual fix, main-model account or verified task-outcome
oracle in this implementation environment. The protocol test executes fixture subprocesses
for all three arms and verifies label isolation; it is not a live Atomic end-to-end run.

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
