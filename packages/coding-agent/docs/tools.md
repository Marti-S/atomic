---
title: "Built-in tools"
description: "The tools Atomic gives the model by default."
---

# Built-in tools

Atomic enables these coding tools in normal sessions by default: `read`, `write`, `edit`, `bash`, `kill`, `find`, and `search`.

- [Read files and select lines](#read-and-path-selectors).
- [Find paths and search contents](#find-and-search).
- [Edit existing files](#edit) or [write files](#write).
- [Run shell commands](#bash-and-bashinterceptor) or [stop background shells](#kill).

Bundled integrations also provide [public repository search](#code_search), [web fetching](/web-access), and [MCP tools](/mcp-servers).

## `investigate_code` (experimental)

**Disabled by default.** This tool gathers source excerpts and literal search results through a separately managed local Decider service, then returns control to the main model. It does not edit files, run commands, replace the chat model or `routerModel`, or fall back to Jev/cloud. Every ordinary result has `taskComplete: false`.

Enabling the experiment requires Linux x86-64 or arm64 with `openat2`, procfs and `/usr/bin/python3`, an approved repository scope, and a private persistent Atomic session directory outside the repository. Other platforms do not register the tool. Canonical `read` and `search` must be active; tool allowlists must also permit `investigate_code`. Extension restrictions still apply.

No model snapshot or approved production profile is supplied. The service needs already-materialized local model/tokenizer files, a reviewed deployment fingerprint and evaluated admission thresholds. Atomic never downloads weights or starts the service for you. Use the source checkout's [operator setup guide](https://github.com/bastani-inc/atomic/blob/main/docs/experimental/decider-investigation.md) for companion service commands and the full configuration template. It targets Decider revision `a59466dc52f3ad5cc75758f80a4fa0109fd56b08`. Synthetic evaluation fixtures are not calibration or rollout approval.

The standalone companion service can use Apple MPS with an explicit `--device mps --dtype float32` deployment; this does not enable the repository tool on macOS. CUDA graphs require CUDA. Wait for authenticated service readiness, then verify requests against the unchanged two-second deadline. A deployment's `--max-total-tokens` cap rejects oversized input rather than truncating it. MPS accelerator, macOS or architecture changes require a newly reviewed deployment fingerprint.

The only enablement file is `~/.atomic/decider-investigation.json`, under the operating-system account's home directory, not an overridden `HOME`. It must be owned by that account, mode `0600`, and outside the repository. Project settings and extensions cannot enable the feature. Configure `experimental.deciderInvestigation` with explicit `enabled: true`, a literal-loopback endpoint, matching approved profile, repository approval and `tokenSecretRef: "env:ATOMIC_DECIDER_SERVICE_TOKEN"`. Supply that dedicated token in the host environment, never a TypeSafe API key.

After setup, ask the main model to call the tool once. Inputs contain an objective and optional diagnostic text, up to eight seed locations and eight literal terms:

```json
{
  "objective": "Gather evidence about structured decision response validation.",
  "seedLocations": [{ "path": "src/core/structured-output/jev.ts", "line": 60 }],
  "literalTerms": ["parseResponse", "InvalidDecisionOutputError"]
}
```

Paths are plain relative file paths within the approved repository, not URLs or selectors. Adjust the example to your repository root. The main model must assess the returned evidence and continue the task; cancellation is an error, not successful evidence collection.

Keep scopes small. Limits can be lowered, not raised. Default ceilings are five actions, 15 seconds total, two seconds per decision or operation, 5,000 enumerated entries, 16 MiB scanned and 24 KiB of evidence. A limit, source change, denied hook, filtered result, unsafe content or uncertain decision stops collection. Do not broaden permissions to bypass these restrictions.

If the tool is absent, check platform support, explicit enablement, repository approval and the allowlist. Configuration errors require checking file ownership/mode, profile identities and the dedicated token. Service unavailability or deployment mismatch stops investigation without fallback. Review private session audits under your normal retention policy; interrupted traces are never resumed.

An unmapped container UID or failed operating-system account lookup also leaves the tool unavailable. Configure a real OS account to use host approval; changing `HOME` cannot enable it.

To disable, set `enabled` to `false` or remove the global configuration, then refresh or restart the session. Configuration changes prevent further dispatch by an in-flight invocation; cancel the agent run for immediate cooperative cancellation. Stop the separately managed service and revoke its token when no longer needed. No migration or router-model change is required.

## `code_search`

The bundled web-access extension provides `code_search` for questions about code, architecture, and APIs in a public GitHub repository. It uses DeepWiki MCP at `https://mcp.deepwiki.com/mcp` without an API key or local MCP configuration.

```typescript
code_search({ repoName: "facebook/react", query: "How does useEffect cleanup work?" })
```

Both `repoName` and `query` are required. Supply one repository in `owner/repo` format, not a GitHub URL or list, and a nonempty question. Existing query-only calls must add `repoName`. Questions are sent verbatim to DeepWiki's `ask_question` tool.

Optional `maxTokens` defaults to 5000 and accepts integers from 1000 to 50000. It is a best-effort output bound of roughly four characters per token, plus a truncation notice, not a limit on DeepWiki's generation. Requests have a 60-second deadline and honor cancellation.

Answers depend on DeepWiki's repository indexing and availability. Check the repository name when a question fails. Errors and empty responses do not fall back to Exa; use `web_search` for broader discovery or unavailable repositories. `web_search` retains its existing Exa and other provider support.

## `edit`

### Hashline editing anchors

`read`, `search`, `write`, and successful `edit` results for local text files emit an editable, session-scoped hashline header:

```text
[src/example.ts#A1B2]
1:const value = 1;
2:console.log(value);
```

Use that header and the original line numbers to edit the existing file:

```text
[src/example.ts#A1B2]
replace 1..1:
+const value = 2;
insert tail:
+// done
```

If a file or its parent directory becomes inaccessible after `edit` prepares a patch, the edit is refused with `FILE_MUTATION_CONFLICT:target_unreadable` and the filesystem error code, such as `EACCES`. No changes are written. Restore access, then read the file again before retrying.

### Inputs

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `input` | `string` | Yes | One or more hashline file sections. The value must be non-empty. |

Each section starts with `[PATH#TAG]`. `TAG` is the four-hex snapshot tag emitted by the latest `read`, `search`,
`write`, or successful `edit` in the active tool/session store. Tags from another session do not authorize an edit.
Hashline edits existing files; use `write` to create a file.

The operations are:

- `replace N..M:` — replace inclusive original lines N through M with the following body rows.
- `replace block N:` — replace the syntactic block beginning on N with the following body rows.
- `delete N..M` — delete inclusive original lines N through M. It has no body.
- `delete block N` — delete the syntactic block beginning on N. It has no body.
- `insert before N:` — insert body rows immediately before original line N.
- `insert after N:` — insert body rows immediately after original line N.
- `insert after block N:` — insert body rows after the end of the syntactic block beginning on N.
- `insert head:` — insert body rows at the start of the file.
- `insert tail:` — insert body rows at the end of the file.

Line numbers refer to the original tagged snapshot and do not shift as hunks in one call apply. A body-bearing header is
followed by one or more `+TEXT` rows. The `+` is syntax; `TEXT` is inserted verbatim with leading whitespace preserved,
and `+` alone inserts a blank line. There are no old-text or context rows. To insert a literal row beginning with `-` or
`+`, write `+-text` or `++text`.

#### Block resolution

`replace block`, `delete block`, and `insert after block` first use the native Rust tree-sitter `blockRangeAt` primitive
from `@bastani/atomic-natives`. The brace/indent heuristic is used only as a fallback when the native binding is
unavailable. Resolution selects the outermost syntactic node beginning on N. Where a language folds a decorator or
annotation into its construct—Python `@dec` plus `def`, and TypeScript/Java annotations—anchoring at the first decorator
resolves both. A Rust `#[attr]` and doc- or line-comments are separate sibling nodes: anchoring there resolves that node
alone, and replacing it with a construct body duplicates the untouched construct. Use `replace N..M:` or `delete N..M`
with explicit lines to take both, and confirm the `→ resolved lines A-B (K lines)` echo before continuing.

For `insert after block N:`, N is the opener, never the closing delimiter or last visible line. If the last line is already
known, use `insert after M:`. A successful resolution is echoed as
`replace block N → resolved lines A-B (K lines)` or `delete block N → resolved lines A-B (K lines)`; insert-after adds
`; body lands after line B` to `insert after block N → resolved lines A-B (K lines)`.

A replace/delete block cannot resolve when the language is unsupported, the anchor is blank or a closer, no syntactic node
begins there, the subtree does not parse, or no resolver is configured. Use `replace N..M:` or `delete N..M`. An unresolved
`insert after block N:` is instead lowered to `insert after N:` with a warning; use `insert after M:` when the explicit end
line is known. Streaming preview drops unresolved replace/delete block operations, while the authoritative apply rejects
them.

### Tolerated input shapes

Atomic's hand parser deliberately accepts these non-canonical shapes:

- Leading blank lines, a leading byte-order mark, and an optional `*** Begin Patch` envelope are ignored.
  `*** End Patch` and `*** Abort` stop parsing; operations before either marker remain.
- Hex tags are case-insensitive on input and normalized to uppercase.
- Quoted header paths are unquoted. Absolute paths inside the execution working directory become relative display paths.
- Some malformed bracketed headers are recovered after removing apply-patch path noise such as `Update File:`, `Add File:`,
  `Delete File:`, `Move to:`, and extra leading `***`. A recovered edit section still needs a valid four-hex tag.
- `replace N:` is a single-line replacement. `delete N` is a single-line deletion.
- `replace N-M:`, `replace N…M:`, and `replace N M:` are accepted as `replace N..M:`. The same separators are accepted for
  `delete` ranges.
- The trailing colon is optional on body-bearing `replace` and `insert` headers.
- An empty concrete `replace N..M:` is accepted as deletion of that range. Prefer `delete N..M`; empty `replace block` is
  rejected.
- Bare body rows under a body-bearing hunk are treated as literal rows, auto-prefixed with `+`, and warned. When every bare,
  nonblank row has a `LINE:`/`*LINE:` read-output prefix, those prefixes are stripped as a pasted snapshot; mixed rows and
  explicit `+` rows are preserved. A body made entirely of quoted or numeric values keeps its numeric keys.
- Repeated sections for the same authored path are merged in first-occurrence order when their tags do not conflict.
- A run of comment lines beginning with `#` is skipped only when an operation header is the immediately next token. If a
  blank line, end of input, or the next `[PATH#TAG]` header intervenes, the deferred comment is replayed as body content and
  rejected with the payload-line error. Once a hunk is open, a `#` line is body content: under `delete` it triggers the
  delete-takes-no-body rejection; under a body-bearing hunk it is auto-prefixed and written as a literal line. Blank layout
  rows before a body or after its final row are ignored; proven interior blank body rows are preserved.

The parser does **not** tolerate `delete N..M:` or a body under `delete`/`delete block`, `-` diff rows, apply-patch file
sentinels inside the patch, unified-diff/`@@` hunk headers, bare numeric hunk headers, malformed/absent section headers,
unsafe or non-positive anchors, oversized ranges, empty `insert`/`insert after block`, or empty `replace block` hunks.

Notable difference from the upstream reference: Atomic accepts an empty concrete `replace N..M:` as a deletion, and
unresolvable `insert after block` operations lower to plain `insert after` with a warning rather than failing.

### Outputs

A successful edit returns one compact text block per written section. Each starts with a fresh `[path#TAG]` header for the
post-edit content, followed by warnings and block-resolution lines, then a compact diff preview (or a
`First changed line: N` fallback). Warnings are emitted as diagnostic lines directly beneath the header rather than under a
separate `Warnings:` label. Multi-section results are separated by a blank line.

Block echoes have these exact shapes:

```text
replace block N → resolved lines A-B (K lines)
delete block N → resolved lines A-B (K lines)
insert after block N → resolved lines A-B (K lines); body lands after line B
```

The tool's `details` value is `EditToolDetails`:

- `diff`: the combined rendered diff string.
- `patch`: the combined unified patch string.
- `firstChangedLine`: optional first changed post-edit line.

Each successful `write` or `edit` records and returns a fresh snapshot tag. Plain `write` output is also compact: a refreshed
header plus a success confirmation, not a full file reprint. `write` strips copied hashline headers and `LINE:`/`*LINE:`
display prefixes only when they match a known snapshot in the current store, reports that stripping, and preserves whether
a complete copied snapshot had a terminal newline. A copied `Successfully wrote to <path>` confirmation (with or without the
legacy `N bytes` wording) counts as tool chrome only when `<path>` is the complete path the write was asked for — the `path`
argument exactly as given, its resolved absolute form, or its cwd-relative form — or the copied snapshot's own path. A bare
basename is not enough, so a user-authored line such as `Successfully wrote to notes.md` is preserved even when the target is
`deep/dir/notes.md`. Unknown or literal hashline-looking content is preserved.

Parallel `edit` calls sharing the same `[path#TAG]` are applied as one snapshot-anchored batch, so one sibling does not fail
only because another sibling minted a new tag first. A later call arriving after that batch committed still attempts
snapshot recovery for provably non-overlapping drift.

Atomic verifies every target against its tagged snapshot before writing. A recognized stale tag can recover a provably
non-overlapping external or in-session change and emits the corresponding warning. Unknown tags, overlapping stale edits,
and unrecoverable drift fail with the current hash and anchor context and leave the section unchanged. All sections are
prepared before writes begin, but this is preflight atomicity, not transactional rollback: a filesystem failure during
sequential commits can leave earlier sections written, and the error names written and unwritten sections.

A byte-identical edit returns a no-op diagnostic without writing. The same identical payload escalates to an error on its
third attempt.

### Worked examples

Reference file in the exact shape `read` returns:

```text
[a.ts#0A3B]
1:const X = "a";
2:const Y = X;
3:
4:console.log(X);
5:console.log(Y);
6:export { X, Y };
```

Replace line 1 with two lines:

```text
[a.ts#0A3B]
replace 1..1:
+const X = "b";
+export const Y = X;
```

Insert below or above line 5:

```text
[a.ts#0A3B]
insert after 5:
+console.log(X + Y);
insert before 5:
+console.log(X + Y);
```

Delete lines 4 through 5:

```text
[a.ts#0A3B]
delete 4..5
```

Insert at both file boundaries:

```text
[a.ts#0A3B]
insert head:
+// header
insert tail:
+// trailer
```

Replace or delete a complete block by anchoring its opener:

```text
[service.ts#7B2E]
replace block 10:
+function load() {
+	return cache.get("key");
+}
delete block 30
```

Edit two files in one preflighted call:

```text
[src/a.ts#0A3B]
replace 4..4:
+const enabled = true;
[src/b.ts#1F7C]
delete 20
```

### Limits and caps

- `HL_FILE_HASH_LENGTH = 4`; canonical tags match `HL_FILE_HASH_RE_RAW = [0-9A-F]{4}` and are content-derived,
  session-store snapshot pointers.
- Anchors must be positive safe integers no greater than `Number.MAX_SAFE_INTEGER`.
- `HL_MAX_EXPANDED_RANGE_LINES = 100_000`; an inclusive numeric range is rejected before expansion above that size.
- `MISMATCH_CONTEXT = 2`; mismatch and unresolved-block previews show up to two lines on either side of each anchor.
- The repeated identical no-op hard limit in `edit.ts` is `3`; attempts one and two return the diagnostic, while attempt
  three throws it with a `STOP.` prefix.
- `RECOVERY_FUZZ_FACTOR = 0`; snapshot recovery does not slide a patch hunk to a nearby duplicate.
- Format constants are `HL_FILE_PREFIX = "["`, `HL_FILE_SUFFIX = "]"`, `HL_FILE_HASH_SEP = "#"`,
  `HL_PAYLOAD_REPLACE = "+"`, `HL_RANGE_SEP = ".."`, and `HL_HEADER_COLON = ":"`; operation keywords are `replace`,
  `delete`, `insert`, `block`, `before`, `after`, `head`, and `tail`.
- Explicit `+TEXT` that resembles a valid hunk header remains literal and emits `HUNK_LIKE_LITERAL_WARNING`.

Across whole-file, truncated, and range/offset reads of LF or CRLF text, numbered output treats a terminal newline as a
separator, not an extra synthetic row. Genuine blank lines—including one immediately before that terminal newline—remain
visible, and truncation totals and continuation selectors count real lines. Bare-CR files retain their existing
compatibility behavior and are outside this guarantee.

### Errors

The templates below quote Atomic's literal messages. `N`, `M`, `A`, `B`, `PATH`, `TAG`, `<path>`, `<message>`, and similar
angle-bracketed names stand for runtime substitutions. Parser errors that originate within a section include the authored
`line N:` prefix shown.

#### Tool boundary and filesystem

- `edit input must be a non-empty hashline script with [PATH#TAG] sections.`
- `Operation aborted`
- `Could not edit file: <path>. <message>.` (`<message>` is `Error code: <code>` when the error exposes a code.)
- `Multiple hashline sections resolve to the same file (<first path> and <second path>). Merge their ops under one header before applying.`
- `Stale hashline tag for <path>: file content changed before write. Re-read before editing.`
- `Failed to write <path>: <message>`; when applicable it appends ` Sections already written: <paths>.` and/or
  ` Sections not written: <paths>.`

#### Section headers and snapshot tags

- `input must begin with "[PATH#HASH]" on the first non-blank line for anchored edits; got: <preview>. Example: "[src/foo.ts#1A2B]" then edit ops.`
- `Input header must be [PATH] or [PATH#TAG] with a 4-hex content-hash tag; got <header>.`
- `Input header "[]" is empty; provide a file path.`
- `Patch input did not produce any sections.`
- ``Missing hashline snapshot tag for <path>; use `[<path>#tag]` from your latest read/search output. To create a new file, use the write tool.``
- `Conflicting hashline snapshot tags for <path>: #<first tag> and #<second tag>. Re-read the file and retry with one current header.`
- `Hashline Patcher requires a SnapshotStore; section tags are opaque store pointers.`
- `File not found: <path>. Use the write tool to create new files.`

#### Tokenizer and anchors

- `Tokenizer is closed; call reset() before reusing.`
- `line N: line anchor "<digits>" is not a safe integer; line numbers must be positive safe integers no greater than 9007199254740991.`
- `line N: expected a line number such as "119", "112", "7"; got "<input>". Use [PATH#hash] from your latest read for file-version binding.`
- `Line N does not exist (file has M lines)`
- `Invalid line reference. Expected a bare line number from read/search output plus the section header content-hash tag (for example [src/foo.ts#1A2B] and line "160") Received "abc"..`
- `Line number must be >= 1, got 0 in "0".`

These two messages are retained by the low-level `parseTag` helper but currently have no caller in Atomic, so the `edit`
tool cannot emit them.

#### Ranges, bodies, and hunk conflicts

- `line N: range A..B ends before it starts.`
- `line N: range A..B expands to K lines; numeric ranges are limited to 100,000 lines.`
- `line N: payload line has no preceding hunk header. Got "+<text>".`
- ``line N: payload line has no preceding hunk header. Use `replace N..M:`, `delete N..M`, or `insert before|after|head|tail:` above the body. Got "<text>".``
- ``line N: `-` rows are not valid; the range already names the lines being changed. For a literal `-` line, write `+-…`.``
- ``line N: `delete N..M` does not take body rows. Remove the body, or use `replace N..M:`.``
- ``line N: `delete block N` does not take body rows. Remove the body, or use `replace block N:`.``
- ``line N: `insert` needs at least one `+TEXT` body row.``
- ``line N: `replace block N:` needs at least one `+TEXT` body row. To delete a block, use `delete block N`.``
- `line N: anchor line A is already targeted by another hunk on line M. Issue ONE hunk per range; payload is only the final desired content, never a before/after pair.`

A concrete `replace N..M:` with no body is not an error: Atomic treats it as deletion. `messages.ts` retains the unused
`EMPTY_REPLACE` text `` `replace N..M:` needs at least one `+TEXT` body row. To delete lines, use `delete N..M`. ``, but
the current concrete-replace parser does not emit it.

#### Contamination and malformed hunk headers

- ``unified-diff hunk header (`@@ -N,M +N,M @@`) is not valid in hashline. File sections start with `[path#HASH]`; use `replace`, `delete`, or `insert` ops.``
- ``line N: apply_patch sentinel "<preview>" is not valid in hashline. File sections start with `[path#HASH]` (no `Update File:` / `Add File:` keyword). Use `replace N..M:`, `delete N..M`, or `insert before|after|head|tail:` ops.``
- ``line N: unified-diff hunk header (`@@ -N,M +N,M @@`) is not valid in hashline. Use `replace N..M:`, `delete N..M`, or `insert before|after|head|tail:` ops.``
- ``line N: `@@`-bracketed hunk header "<preview>" is not valid in hashline. Drop the `@@ ... @@` brackets and write a verb header such as `replace N..M:`.``
- ``line N: `delete N..M` has no colon and no body. Remove the colon and body rows.``
- ``line N: hunk headers need a verb. Use `replace A..A:` to replace, or `delete A` to delete.``
- ``line N: bare range hunk header "A..B" is not valid. Hunk headers need a verb: write `replace A..B:` or `delete A..B`.``

#### Block resolution and internal apply invariants

- With a resolver, replace/delete failure is
  ``line N: `replace block A:` could not resolve a syntactic block beginning on line A (unsupported language, blank/closer line, or parse error). Use `replace A..M:` with explicit lines.`` or
  ``line N: `delete block A` could not resolve a syntactic block beginning on line A (unsupported language, blank/closer line, or parse error). Use `delete A..M` with explicit lines.``
  Numbered, `*`-marked context follows after a blank line when the anchor is in range.
- Without a resolver:
  ``line N: `replace block`/`delete block`/`insert after block` are not available here (no block resolver configured). Use a concrete line range.``
- ``internal error: unresolved `replace block` edit reached the applier (resolveBlockEdits was not run).``

`insert after block` resolution failure is a warning and lowering, not an error.

#### Snapshot mismatch

An unknown or cross-session tag emits these two lines, followed by numbered anchor context when available:

```text
Edit rejected for <path>: hash #<expected tag> is not from this session.
The current file hashes to #<actual tag>. Re-read the file with `read` to copy a current [path#tag] header — never invent the tag and never reuse one from a prior session.
```

A recognized tag whose snapshot no longer matches and cannot be recovered emits:

```text
Edit rejected for <path>: file changed between read and edit.
Section is bound to #<expected tag>, but the current file hashes to #<actual tag>. If a prior edit in this session modified this file, copy the [path#newhash] header from that edit's response; otherwise re-read the file with `read` to refresh the tag before retrying.
```

When the path is absent in a low-level call, the literal ` for <path>` segment is omitted.

#### No-op edits

A single-file or all-no-op call returns this text without writing on attempts one and two:

```text
Edits to <path> parsed and applied cleanly, but produced no change: your body row(s) are byte-identical to the file at the targeted lines. The bug is somewhere else — re-read the file before issuing another edit. Do NOT widen the payload or add lines; verify the anchor first.
```

From attempt two onward it appends `No-op count for this identical payload: N.` on a new line. Attempt three throws the
same text prefixed with `STOP. `. A mixed multi-section call containing a no-op throws
`Hashline edit for <path> did not change the file.` The lower-level patcher can also emit
`Edits to <path> resulted in no changes being made.` during multi-section `apply` or `preflight`.

### Warnings

Warnings that have active emission sites are emitted verbatim beneath the refreshed section header:

- ``Auto-prefixed bare body row(s) with `+`. Body rows must be `+TEXT` literal lines.``
- `Literal +TEXT row resembles a valid hunk header; it was kept as literal payload text.`
- `Recovered from a stale file hash using a previous read snapshot (file changed externally between read and edit).`
- `Recovered from a stale file hash using an earlier in-session snapshot (a prior edit in this session advanced the hash).`
- `Recovered by replaying your edits onto the current file content (a prior in-session edit changed the lines you re-targeted with a stale hash). Verify the diff matches your intent.`
- ``Applied the `insert head:`/`insert tail:` edit despite a stale snapshot tag (file changed since your read) — head/tail position is content-independent. Re-read if the drift was unexpected.``
- `` `insert after block N:` anchors on a closing delimiter, so it was applied as plain `insert after N:`. Anchor on the line that OPENS the construct. ``
- `` `insert after block N:` could not resolve a syntactic block on line N, so it was applied as plain `insert after N:`. Verify the landing line; anchor on a line that OPENS a construct. ``
- `insert after N: body indented shallower than the anchor, so the landing moved past K closing line(s) to after line M. For the deeper position inside the block, re-issue with the body indented to match.`
  The emitted phrase is `1 closing line` for one crossed line and `K closing lines` otherwise.
- ``insert after block N: body indented deeper than closing line A, so it was placed inside the block, after line M. `insert after block` lands AFTER the block at sibling depth — if inside was intended, use plain `insert after A:`.``
- `Auto-repaired a replacement boundary echo at line N: dropped A leading and B trailing payload line(s) already present outside the range. Issue the payload as the final desired content for the selected range only — never restate unchanged lines bordering the range.`
- `Auto-repaired a delimiter-balance mismatch in the replacement at line N: <repair action>. Issue the payload as the final desired content only — never restate or omit a closing bracket bordering the range.`
  The repair action is one of `dropped K duplicated trailing payload line(s) already present below the range`,
  `dropped K duplicated leading payload line(s) already present above the range`, or
  `kept K structural closing line(s) the range deleted without restating`.
- `Applied N parallel edit calls as one snapshot-anchored batch.`

`messages.ts` also defines two coalescing-warning strings, although the current parser has no emission site for them and
rejects overlapping deletes instead:

- ``Two hunks targeted the same range; kept only the second. One `replace N..M:` hunk per range — the body is the final content, never old+new.``
- ``Dropped a bare hunk overlapped by the concrete hunk after it. One `replace N..M:` hunk per range — the body is the final content, never old+new.``

## `write`

Read an existing file before overwriting it with `write`. Atomic checks that the content still matches what this session observed, so another agent's changes are not silently discarded. Creating a new file does not require a prior read.

Two refusals use the `FILE_MUTATION_CONFLICT` code and include the requester identity:

- `no_prior_observation`: this session has not read, written, or edited the file. Another session's read, including one from a previous run, does not count.
- `changed_since_observation`: the file changed. The error names the first diverging line and shows the expected and current content. Read the file again before retrying.

The check and write share a per-file mutation queue. If a result is aborted after bytes reach disk, Atomic still records the new snapshot so a retry recognizes its own write.

Standalone `createWriteToolDefinition(cwd)` and `createWriteTool(cwd)` instances retain their own observations across `local://` writes, just as they do for plain paths, even when no `hashlineStore` is supplied. Separate instances still need an explicitly shared store to share observations.

Creating a file claims the path exclusively. `write` asks the filesystem for create-or-fail semantics (`O_EXCL`) whenever it has just observed the path as absent, so a file that appears in the window between that check and the write is reported as `target_exists` with a description of what is there now, rather than being silently truncated. Overwrites do not request exclusivity, since they are replacing a file the session has already accounted for.

`WriteOperations` carries the read `write` performs before every write. Custom implementations must supply it, and it must report absence as `undefined` while rejecting for anything else: a path that exists but cannot be read is not a free path, and reporting it as absent would present it as a fresh create and truncate it. Such a rejection surfaces as `target_unreadable`, including the filesystem error code when the backend supplies one. Routing the read through `WriteOperations` is what lets a remote or sandboxed implementation have these checks run against the filesystem its writes actually land on, instead of against local disk. An implementation that cannot express exclusive create may ignore that request and overwrite; it then loses only the race against writers outside Atomic, since the mutation queue already excludes writers inside it.

## `bash` and `bashInterceptor`

The `bash` tool executes shell commands in the session workspace. It accepts `cwd`, `env`, `timeout`, and `pty`.

- `cwd` and `env` set the working directory and environment for local execution.
- `timeout` is in seconds and defaults to 300. Explicit values must be finite, greater than zero, and no more than 3600. Invalid values fail before execution. Fractions round down, with a one-second floor.
- `pty: true` uses the bundled native PTY session, falling back to pipes if unavailable. Set `PI_NO_PTY=1` or `ATOMIC_NO_PTY=1` to force pipes.

Foreground results include `timeoutSeconds`, `requestedTimeoutSeconds`, `wallTimeMs`, and non-zero `exitCode` metadata. Truncated output is saved at `fullOutputPath`.

### Bash interception

`bashInterceptor.enabled` defaults to `false`. When enabled, interceptor rules block common shell substitutes such as `cat`, `grep`, `find`, in-place `sed`, and redirection only when the corresponding first-class tool is available. Enabled calls are also offered to `user_bash` extension handlers before local execution.

Atomic checks the original command, internal-URL-expanded command, configured-prefix forms, and `spawnHook` rewrites. When structured `cwd` is omitted, it also checks a form with a leading `cd path && command` or `cd path; command` removed. This lets interceptors route by effective working directory without overriding explicit `cwd`.

Shell internal-URL expansion is intentionally conservative: commands containing a resolved URL must use only plain unquoted words, spaces/tabs, and basic `;`, `|`, or `&` operators. For example, `printf %s local://notes.txt` is supported and the resolved path is shell-quoted automatically, including paths containing spaces or shell metacharacters. Quotes anywhere in such a command, substitutions, escapes, newlines, redirections and heredocs are rejected before execution; use a filesystem path instead for those forms. Commands without resolved internal URLs retain normal shell syntax. URL expansion in structured `cwd` and `env` values is unchanged.

The `powershell` tool uses PowerShell single-quoted literals for resolved paths, doubling both ASCII apostrophes and PowerShell's smart single-quote delimiters (U+2018–U+201B). Bash keeps POSIX quoting, including when Bash runs on Windows. SDK adapters using `createBashToolDefinition` with custom PowerShell operations can set `shellDialect: "powershell"` for generated path literals; this option does not select the executable or rewrite deliberate shell code.

Configured command prefixes and SDK `spawnHook` rewrites remain executable shell syntax, not a sandbox. Balanced setup commands such as quoted exports remain supported. A prefix that leaves a quote, substitution, or heredoc open across the following command can invalidate the generated path quoting; automatic URL expansion does not validate that composed shell context. Do not combine URL expansion with such wrappers. Use structured `cwd` and `env` for path data instead.

```json
{
  "bashInterceptor": { "enabled": true }
}
```

## `kill`

`kill({ id: taskId })` stops an owned background shell task launched by `bash` or `powershell`, including a command that automatically yielded. Pass its returned task ID verbatim, not a PID. The tool is owner-scoped in main and workflow-stage chat and does not cancel subagents or another owner's work.

The result reports the cancellation decision and current execution and cleanup states. A request is not confirmation of termination. Repeated requests preserve the original cancellation decision; already-completed work retains its outcome. Cleanup failures are reported explicitly. See [Background tasks](/background-tasks#stop-a-shell-task-from-a-tool-call) for states, retained output, and `/tasks` controls.

## `find` and `search`

Use `find` to locate paths by glob and `search` to match file contents with a regex.

### Finding paths

`find.paths` is required. It accepts files, directories including filesystem roots, supported local resource selectors, and globs.

- Hidden files are included by default, and `.gitignore` rules are respected, including nested rules outside a Git checkout.
- Broad scans prune `.git` and `node_modules` even with `gitignore: false`. To search `node_modules`, name it explicitly in the path or glob.
- Results are capped at 200 by default; the default timeout is 5 seconds.

Copied quotes around paths are removed. Existing paths containing spaces, commas, or semicolons are kept intact. Otherwise, comma/semicolon-separated paths split when at least one part resolves; whitespace-separated paths split only when every part resolves.

Local `find` uses native glob matching, falling back to the packaged `fd` helper when native bindings are unavailable. Results include `scopePath`, `fileCount`, `files`, truncation and missing-path metadata, and streamed `onUpdate` snapshots during long scans.

### Searching contents

`search` accepts `pattern`, optional `paths`, `i`, `case`, `gitignore`, and `skip`. It searches files, directories, globs, archive members, SQLite selectors, and supported local resource selectors.

- Omitted, empty-string, or empty-array `paths` search the workspace root.
- Quoted and delimiter-separated paths follow the same rules as `find`.
- Whitespace-only patterns are rejected. Other patterns are preserved verbatim, including `(?i)`, `(?m)`, and `(?x)` flags for resource-backed selectors.
- Output is paged by matching files, 20 by default. Multi-file searches show up to 20 matches per file; single-file searches allow 200 matches.
- `skip` pages files and is ignored for single-file searches. At the internal collection ceiling, refine the pattern or path as the output requests.
- Context defaults to one line before and three after each match, controlled by `search.contextBefore` and `search.contextAfter`. Line selectors scope matches first; context outside the range does not count as a hit.

Local search uses native ripgrep matching with a 4 MiB file cap, hidden-file and `.gitignore` handling, and line truncation. Resource-backed searches use the native in-memory matcher when available, with a JavaScript fallback for multiline/resource edge cases.

Details include scope, counts, file lists, per-file match counts, missing paths, and displayed-content metadata. `fileLimitReached` and `meta.limits.fileLimit` indicate more matching files. Hashline rows distinguish matches (`*LINE:...`) from context (` LINE:...`).

## `read` and path selectors

Directory reads show a depth-2 tree sorted by most-recent modification time, with sizes and relative ages. They prune `.git` and `node_modules` and cap child directories at 12 entries. An elision marker indicates omitted entries while preserving the oldest shown entry.

### Lines and local resources

`read` and `search` accept selectors such as `file.ts:5-16`, `file.ts:5+3`, `file.ts:5-16,960-973`, and `https://example.test/page:5-8`. Bounded reads include one leading and three trailing context lines. Use `:raw` for unformatted content. Out-of-range selectors report that the range is beyond EOF.

`read`, `write`, and `search` support:

- Local zip/jar/tar/tgz/gzip archive members without a Python dependency. Member names may include `raw`, `conflicts`, `1`, `L1`, or `raw:notes.txt`.
- SQLite table and row selectors, with `limit`, `offset`, `where`, `order`, `schema`, and `sampleRows` query parameters.
- `skill://` and source-backed `local://` selectors. Editable hashline labels and snapshots use the underlying filesystem path.

Workspace-scoped selectors reject lexical and symlink escapes outside the workspace or skill root. Existing non-SQLite `.db` and `.sqlite` files remain plain files. Archive writes reject directory targets ending in `/` and return the resolved archive path. SQLite writes return source-path metadata.

### SQLite limits and writes

- Table reads show the schema and a 5-row sample by default. Query reads default to 20 rows, capped at 500.
- Raw `?q=` queries accept only single-statement `SELECT` and stream at most 1000 rows. They reject `sqlite_%` internals, `pragma_*` table-valued functions, and dangerous keywords such as `ATTACH`.
- Table lists cap at 500, excluding `sqlite_%` tables. Row counts probe at most 50,001 rows.
- Table writes accept `{}` as `INSERT DEFAULT VALUES`. Row writes parse non-empty JSON5-style objects, including comments, and validate column names and scalar values before binding.
- Empty SQLite row writes delete only when a row ID is present.

### Conflict resolution and file writes

`conflict://<id>` and `conflict://*` writes replace conflict marker regions, expand `@ours`, `@theirs`, and `@base`, and return fresh hashline headers. Scoped sides such as `conflict://1/ours` are read-only.

Plain `write` refuses to overwrite files with generated-file markers near the top. Writes containing a shebang make the file executable and report `madeExecutable`.

### Documents and URLs

`read` extracts readable text from HTML URLs and notebooks. Notebook cells use 0-based `cell:N` IDs; unknown top-level notebook fields are preserved.

PDFs and `.doc`, `.docx`, `.ppt`, `.pptx`, `.xls`, `.xlsx`, `.rtf`, and `.epub` documents use the `markit-ai` converter. If no converter is available, the tool reports the unsupported format. Extensionless downloads are decoded when `Content-Type` identifies the document type.

Output limits depend on the source:

- Local text reads show up to 3,000 lines or 50 KiB.
- Unselected URL reads show the first 300 rendered lines, capped at 50 KiB. Large rendered bodies are truncated rather than blocked solely for their size; full-output and truncation metadata are retained when available.
- Search match and context lines are capped at 512 characters, followed by a truncation notice.
- Oversized resource/document reads return guidance and structured details identifying the block reason.

Successful reads include `details.meta.source` and `sourcePath`, plus `truncation` and `limits` when applicable.

Atomic blocks private, localhost, and cloud-metadata URL targets. This includes numeric/short-form private IPs such as `2130706433`, octal/hex dotted forms, and `127.1`; IPv4-compatible and IPv4-mapped IPv6; NAT64 and 6to4 private-address forms; and the IPv6 link-local `fe80::/10` range. It revalidates redirects, pins DNS-validated addresses, and caps streamed bodies.

`ATOMIC_ALLOW_PRIVATE_URL_READS=1` is a development-only escape hatch for trusted local tests. Never set it from untrusted project configuration.

## `ask_user_question`

When `ask_user_question` or an equivalent question tool is available, all questions to the user must use that tool instead of plain text. This includes clarifications, preferences, confirmations, approvals, and permission to proceed, not just ambiguous requirements. Prefer `ask_user_question` when available; otherwise follow the equivalent tool's supported schema. In these sessions, do not end a progress update or final response with a prose-only "Proceed?".

Ask only when a decision is needed. Do not ask again for already-authorized work. Group related questions in one call, up to four questions with two to four options each. For confirmations, state the concrete action and scope in the question and offer explicit proceed and decline options. For example, when this action needs approval, call `ask_user_question` with:

```json
{
  "questions": [{
    "header": "Merge approval",
    "question": "Remove the stack grouping, then admin-merge the same seven PRs in dependency order without changing repository protections?",
    "options": [
      { "label": "Proceed", "description": "Remove the grouping and admin-merge those seven PRs in dependency order. Leave repository protections unchanged." },
      { "label": "Do not proceed", "description": "Leave the grouping and PRs unchanged." }
    ]
  }]
}
```

In a real confirmation, identify the target PRs in the question or immediately preceding context. This example explains question routing; it does not authorize merging any PRs.

A cancelled or unanswered question is not approval. If no usable question tool is available, continue autonomously using best judgment and state evidence-backed assumptions rather than stopping just because the tool is missing. Preserve safety, authorization, and explicit approval gates. Workflow-authored `ctx.ui` gates and `workflow answer` for relaying actual user responses remain supported.

## Persisted tool output

Output that does not fit in a tool result is written to a file, and the result points at it — `Full output: <path>` for `bash`, `Full output saved to: <path>` for any tool result that crosses the persistence threshold. Those files are storage, so Atomic bounds where they go, how large they get, and how long they live.

**Where.** A session that persists to disk keeps its tool results in `<sessionDir>/tool-results/`, unchanged. Everything else — `bash` overflow logs, streamed spill files, and tool results for in-memory sessions — goes under one owner- and session-scoped temp tree:

```text
<tmpdir>/atomic-<uid>/<session-id>/
```

On Windows, where there is no uid, the account name is used instead — qualified by its domain and followed by a short digest, so that `CONTOSO\Alice` and `FABRIKAM\Alice`, or two names that reduce to the same safe path component, do not share one tree. The session id is reduced to a single safe path component, so a session id containing separators or `..` cannot place files outside that tree.

Directories are created with `0700` and files with `0600` on platforms that support them. On POSIX that is enforced: a root owned by another account is refused and a too-permissive one is tightened. On Windows, Node exposes neither an owner SID nor a POSIX mode, so before adopting an existing component Atomic reads its security descriptor through PowerShell `Get-Acl` and decides from SIDs: the owner must be the current user, SYSTEM, or Administrators, and every access-allowed DACL entry must grant only those principals. A foreign-owned root, a root other accounts can access (a machine-wide redirected `TMP`), and a descriptor that cannot be read or fully parsed are all refused. A successful verification is cached per path per process, keyed to the directory's metadata identity — creation, change, and last-write times — so both a directory swapped underneath the path and an in-place DACL edit (which bumps the NTFS change time) force a fresh descriptor read; only a directory whose metadata is unchanged skips the subprocess.

Because that path is predictable, Atomic validates it rather than trusting it. Every component below the system temp directory is created one level at a time and checked: a symlink is refused outright, a directory owned by another account is refused, and a directory of this account's left too permissive is tightened to `0700` and re-checked. Refusal fails closed — the tool runs with no spill file and reports no path, instead of writing your command output into a directory someone else planted. Only the final session directory is treated as replaceable: a stale file or link sitting exactly where a session directory belongs is removed (a link by itself, never its target) and recreated.

**How large.** No single persisted-output file exceeds 64 MB. Output that lands exactly on the cap is kept whole; only output that passes it is cut off there, with `[Output truncated: persisted-output cap of 67108864 bytes reached]` appended in place of the rest. The cut lands on a character boundary even when a multi-byte character is split across two chunks of streamed output, and bytes that are not valid UTF-8 — binary command output — are written through unchanged rather than decoded. The truncation is in the file only; the tool result and its `fullOutputPath` are unaffected. If a spill file cannot be written at all, `bash` reports no path rather than one pointing at a file that is not there.

**How long.** Tool-output storage is reaped on age. A sweep runs shortly after startup, off the startup path, and removes session temp trees and `tool-results` directories whose newest file is more than 30 days old. It covers the default project-nested session roots and a custom session directory chosen with `--session-dir`, `ATOMIC_CODING_AGENT_SESSION_DIR`, or the `sessionDir` setting. The newest entry decides the whole directory: one fresh file keeps everything beside it, so a path recorded weeks ago stays readable as long as the tree is still in use. Each target is throttled to once a day by a `.last-cleanup` marker and guarded by a `.cleanup.lock` exclusive lock, so concurrent Atomic sessions never race each other; for session storage that pair lives in a control directory under the temp root rather than inside the scanned directory. A tree belonging to a session the running process is using is never reaped, so a `Full output saved to:` path stays valid for the life of the session that produced it. Session transcripts and `.jsonl` session files are outside the sweep entirely: only the temp trees and `tool-results` directories are ever deleted, symlinks are never followed out of a target, and a directory the sweep cannot verify as a real directory is skipped rather than read.
