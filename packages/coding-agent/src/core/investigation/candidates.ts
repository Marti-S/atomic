import { posix } from "node:path";
import { canonical, freeze, Handoff, hash, InvestigationToolError } from "./common.js";
import { continuationRange, firstUncoveredRange, observedRelativeImports, relativeSourceTargets } from "./grounded-candidates.js";
import { GROUNDED_CANDIDATE_POLICY_VERSION } from "./grounded-version.js";
import { excluded, normalizePath } from "./policy.js";
import type {
	ActionCandidate,
	EffectivePolicy,
	Evidence,
	InvestigateCodeInput,
	OperationObservation,
	RepositoryAction,
	ScopeSnapshot,
} from "./types.js";

interface Location {
	path: string;
	line?: number;
}
interface Proposed {
	action: RepositoryAction;
	provenance: ActionCandidate["provenance"];
	priority: number;
}
/** Supported file:line[:column] and TypeScript file(line,column) diagnostics only. */
export function diagnosticLocations(text: string): Location[] {
	const found: Location[] = [];
	const patterns = [
		/(?:^|[\s("'])((?:\.?\.?\/)?[\p{L}\p{N}_@+./-]+\.[\p{L}\p{N}_-]+):(\d+)(?::\d+)?/gmu,
		/(?:^|[\s("'])((?:\.?\.?\/)?[\p{L}\p{N}_@+./-]+\.[\p{L}\p{N}_-]+)\((\d+),\d+\)/gmu,
	];
	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			const line = Number(match[2]);
			if (Number.isSafeInteger(line) && line > 0) found.push({ path: match[1], line });
		}
	}
	return found;
}
/** Terms are copied from identified error/symbol spans, not generated from prose. */
export function diagnosticTerms(text: string): string[] {
	return [
		...text.matchAll(
			/(?:Cannot find name|Unresolved reference|NameError: name|ReferenceError:)\s+["'`]?([\p{L}_$][\p{L}\p{N}_$]+)["'`]?/gu,
		),
	].map((match) => match[1]);
}
function operationKey(action: RepositoryAction): string {
	return canonical(action);
}
function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
export class CandidateBuilder {
	private readonly proposed: Proposed[] = [];
	private readonly executed = new Set<string>();
	private readonly covered = new Map<string, Array<[number, number]>>();
	private readonly eof = new Map<string, number>();
	private readonly policy: EffectivePolicy;
	private readonly scope: ScopeSnapshot;
	private readonly grounded: boolean;
	constructor(input: InvestigateCodeInput, scope: ScopeSnapshot, policy: EffectivePolicy) {
		this.policy = policy;
		this.scope = scope;
		this.grounded = policy.profile.candidatePolicyVersion === GROUNDED_CANDIDATE_POLICY_VERSION;
		for (const location of diagnosticLocations(input.diagnosticText ?? ""))
			this.location(location, { source: "diagnostic" }, 0, false);
		for (const location of input.seedLocations ?? []) this.location(location, { source: "input" }, 1, true);
		for (const term of [...(input.literalTerms ?? []), ...diagnosticTerms(input.diagnosticText ?? "")]) {
			if ([...term].length >= 2 && [...term].length <= policy.limits.maxTermCharacters)
				this.proposed.push({
					action: { kind: "search_literal", term, scopeId: scope.id },
					provenance: { source: input.literalTerms?.includes(term) ? "input" : "diagnostic" },
					priority: 3,
				});
		}
	}
	private location(
		location: Location,
		provenance: ActionCandidate["provenance"],
		priority: number,
		strict: boolean,
	): void {
		let path: string;
		try {
			path = normalizePath(location.path);
		} catch (error) {
			if (strict) throw error;
			return;
		}
		if (excluded(path, this.policy.excludedPaths) || !Object.hasOwn(this.scope.files, path)) {
			if (strict) throw new InvestigationToolError("permission_denied");
			return;
		}
		const startLine =
			location.line === undefined
				? 1
				: Math.max(1, location.line - Math.min(30, this.policy.limits.maxReadLines - 1));
		const endLine = Math.min(
			Number.MAX_SAFE_INTEGER,
			startLine + this.policy.limits.maxReadLines - 1,
			location.line === undefined ? 120 : location.line + 89,
		);
		this.proposed.push({ action: { kind: "read_range", path, startLine, endLine }, provenance, priority });
	}
	update(candidate: ActionCandidate, observation: OperationObservation, evidence?: Evidence): void {
		this.executed.add(operationKey(candidate.action));
		if (
			observation.kind === "source_excerpt" &&
			observation.path &&
			observation.startLine &&
			observation.coveredEndLine &&
			observation.coveredEndLine >= observation.startLine
		) {
			const ranges = this.covered.get(observation.path) ?? [];
			ranges.push([observation.startLine, observation.coveredEndLine]);
			ranges.sort((a, b) => a[0] - b[0]);
			const merged: Array<[number, number]> = [];
			for (const range of ranges) {
				const last = merged[merged.length - 1];
				if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]);
				else merged.push([...range]);
			}
			this.covered.set(observation.path, merged);
		}
		if (this.grounded && candidate.action.kind === "read_range" && observation.kind === "source_excerpt" &&
			observation.path === candidate.action.path && observation.endLine !== undefined &&
			observation.endLine < candidate.action.endLine && observation.omittedEvidenceBytes === 0)
			this.eof.set(candidate.action.path, observation.endLine);
		if (!evidence) return;
		for (const match of observation.matches ?? [])
			this.location(match, { source: "search_match", evidenceId: evidence.id }, 2, false);
		for (const location of diagnosticLocations(observation.text))
			this.location(location, { source: "observed_reference", evidenceId: evidence.id }, 2, false);
		if (this.grounded && observation.path) {
			for (const specifier of observedRelativeImports(observation.text)) {
				for (const path of relativeSourceTargets(observation.path, specifier, this.scope, this.policy.excludedPaths))
					this.location({ path }, { source: "observed_reference", evidenceId: evidence.id }, 2, false);
			}
			const action = continuationRange(candidate.action, observation, this.policy.limits.maxReadLines);
			if (action) this.proposed.push({ action, provenance: { source: "observed_reference", evidenceId: evidence.id }, priority: 4 });
		} else if (observation.path) {
			// Only explicitly spelled file references. Never guess an extension or consult source bodies.
			for (const match of observation.text.matchAll(
				/(?:from\s*|import\s*|require\(\s*)["'](\.{1,2}\/[\p{L}\p{N}_@+./-]+\.[\p{L}\p{N}_-]+)["']/gu,
			)) {
				this.location(
					{ path: posix.normalize(posix.join(posix.dirname(observation.path), match[1])) },
					{ source: "observed_reference", evidenceId: evidence.id },
					2,
					false,
				);
			}
		}
		for (const term of diagnosticTerms(observation.text).filter(
			(term) => [...term].length <= this.policy.limits.maxTermCharacters,
		))
			this.proposed.push({
				action: { kind: "search_literal", term, scopeId: this.scope.id },
				provenance: { source: "observed_reference", evidenceId: evidence.id },
				priority: 3,
			});
	}
	build(): readonly ActionCandidate[] {
		const ordered = [...this.proposed].sort((a, b) => {
			const aa = a.action;
			const bb = b.action;
			return (
				a.priority - b.priority ||
				compare(aa.kind === "read_range" ? aa.path : "", bb.kind === "read_range" ? bb.path : "") ||
				(aa.kind === "read_range" ? aa.startLine : 0) - (bb.kind === "read_range" ? bb.startLine : 0) ||
				compare(aa.kind === "search_literal" ? aa.term : "", bb.kind === "search_literal" ? bb.term : "")
			);
		});
		const unique = new Map<string, ActionCandidate>();
		for (const item of ordered) {
			if (this.executed.has(operationKey(item.action))) continue;
			let action = this.grounded && item.action.kind === "read_range"
				? firstUncoveredRange(item.action, this.covered.get(item.action.path) ?? [])
				: item.action;
			if (!action) continue;
			if (this.grounded && action.kind === "read_range") {
				const endLine = Math.min(action.endLine, this.eof.get(action.path) ?? action.endLine);
				if (action.startLine > endLine) continue;
				action = { ...action, endLine };
			}
			const key = operationKey(action);
			if (this.executed.has(key) || unique.has(key)) continue;
			if (
				action.kind === "read_range" &&
				this.covered.get(action.path)?.some(([start, end]) => start <= action.startLine && end >= action.endLine)
			)
				continue;
			if (action.kind === "search_literal" && Object.keys(this.scope.files).length === 0) continue;
			const targetVersion =
				action.kind === "read_range" ? this.scope.files[action.path].version : this.scope.revision;
			const id = `a_${hash(canonical({ action, policy: this.policy.generation, scope: this.scope.revision, targetVersion })).slice(0, 32)}`;
			const target =
				action.kind === "read_range"
					? `Read ${JSON.stringify(action.path)}, lines ${action.startLine}-${action.endLine}.`
					: `Search for the exact literal ${JSON.stringify(action.term)} in host-owned scope ${this.scope.id}.`;
			let description = `${target} Provenance: ${item.provenance.source}${item.provenance.evidenceId ? ` in evidence ${item.provenance.evidenceId}` : ""}.`;
			if (this.grounded && item.provenance.source === "observed_reference")
				description += " Derived retrieval candidate, not a verified module-resolution edge.";
			if (!this.policy.isSafe(description)) throw new Handoff("input_context_unsafe");
			unique.set(
				key,
				freeze({
					id,
					action: { ...action },
					description,
					provenance: { ...item.provenance },
					scopeRevision: this.scope.revision,
				}),
			);
		}
		return Object.freeze([...unique.values()]);
	}
}
