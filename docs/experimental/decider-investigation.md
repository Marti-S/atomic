# Decider-controlled code investigation — experimental v1

**Disabled by default. No production admission thresholds are supplied.** This is a local,
read-only evidence-gathering tool, not a chat provider or a replacement for the coding agent.
The main model calls `investigate_code` once and continues normally after receiving factual
source excerpts/search results. Every ordinary result has `taskComplete: false`.

## Source and deployment identities

Implementation target: Atomic `b2727b019c25c93e63dbb4645cf45bbe8a87ecbb` (the inspected
`Marti-S/atomic` main). The supplied design was based on the older Atomic
`96320adb61ac03d0bbd7e8d1c7c6819e29fac7c1`; this implementation follows the newer host's
`read` path-selector and regex-shaped `search` argument contracts.

Decider source is pinned to `a59466dc52f3ad5cc75758f80a4fa0109fd56b08`.
The companion checks Git-blob identities of its imported Decider implementation files.
Local model/tokenizer files, `decider_config.json`, fitted temperature, source/rendering/prompt
versions, hardware/runtime identity, and precision contract are bound into a SHA-256
deployment fingerprint. There is no default model checkpoint or automatic download.

Jev remains separate. Only common Choice compilation, bounded response reading and basic
value predicates are extracted. Its authentication, response parser, singleton behavior,
tournament planning, public APIs and router repair policy are not replaced. Notably, the
newer inspected Jev parser differs from the older specification baseline; no probability
mass rule is silently added to or removed from that parser. Decider's rounding tolerance
lives exclusively in its own adapter.

## Requirements and non-goals

Use the Atomic repository's declared Node/Bun versions and normal workspace install/build.
The production repository accessor supports **Linux x86-64 or arm64 with `openat2`, procfs,
and `/usr/bin/python3`**. Unsupported platforms do not register the tool. A startup-only
capability probe runs only after explicit host enablement. The fixed Python accessor is
embedded in the TypeScript build; a separate source file is retained for review/tests.
There is no shell command generation or shell interpreter invocation.

A persistent, host-owned session directory outside the repository is required for audit.
The local service requires Python 3.11+ and the pinned Decider implementation's dependencies.
CPU and accelerator inference require an explicit compatible manifest. On Apple silicon,
the standalone service supports MPS eager inference; repository-tool registration still
requires Linux and is disabled by default. Validate the selected runtime and request sizes
against the unchanged two-second request deadline.

V1 does not edit, execute tests/builds, install or call LSPs, run subagents, browse, use external
network tools, generate novel queries, implement Score/Noul, change `routerModel`, retry
inference, fall back to Jev/cloud, resume unfinished investigations, or train/calibrate a model.

## Set up the service explicitly

These are operator setup commands, never commands executed by `investigate_code`.
Choose a private directory **outside the investigated repository**. Materialize a local model
snapshot from a reviewed, full 40-character weights revision and tokenizer revision before
starting the service. Retain download provenance; do not pass a mutable model identifier to
the service. Snapshot files must be actual local regular files, not Hugging Face cache symlinks.
They must include safetensors, tokenizer files, model configuration and `decider_config.json`
with the evaluated fitted `temperature`. Do not substitute an unfitted default temperature.

```sh
python3 -m venv /absolute/private/decider-env
. /absolute/private/decider-env/bin/activate
# Explicit network-enabled installation, outside Atomic invocations:
python -m pip install 'decider @ git+https://github.com/Marti-S/decider@a59466dc52f3ad5cc75758f80a4fa0109fd56b08'
python -m pip freeze --all > /absolute/private/decider-runtime.lock.txt
```

Archive the environment lock alongside the evaluated deployment. Dependency resolution is an
operator setup step, not a universally tested dependency lock supplied by this patch. A second
machine must recreate the same lock, hardware/runtime and snapshot, or obtain a new profile.
The manifest checks installed package versions at startup rather than silently accepting drift.

