# Experimental Decider evidence bundles

Decider investigation remains disabled by default. An enabled investigation gathers
read-only evidence and returns control to the coding model; it does not edit code,
run tests or mark the coding task complete.

An operator-reviewed profile may select the new candidate policy
`code-investigation-grounded-v2`. It follows possible relative-import source files already
inside the approved scope, offers subsequent unread ranges and sends a smaller decision
state without clipping source evidence. For example, an observed `./parser.js` import can
lead to reading an existing `parser.ts` in the approved repository scope.

These are possible source relationships, not guaranteed compiler resolution. Aliases,
package exports and relationships outside the approved scope are not resolved. The tool
returns control when it lacks candidates, confidence, budget or timely service results.
It can still require additional reads by the coding model.

The default policy remains `code-investigation-v1`. A v1 approval does not approve v2:
operators need a new evaluated profile and must not copy old confidence thresholds and
call them calibrated for the new policy. No approved v2 profile is bundled with Atomic.
The local endpoint, host-owned configuration, Linux tool requirement, source confinement
and existing action/time limits are unchanged.

Follow the repository's [Decider setup guide](../../../docs/experimental/decider-investigation.md)
for deployment and rollback. Keep the existing profile to retain v1 behavior, or disable
investigation in the host configuration and restart the session. The prefetch experiment
and additional request metrics described in the
[evaluation notes](../../../docs/experimental/decider-grounded-bundles.md) are explicit
maintainer evaluation options, not automatic background reads in normal sessions.
