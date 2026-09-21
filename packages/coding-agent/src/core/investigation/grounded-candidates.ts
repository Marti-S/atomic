import { posix } from "node:path";
import { excluded, normalizePath } from "./policy.js";
import type { OperationObservation, RepositoryAction, ScopeSnapshot } from "./types.js";

const SOURCE_SUBSTITUTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	".js": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
	".jsx": [".tsx", ".d.ts", ".jsx"],
	".mjs": [".mts", ".d.mts", ".mjs"],
	".cjs": [".cts", ".d.cts", ".cjs"],
});
const EXTENSIONLESS = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json"] as const;

/**
 * Construct possible source targets from an observed relative import and scoped metadata only.
 * These are retrieval hypotheses, not a claim about the project's runtime/module resolver.
 * No filesystem reads, tsconfig/package execution, aliases, package lookup or network access.
 * Keep every existing alternative: selecting one here would conceal ambiguity from the selector.
 */
export function relativeSourceTargets(
	from: string,
	specifier: string,
	scope: ScopeSnapshot,
	excludedPaths: readonly string[],
): string[] {
	if (!/^\.{1,2}\/[\p{L}\p{N}_@+./-]+$/u.test(specifier)) return [];
	let target: string;
	try {
		target = normalizePath(posix.join(posix.dirname(normalizePath(from)), specifier));
	} catch {
		return [];
	}
	if (excluded(target, excludedPaths)) return [];
	const extension = posix.extname(target);
	const alternatives = SOURCE_SUBSTITUTIONS[extension];
	const paths = alternatives
		? alternatives.map((suffix) => `${target.slice(0, -extension.length)}${suffix}`)
		: extension
			? [target]
			: [target, ...EXTENSIONLESS.map((suffix) => `${target}${suffix}`),
				...EXTENSIONLESS.map((suffix) => `${target}/index${suffix}`)];
	return [...new Set(paths)].filter((path) => Object.hasOwn(scope.files, path) && !excluded(path, excludedPaths));
}

/**
 * Literal import-shaped text in an already permitted excerpt. Partial excerpts cannot establish
 * parser context; even a hint inside a comment is only a possible read, never a resolved edge.
 */
export function observedRelativeImports(text: string): string[] {
	return [...new Set([...text.matchAll(
		/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["'](\.{1,2}\/[\p{L}\p{N}_@+./-]+)["']/gu,
	)].map((match) => match[1]))];
}

/** First uncovered interval only; later observations make the remaining gaps eligible. */
export function firstUncoveredRange(
	action: Extract<RepositoryAction, { kind: "read_range" }>,
	covered: readonly (readonly [number, number])[],
): Extract<RepositoryAction, { kind: "read_range" }> | undefined {
	let startLine = action.startLine;
	for (const [start, end] of covered) {
		if (end < startLine) continue;
		if (start > action.endLine) break;
		if (start > startLine) return { ...action, startLine, endLine: start - 1 };
		startLine = end + 1;
		if (startLine > action.endLine) return undefined;
	}
	return { ...action, startLine };
}

/** Only a fully returned requested range justifies offering the next bounded page. */
export function continuationRange(
	action: RepositoryAction,
	observation: OperationObservation,
	maxReadLines: number,
): Extract<RepositoryAction, { kind: "read_range" }> | undefined {
	if (
		action.kind !== "read_range" || observation.kind !== "source_excerpt" ||
		observation.path !== action.path || observation.startLine !== action.startLine ||
		observation.endLine !== action.endLine || observation.coveredEndLine !== action.endLine ||
		observation.omittedEvidenceBytes !== 0 || !observation.text ||
		!Number.isSafeInteger(action.endLine + maxReadLines)
	) return undefined;
	return { ...action, startLine: action.endLine + 1, endLine: action.endLine + maxReadLines };
}