From the patched Atomic checkout, create an immutable deployment manifest:

```sh
python scripts/decider-investigation-service/make_manifest.py \
  --snapshot /absolute/private/materialized-model \
  --output /absolute/private/deployment.json \
  --backend-id decider/decider-2b \
  --weights-revision FULL_40_CHARACTER_COMMIT \
  --tokenizer-revision FULL_40_CHARACTER_COMMIT \
  --calibration-reference /absolute/private/reviewed-calibration-report.json
```

The placeholders above are intentionally not runnable checkpoint choices. Supply the exact
revisions used in the held-out evaluation. `--use-graphs` is opt-in and requires CUDA;
graphs/dtype/device are fingerprinted. For an available named Apple MPS accelerator, add
`--device mps --dtype float32` to the manifest command and omit `--use-graphs`.
MPS identity includes the accelerator, macOS version and architecture. After any identity
change, regenerate and review the manifest rather than reusing a CPU or older MPS profile.

Use `--max-total-tokens` to declare a lower deployment limit when needed. The service rejects
overflow, including scoring-path padding, rather than truncating input. A lower limit does
not raise the request deadline or establish a production profile. Verify actual request shapes
with the selected runtime. The default limit remains 8,192 tokens.

The service token is not generated or persisted in this repository:

```sh
export ATOMIC_DECIDER_SERVICE_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
python scripts/decider-investigation-service/server.py \
  --snapshot /absolute/private/materialized-model \
  --manifest /absolute/private/deployment.json --bind 127.0.0.1 --port 8000
```

Keep the token in an appropriately protected host secret store/environment. Start Atomic
with that same dedicated token. Do not use a TypeSafe credential. The service binds only a
literal loopback address and accepts authenticated `GET /health/ready` and `POST /v1/systemone`.
It returns 503 until model loading and warm-up finish, serializes inference, permits one queued
request, and returns 429 when saturated. Disconnects/deadlines discard queued or late results;
an HTTP cancellation is **not** a claim that a running GPU kernel was preempted.
Startup and warm-up may take longer than two seconds while readiness remains false. Wait
for authenticated readiness before inference; each subsequent request still has the same
two-second deadline. Readiness alone does not establish that every allowed request size
will finish within that deadline.

Run the separately invoked live contract test against the already-running service:

```sh
python scripts/decider-investigation-service/smoke.py \
  --manifest /absolute/private/deployment.json
```

This makes one inference, no repository access. It checks identities/probabilities, not task
accuracy or performance gates. The service scores the exact validated state-first token item;
it never calls Decider's truncating `build()` or `system_one()` preparation path. The full item
and the selected scoring path's padding must fit 8,192 tokens or the lower declared deployment
limit. Eager collation pads to multiples of 64; the graph engine uses its pinned shape buckets.

## Approve a profile and enable a repository

Only the fixed OS-account-global file **`~/.atomic/decider-investigation.json`** is read.
The home directory comes from the operating-system account, not `HOME`, dotenv or project
settings. The file must be owned by that account, mode 0600, and outside the repository.
A missing file or `enabled: false` means no tool registration, credential resolution or service
connection. Loading a repository extension does not enable the feature.
If the OS account cannot be resolved, such as an unmapped container UID, the tool stays
unavailable without consulting `HOME` or raising a feature-specific startup error.

A reviewed profile must explicitly set both thresholds; neither has a universal default.
Use the service readiness metadata and the held-out evaluation's profile/provenance. All
identity fields must match the response. Fixture evaluation IDs are rejected by the production
host configuration loader.

