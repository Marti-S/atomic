# Editable-source loading optimization (2026-09-20)

## Scope and mechanism

This is an Atomic-owned optimization of ordinary Node extension loading. Jiti 2.7.0, dependency manifests, editable builtin selection, lifecycle coverage, test budgets and suite concurrency are unchanged. Bun/native builtins and the existing forced-transformation/retained-factory path are unchanged.

The root-phase diagnostic established that three fresh SDK sessions spent 16.702s composing builtins, including 15.683s importing editable TypeScript graphs. Six resource-discovery reloads together cost 23ms; disposal completed in 5–7ms. Removing lifecycle work or discovery isolation would not address that cost.

`loader-source-imports.ts` uses Jiti's supported `transformOptions.babel` plugin and virtual-module interfaces. After Jiti lowers imports, an Atomic Babel post hook wraps only literal relative `.js` ESM import arguments. At evaluation time an Atomic helper selects the sibling `.ts` file only when the `.js` path is absent, the `.ts` file exists, and no appended-extension candidate takes precedence. Existing files, directories, symlinks and filesystem errors retain ordinary Jiti resolution. Bare packages, package export conditions and computed imports remain Jiti-owned. Relative aliases and explicit Jiti cache/resolution/native/JSX environment policies conservatively retain the ordinary path. In particular, explicit `JITI_JSX` bypasses optimization so JSX-enabled appended-extension precedence remains Jiti-owned.

The transformed code, not evaluated module state, is cached in a separate versioned namespace. Each fresh extension load still uses `moduleCache: false`. Filesystem selection runs at every import, including deferred literal dynamic imports, so adding/deleting `.js` without changing the importer cannot stale-cache the source choice. The plugin captures the actual importer filename and virtual helper under hygienic names before extension code runs; shadowed or reassigned CommonJS wrapper variables cannot redirect imports. Host virtual exports retain their live identity.

## Measurements and evidence

Working evidence: `/tmp/atomic-source-loader` (exact commands, output and exits; the parent validation archive retains the durable copy).

Same isolated HOME and private Node 22.19.0/Bun 1.4.2 as the previous validation. Exact unchanged root case: `default-tools-setting > preserves explicit tool option precedence over the setting`.

| Execution | Test body | Overall | Result |
| --- | ---: | ---: | --- |
| Before optimization, ordinary existing transform cache | 16.91s | 19.74s | pass |
| Final optimization, new transform namespace (cold builtin graph) | 5.44s | 7.69s | pass |
| Final optimization, warm transform cache | 1.72s | 7.42s | pass |

These are sequential diagnostic measurements, not a controlled benchmark or complete-suite acceptance. The final warm run includes 2.05s of setup outside the measured test body. Initial ineffective and failed intermediate implementations remain in the evidence, rather than being counted as improvements.

A private Vite observer on the working implementation counted 4,677 source selections across 1,557 distinct relative import edges and 366 importer files in the three-session case. No dependency interception was used. The installed Jiti resolver SHA256 remains `a0b3b8d5e06a0519c66b62179e29200533057920f6f11370546e979dacd24c49`.

## Acceptance evidence

| Requirement | Evidence / status |
| --- | --- |
| Editable source and fresh mutable state | New real-import tests: `.ts` edits/deletion, `.js` addition/deletion with byte-identical importer and cached transform, independent module counters and surviving old closures. |
| Host singleton identity | Production `loadExtensionModule` test compares native `SessionManager` with both Atomic and compatibility virtual imports. Existing loader/host tests also pass. |
| Resolver compatibility | Real directory/index, appended extension, valid/dangling symlink, relative alias and conditional-export fixtures pass. Actual inaccessible-parent probe returns the unchanged specifier. |
| Deferred import hygiene | New regression tests reproduced incorrect selection with shadowed/reassigned `__filename`, and an error with reassigned `require`; corrected capture passes all cases. |
| Explicit cache policy | `JITI_FS_CACHE=false` initially failed with a real cache directory; regression now passes with caching disabled and no directory created. Legacy/cache/resolution/native policies bypass optimization. |
| Focused source tests | Eleven tests pass, including ordinary-versus-production-loader comparison with `JITI_JSX` unset/true/false, repeated loading and edited appended JSX source. Original lifecycle assertions remain intact. |
| Existing compatibility/lifecycle coverage | Final seven-file package selection: 232 passed (39.62s), covering source imports, virtual/host identity, graph manifests and SDK builtin parity. Final root source-selection/tools selection: 13 passed (6.95s). No added skips. |
| Code quality | Final authoritative `npm run check` passed, including Biome, both typecheck passes and shrinkwrap. Its existing pretypecheck offline AI build also ran. Supplemental Qlty analyzed both production files and reported conservative guards/multiple-return complexity; no suppression or broad refactoring. |
| Full build and complete root/package suites | Final JSX repair: build/check exit0; complete root9936pass/23skip, package4944pass/52skip, integration1161pass/12skip, CI115 and scripts122pass/12skip. Historical failures and the authorized successful integration revalidation are retained in the source-validation ledger. |
| Dependency and scope boundary | No Jiti/package/lockfile changes, global monkeypatches, prebuilt-source substitution, retained mutable factories, test budget changes, skips or concurrency changes. |

No user-guide change is actionable for this internal optimization. The package changelog records the user-visible startup improvement.

Independent review passed20 ordinary-versus-optimized comparisons, including lexical/mutated wrapper bindings, capture ordering and cache-disable policies. A subsequent review reproduced the JSX-policy precedence defect; the explicit-policy bypass and eleventh regression repair it. See [combined validation](decider-investigation-validation.md) for the historical and final gate evidence and the accepted bounded inference scope.
