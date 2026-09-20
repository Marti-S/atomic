import { isAbsolute, relative, resolve } from "node:path";
import {
	bytes,
	CANDIDATE_POLICY_VERSION,
	canonical,
	exactKeys,
	freeze,
	hash,
	InvestigationToolError,
	MAXIMUM_LIMITS,
	positive,
	probability,
	QUESTION_VERSION,
	RENDERING_VERSION,
	record,
	snapshot,
} from "./common.js";
import type { AdmissionProfile, EffectivePolicy, InvestigateCodeInput, Limits } from "./types.js";

export const DEFAULT_EXCLUDED_COMPONENTS = Object.freeze([
	".git",
	".hg",
	".svn",
	".env",
	".ssh",
	".aws",
	".azure",
	".gnupg",
	".kube",
	".docker",
	"node_modules",
	"vendor",
	".venv",
	"venv",
	"__pycache__",
	"dist",
	"build",
	"target",
	".next",
	".cache",
	"coverage",
]);
const SECRET_NAME =
	/^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.pypirc|auth\.json|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx|jks|keystore))$/i;
/** Deliberately excludes selector/glob/device syntax; paths are plain repository files. */
export function normalizePath(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value ||
		bytes(value) > 4096 ||
		isAbsolute(value) ||
		/[\\:\x00-\x1f\x7f*?[\]{}]/u.test(value)
	)
		throw new InvestigationToolError("permission_denied");
	const path = value.replace(/^\.\//, "");
	if (!path || path.split("/").some((part) => !part || part === "." || part === ".."))
		throw new InvestigationToolError("permission_denied");
	return path;
}
export function excluded(path: string, extra: readonly string[] = []): boolean {
	return (
		path.split("/").some((part) => DEFAULT_EXCLUDED_COMPONENTS.includes(part) || SECRET_NAME.test(part)) ||
		extra.some((item) => path === item || path.startsWith(`${item}/`))
	);
}
export function withinRoot(root: string, target: string): boolean {
	const rel = relative(resolve(root), resolve(target));
	return (
		rel === "" ||
		(!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
	);
}
export function parseLimits(value: unknown = {}): Readonly<Limits> {
	if (!record(value) || !exactKeys(value, [], Object.keys(MAXIMUM_LIMITS)))
		throw new InvestigationToolError("host_configuration");
	const limits = { ...MAXIMUM_LIMITS };
	for (const key of Object.keys(value) as (keyof Limits)[]) {
		const n = value[key];
		if (!positive(n) || n > MAXIMUM_LIMITS[key]) throw new InvestigationToolError("host_configuration");
		limits[key] = n;
	}
	if (limits.maxTermCharacters < 2) throw new InvestigationToolError("host_configuration");
	return Object.freeze(limits);
}
export function parseInput(value: unknown, limits: Readonly<Limits>): InvestigateCodeInput {
	const bad = () => {
		throw new InvestigationToolError("invalid_input");
	};
	if (!record(value) || !exactKeys(value, ["objective"], ["diagnosticText", "seedLocations", "literalTerms"]))
		return bad();
	if (
		typeof value.objective !== "string" ||
		!value.objective.trim() ||
		bytes(value.objective) > limits.maxObjectiveBytes
	)
		return bad();
	if (
		value.diagnosticText !== undefined &&
		(typeof value.diagnosticText !== "string" || bytes(value.diagnosticText) > limits.maxDiagnosticBytes)
	)
		return bad();
	if (
		value.seedLocations !== undefined &&
		(!Array.isArray(value.seedLocations) || value.seedLocations.length > limits.maxSeedLocations)
	)
		return bad();
	const seeds = (value.seedLocations ?? []) as unknown[];
	for (const seed of seeds) {
		if (!record(seed) || !exactKeys(seed, ["path"], ["line"]) || (seed.line !== undefined && !positive(seed.line)))
			return bad();
		const path = normalizePath(seed.path);
		if (excluded(path)) throw new InvestigationToolError("permission_denied");
	}
	if (
		value.literalTerms !== undefined &&
		(!Array.isArray(value.literalTerms) || value.literalTerms.length > limits.maxLiteralTerms)
	)
		return bad();
	for (const term of (value.literalTerms ?? []) as unknown[]) {
		if (
			typeof term !== "string" ||
			!term.trim() ||
			[...term].length < 2 ||
			[...term].length > limits.maxTermCharacters ||
			/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(term)
		)
			return bad();
	}
	const input = snapshot(value) as unknown as InvestigateCodeInput;
	if (input.seedLocations)
		input.seedLocations = input.seedLocations.map((seed) => ({ ...seed, path: normalizePath(seed.path) }));
	return freeze(input);
}
const PROFILE_KEYS = [
	"id",
	"approved",
	"minTopProbability",
	"minTopTwoMargin",
	"backendId",
	"deploymentFingerprint",
	"weightsRevision",
	"tokenizerRevision",
	"configHash",
	"temperature",
	"renderingVersion",
	"questionVersion",
	"candidatePolicyVersion",
	"precision",
	"evaluationId",
] as const;
export function parseProfile(value: unknown): Readonly<AdmissionProfile> {
	if (
		!record(value) ||
		!exactKeys(value, PROFILE_KEYS) ||
		value.approved !== true ||
		!probability(value.minTopProbability) ||
		!probability(value.minTopTwoMargin)
	)
		throw new InvestigationToolError("host_configuration");
	for (const key of PROFILE_KEYS.filter(
		(key) => !["approved", "minTopProbability", "minTopTwoMargin", "temperature"].includes(key),
	)) {
		if (typeof value[key] !== "string" || !(value[key] as string).trim())
			throw new InvestigationToolError("host_configuration");
	}
	if (
		!/^[a-f0-9]{64}$/.test(value.deploymentFingerprint as string) ||
		!/^[a-f0-9]{64}$/.test(value.configHash as string) ||
		typeof value.temperature !== "number" ||
		!Number.isFinite(value.temperature) ||
		value.temperature <= 0 ||
		value.renderingVersion !== RENDERING_VERSION ||
		value.questionVersion !== QUESTION_VERSION ||
		value.candidatePolicyVersion !== CANDIDATE_POLICY_VERSION ||
		value.precision !== "decider-four-decimal"
	)
		throw new InvestigationToolError("host_configuration");
	return freeze(snapshot(value) as unknown as AdmissionProfile);
}
export function validateEndpoint(value: unknown): string {
	if (
		typeof value !== "string" ||
		!/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?\/v1\/systemone$/.test(value)
	)
		throw new InvestigationToolError("host_configuration");
	const url = new URL(value);
	if (url.username || url.password || url.search || url.hash || (url.port && Number(url.port) > 65535))
		throw new InvestigationToolError("host_configuration");
	return url.href;
}
export function createSecretScreen(
	values: readonly string[],
	hostFilter: (text: string) => boolean = () => true,
): (text: string) => boolean {
	const secrets = values
		.filter((value) => value.length > 0)
		.flatMap((value) => [value, JSON.stringify(value).slice(1, -1)]);
	const patterns = [
		/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
		/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
		/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
		/(?:password|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[=:]\s*["']?[A-Za-z0-9+/_.=-]{12,}/i,
	];
	return (text) => {
		if (secrets.some((secret) => text.includes(secret)) || patterns.some((pattern) => pattern.test(text)))
			return false;
		try {
			return hostFilter(text) === true;
		} catch {
			return false;
		}
	};
}
export function effectivePolicy(
	config: { profile: unknown; limits?: unknown; scopePaths: readonly string[]; excludedPaths?: readonly string[] },
	assertCurrent: () => void,
	isSafe: (text: string) => boolean,
): EffectivePolicy {
	const profile = parseProfile(config.profile);
	const limits = parseLimits(config.limits);
	if (!config.scopePaths.length) throw new InvestigationToolError("host_configuration");
	const scopePaths = Object.freeze(config.scopePaths.map((path) => (path === "." ? "." : normalizePath(path))).sort());
	const excludedPaths = Object.freeze((config.excludedPaths ?? []).map(normalizePath).sort());
	const generation = hash(canonical({ profile, limits, scopePaths, excludedPaths }));
	return Object.freeze({ generation, profile, limits, scopePaths, excludedPaths, assertCurrent, isSafe });
}