```json
{
  "experimental": {
    "deciderInvestigation": {
      "enabled": true,
      "endpoint": "http://127.0.0.1:8000/v1/systemone",
      "backendId": "decider/decider-2b",
      "policyProfileId": "YOUR_REVIEWED_PROFILE_ID",
      "profile": {
        "id": "YOUR_REVIEWED_PROFILE_ID",
        "approved": true,
        "minTopProbability": "REPLACE_WITH_EVALUATED_NUMBER",
        "minTopTwoMargin": "REPLACE_WITH_EVALUATED_NUMBER",
        "backendId": "decider/decider-2b",
        "deploymentFingerprint": "REPLACE_WITH_64_HEX_FINGERPRINT",
        "weightsRevision": "REPLACE_WITH_PINNED_REVISION",
        "tokenizerRevision": "REPLACE_WITH_PINNED_REVISION",
        "configHash": "REPLACE_WITH_64_HEX_CONFIG_HASH",
        "temperature": "REPLACE_WITH_FITTED_NUMBER",
        "renderingVersion": "atomic-decider-state-first-v1",
        "questionVersion": "investigate-next-action-v1",
        "candidatePolicyVersion": "code-investigation-v1",
        "precision": "decider-four-decimal",
        "evaluationId": "YOUR_HELD_OUT_EVALUATION_REFERENCE"
      },
      "tokenSecretRef": "env:ATOMIC_DECIDER_SERVICE_TOKEN",
      "secretRefs": [],
      "approvedRepositories": [
        { "root": "/absolute/canonical/approved/repository", "scopePaths": ["src", "test"], "excludedPaths": [] }
      ],
      "limits": { "maxActions": 5, "maxCandidates": 32, "totalTimeoutMs": 15000 }
    }
  }
}
```

This is a **non-executable configuration template**, not a calibrated profile. Replace all
placeholders, including numeric fields, using reviewed results. Unknown fields and raised,
zero, fractional or negative limits are rejected. Additional `secretRefs` identify configured
host credentials to screen; they may not name `TYPESAFE_API_KEY`. Only the dedicated service
token is sent as authentication. Generic credential-pattern filtering also runs, but cannot
guarantee discovery of every secret. A host integration may inject an additional secret filter.

Canonical `read` and `search` must be active and unrestricted for the permitted operation.
Overrides of their implementations are rejected. An allowed-tools list must also permit
`investigate_code`. Enabling a repository does not broaden any existing hook or host restriction.
For large repositories, explicitly choose a small approved scope: reaching the 5,000-entry
metadata bound is a handoff, not silent retrieval truncation.

## Invoke and demonstrate

The model-visible closed input contains only `objective`, optional `diagnosticText`, up to eight
`seedLocations` and eight `literalTerms`. Paths are relative plain file paths, not selectors or
URLs. The session owns the repository root. Example input:

```json
{
  "objective": "Gather evidence about structured decision response validation.",
  "seedLocations": [{ "path": "src/core/structured-output/jev.ts", "line": 60 }],
  "literalTerms": ["parseResponse", "InvalidDecisionOutputError"]
}
```

Choose paths relative to the actual approved repository root. After host configuration and
readiness, use the normal agent or run `examples/sdk/decider-investigation.ts` with the repository's
normal SDK example runner. It creates a session, requires the already-enabled tool, requests
one investigation, and leaves continuation with the main model. It does not enable or configure
Decider from extension/model arguments. No new user message or `terminate: true` is returned.

## Access and resource contracts

The controller knows only injected decision, repository, monotonic-clock, policy and audit
interfaces. Candidate generation uses metadata, supplied diagnostics/locations/terms, and
previous permitted outputs. Supported diagnostics are `file:line[:column]` and
`file(line,column)`. Explicit relative import references are followed only when the exact
spelled file exists; extensions/resolution guesses are not invented. Search is literal.
The deterministic ordering is diagnostic, supplied location, observed reference/match, term.
A default range covers 30 lines before and 89 after a location; shorter host limits keep the
reported line in range. EOF clamping happens in the metered operation because candidate
preparation cannot read source bodies to discover line counts.

