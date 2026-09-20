/** Explicit host/CLI configuration only. Never consult SettingsManager's merged project settings. */
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseStrictJson } from "../structured-output/decider-transport.js";
import { canonical, exactKeys, freeze, hash, InvestigationToolError, record } from "./common.js";
import {
	createSecretScreen,
	normalizePath,
	parseLimits,
	parseProfile,
	validateEndpoint,
	withinRoot,
} from "./policy.js";
import type { AdmissionProfile, Limits } from "./types.js";

// Resolve the OS account's home, not HOME, dotenv, project settings, or an environment-selected path.
// This remains host-owned even when a source-run Bun process autoloads a repository .env file.
export const USER_HOST_CONFIG_PATH = (() => {
	try {
		return join(userInfo().homedir, ".atomic", "decider-investigation.json");
	} catch {
		// A container UID without an OS account cannot supply host approval. Stay off; never trust HOME.
		return undefined;
	}
})();
export interface HostInvestigationConfiguration {
	readonly sourceHash: string;
	readonly root: string;
	readonly endpoint: string;
	readonly profile: Readonly<AdmissionProfile>;
	readonly limits: Readonly<Limits>;
	readonly scopePaths: readonly string[];
	readonly excludedPaths: readonly string[];
	readonly tokenSecretRef: string;
	readonly secretRefs: readonly string[];
}
export function readHostConfiguration(
	path: string | undefined,
	repositoryRoot: string,
): HostInvestigationConfiguration | undefined {
	if (!path) return undefined;
	if (!isAbsolute(path) || withinRoot(repositoryRoot, path)) throw new InvestigationToolError("host_configuration");
	let raw: string;
	try {
		const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const before = fstatSync(fd, { bigint: true });
			const actual = realpathSync(`/proc/self/fd/${fd}`);
			if (
				!before.isFile() ||
				before.size > 65536n ||
				before.uid !== BigInt(process.getuid?.() ?? -1) ||
				(before.mode & 0o077n) !== 0n ||
				withinRoot(realpathSync(repositoryRoot), actual)
			)
				throw new Error();
			raw = readFileSync(fd, "utf8");
			const after = fstatSync(fd, { bigint: true });
			if (
				before.ino !== after.ino ||
				before.size !== after.size ||
				before.mtimeNs !== after.mtimeNs ||
				before.ctimeNs !== after.ctimeNs
			)
				throw new Error();
		} finally {
			closeSync(fd);
		}
	} catch (error) {
		if (record(error) && error.code === "ENOENT") return undefined;
		throw new InvestigationToolError("host_configuration");
	}
	let value: unknown;
	try {
		value = parseStrictJson(raw);
	} catch {
		throw new InvestigationToolError("host_configuration");
	}
	if (
		!record(value) ||
		!exactKeys(value, ["experimental"]) ||
		!record(value.experimental) ||
		!exactKeys(value.experimental, ["deciderInvestigation"]) ||
		!record(value.experimental.deciderInvestigation)
	)
		throw new InvestigationToolError("host_configuration");
	const config = value.experimental.deciderInvestigation;
	if (config.enabled === false) return undefined;
	if (
		config.enabled !== true ||
		!exactKeys(
			config,
			["enabled", "endpoint", "backendId", "policyProfileId", "profile", "tokenSecretRef", "approvedRepositories"],
			["limits", "secretRefs"],
		)
	)
		throw new InvestigationToolError("host_configuration");
	const profile = parseProfile(config.profile);
	if (
		profile.backendId !== config.backendId ||
		profile.id !== config.policyProfileId ||
		/^fixture(?:[-:/]|$)/i.test(profile.evaluationId)
	)
		throw new InvestigationToolError("host_configuration");
	const endpoint = validateEndpoint(config.endpoint);
	const limits = parseLimits(config.limits);
	if (config.tokenSecretRef !== "env:ATOMIC_DECIDER_SERVICE_TOKEN")
		throw new InvestigationToolError("host_configuration");
	const secretRefs = config.secretRefs ?? [];
	if (
		!Array.isArray(secretRefs) ||
		secretRefs.length > 64 ||
		secretRefs.some(
			(ref) => typeof ref !== "string" || !/^env:[A-Z][A-Z0-9_]*$/.test(ref) || ref === "env:TYPESAFE_API_KEY",
		)
	)
		throw new InvestigationToolError("host_configuration");
	if (!Array.isArray(config.approvedRepositories) || config.approvedRepositories.length > 64)
		throw new InvestigationToolError("host_configuration");
	let permitted: { root: string; scopePaths: string[]; excludedPaths: string[] } | undefined;
	for (const entry of config.approvedRepositories) {
		if (
			!record(entry) ||
			!exactKeys(entry, ["root", "scopePaths"], ["excludedPaths"]) ||
			typeof entry.root !== "string" ||
			!isAbsolute(entry.root) ||
			entry.root !== resolve(entry.root) ||
			!Array.isArray(entry.scopePaths) ||
			!entry.scopePaths.length ||
			entry.scopePaths.length > 64 ||
			(entry.excludedPaths !== undefined && (!Array.isArray(entry.excludedPaths) || entry.excludedPaths.length > 64))
		)
			throw new InvestigationToolError("host_configuration");
		const scopePaths = entry.scopePaths.map((path) => (path === "." ? "." : normalizePath(path)));
		const excludedPaths = ((entry.excludedPaths ?? []) as unknown[]).map(normalizePath);
		if (entry.root === resolve(repositoryRoot)) {
			if (permitted) throw new InvestigationToolError("host_configuration");
			permitted = { root: entry.root, scopePaths, excludedPaths };
		}
	}
	if (!permitted) return undefined;
	return freeze({
		sourceHash: hash(raw),
		...permitted,
		endpoint,
		profile,
		limits,
		tokenSecretRef: config.tokenSecretRef,
		secretRefs: secretRefs as string[],
	});
}
export function resolveHostSecrets(config: HostInvestigationConfiguration, hostFilter?: (text: string) => boolean) {
	const token = process.env.ATOMIC_DECIDER_SERVICE_TOKEN;
	if (!token || Buffer.byteLength(token) < 32 || /[\r\n]/.test(token))
		throw new InvestigationToolError("host_configuration");
	const values = [token];
	for (const ref of config.secretRefs) {
		// Validated above. Never enumerate environment values or read/forward TypeSafe authentication.
		if (ref === "env:TYPESAFE_API_KEY") throw new InvestigationToolError("host_configuration");
		const value = process.env[ref.slice(4)];
		if (!value) throw new InvestigationToolError("host_configuration");
		values.push(value);
	}
	const signature = hash(canonical(values));
	return { token, signature, isSafe: createSecretScreen(values, hostFilter) };
}