Root-relative Linux `openat2` denies symlinks, magic links and mount crossings inside the root;
opened-object metadata and root/scope versions are checked around decisions/access. Metadata
access, directory enumeration and all content scans are bounded and recorded. File reads are
read-only. No globally atomic repository snapshot is claimed. Relevant changes stop with
`source_changed`; a new invocation starts from new state.

Canonical child operations pass through the same extracted `tool_call`/`tool_result` extension
boundary as ordinary tools. Events include `parentInvocationId`, `operationId` and actual read
selector or escaped-literal search arguments and explicit permitted paths. The accessor never
calls a built-in's raw `.execute()`. A hook denial stops execution. If result filtering changes
an excerpt, search output or associated details, v1 fails closed instead of recovering the
unfiltered source or claiming the replacement is an exact excerpt.

Bounds are 5 actions/decisions, 32 candidates plus handoff, one active investigation per session,
15 seconds including preparation, 2 seconds per decision/operation, 1 MiB per eligible file,
5,000 enumerated entries, 16 MiB scanned, 120 lines/6 KiB per read, 20 search matches, 32 KiB
state, 64 KiB request, 1 MiB response and 24 KiB evidence. Every dispatched failure consumes an
action; a refusal before dispatch does not. No waiting queue exists per session. Timers and
monotonic checks reject late admission, including uncooperative asynchronous dependencies.
Like ordinary synchronous host filesystem operations, a blocked audit syscall cannot be
preempted by a JavaScript timer; deadline checks run before and after that boundary.

## Audit and restart

Each invocation writes a private JSONL trace in the existing host session directory outside
the repository. Action-start persistence is mandatory before dispatch. Content-access records
account for each chunk of scanned bytes; evidence is stored once and later records use its ID.
The file records profile/fingerprint, candidate/state hashes, distributions, source identities,
usage, timing, budgets and terminal status without HTTP-body logging. Cancellation is a host
cancellation/error, not a successful handoff. `inspectTrace()` marks a trace with no terminal
record incomplete; it never replays or resumes it. Apply normal session retention/access policy.

## Test and evaluate

```sh
node --test scripts/decider-investigation.test.mjs
(cd scripts/decider-investigation-service && python -m unittest -v test_contract)
(cd scripts/decider-investigation-evaluation && python -m unittest -v test_evaluation)
python scripts/decider-investigation-evaluation/replay.py \
  scripts/decider-investigation-evaluation/fixtures/replay.jsonl \
  --output /absolute/private/replay-report.json
```

The Node suite uses workspace esbuild to transpile isolated modules and the installed TypeBox
runtime to validate decisions. It requires no GPU weights or running service. Run the **normal complete Atomic
build/typecheck, unchanged Jev suites and integration tests as well** in a full checkout. The
included Jev token-identity regression checks ensure that the extracted change has not modified
authentication, parser or tournament function bodies; they are not a substitute for the full
workspace suite.

See [evaluation protocol](../../scripts/decider-investigation-evaluation/README.md) and
[conformance matrix](decider-investigation-conformance.md). The checked-in replay report is
synthetic, not a measured speedup, calibrated profile or task-success claim. No production
profile is bundled. Real pilot approval requires the predeclared eligible slice, useful-candidate
coverage, actionable coverage, paired clustered success interval, latency comparisons against
both baselines, p95/full-workflow regression review, safety tests and explicit human approval.

## Disable and rollback

Set `enabled` to false or remove the user-global configuration file, then refresh/restart the
session. An in-flight invocation checks the configuration generation again and refuses further
dispatch after it changes. Cancel the current agent run for immediate cooperative cancellation.
Stop the separately managed local service and revoke its token when no longer needed. Keep
permitted historical audit records under normal retention rules; do not resume them.

For code rollback, revert the feature patch/commit. No migrations, stored model-router changes,
repository modifications by the tool, downloaded weights, or persistent background automation
are created by enabling or disabling this tool.
