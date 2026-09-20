import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti/static";
import { it } from "vitest";
import { resolveSourceImport, sourceImportOptions } from "../src/core/extensions/loader-source-imports.ts";
import { loadExtensionModule } from "../src/core/extensions/loader-virtual-modules.ts";
import { SessionManager } from "../src/core/session-manager.ts";

it("selects the editable TypeScript source without asking the resolver to fail on a missing JavaScript file", () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		writeFileSync(join(dir, "state.ts"), "export const value = 1;");
		assert.equal(resolveSourceImport("./state.js", join(dir, "entry.ts")), "./state.ts");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("rechecks JavaScript additions and deletions with unchanged cached importer text and fresh mutable module state", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		writeFileSync(entry, 'import { next } from "./state.js"; export default () => next();');
		writeFileSync(join(dir, "state.ts"), 'let count = 0; export const next = () => "ts:" + ++count;');
		const load = async () => {
			const jiti = createJiti(entry, {
				moduleCache: false,
				tryNative: false,
				...sourceImportOptions(() => join(dir, "cache")),
			});
			return jiti.import<() => string>(entry, { default: true });
		};
		const first = await load();
		assert.equal(first(), "ts:1");
		assert.equal(first(), "ts:2");
		assert.equal((await load())(), "ts:1");
		writeFileSync(join(dir, "state.js"), 'export const next = () => "js";');
		assert.equal((await load())(), "js");
		rmSync(join(dir, "state.js"));
		assert.equal((await load())(), "ts:1");
		writeFileSync(join(dir, "state.ts"), 'export const next = () => "edited";');
		assert.equal((await load())(), "edited");
		rmSync(join(dir, "state.ts"));
		await assert.rejects(load(), /Cannot find module|ENOENT/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("preflights static, re-exported and literal dynamic imports against the actual importer, not Babel's synthetic filename", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			'import { value } from "./barrel.js"; export default async () => [value, (await import("./state.js")).value];',
		);
		writeFileSync(join(dir, "barrel.ts"), 'export { value } from "./state.js";');
		writeFileSync(join(dir, "state.ts"), "export const value = 42;");
		const options = sourceImportOptions(() => join(dir, "cache"));
		const [id, helper] = Object.entries(options.virtualModules!)[0] as [string, typeof resolveSourceImport];
		const resolutions: string[] = [];
		options.virtualModules![id] = (specifier: string, importer: string) => {
			const resolved = helper(specifier, importer);
			resolutions.push(resolved);
			return resolved;
		};
		const jiti = createJiti(entry, { moduleCache: false, tryNative: false, ...options });
		const run = await jiti.import<() => Promise<number[]>>(entry, { default: true });
		assert.deepEqual(await run(), [42, 42]);
		assert.deepEqual(resolutions, ["./barrel.ts", "./state.ts", "./state.ts"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("keeps Jiti's directory, appended-extension and symlink precedence over sibling TypeScript", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		writeFileSync(entry, 'import value from "./state.js"; export default value;');
		writeFileSync(join(dir, "state.ts"), 'export default "ts";');
		const load = () =>
			createJiti(entry, {
				moduleCache: false,
				tryNative: false,
				...sourceImportOptions(() => join(dir, "cache")),
			}).import(entry, { default: true });
		mkdirSync(join(dir, "state.js"));
		writeFileSync(join(dir, "state.js", "index.js"), 'module.exports = "directory";');
		assert.equal(resolveSourceImport("./state.js", entry), "./state.js");
		assert.equal(await load(), "directory");
		rmSync(join(dir, "state.js"), { recursive: true });
		writeFileSync(join(dir, "state.js.ts"), 'export default "appended";');
		assert.equal(resolveSourceImport("./state.js", entry), "./state.js");
		// Compare to ordinary Jiti as its resolution caches can outlive one instance.
		assert.equal(
			await load(),
			await createJiti(entry, { moduleCache: false, tryNative: false }).import(entry, { default: true }),
		);
		rmSync(join(dir, "state.js.ts"));
		writeFileSync(join(dir, "target.cjs"), 'module.exports = "symlink";');
		symlinkSync(join(dir, "target.cjs"), join(dir, "state.js"));
		assert.equal(resolveSourceImport("./state.js", entry), "./state.js");
		assert.equal(await load(), "symlink");
		rmSync(join(dir, "target.cjs"));
		assert.equal(resolveSourceImport("./state.js", entry), "./state.js");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("leaves aliases and package export conditions with Jiti, including aliases to literal relative JavaScript", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			'import a from "./state.js"; import b from "selected"; import c from "conditional"; export default [a,b,c];',
		);
		writeFileSync(join(dir, "state.ts"), 'export default "wrong";');
		writeFileSync(join(dir, "selected.ts"), 'export default "alias";');
		writeFileSync(join(dir, "real.js"), 'export default "real-js";');
		writeFileSync(join(dir, "real.ts"), 'export default "wrong-ts";');
		const pkg = join(dir, "node_modules", "conditional");
		mkdirSync(pkg, { recursive: true });
		writeFileSync(
			join(pkg, "package.json"),
			JSON.stringify({ exports: { import: "./import.js", require: "./require.cjs" } }),
		);
		writeFileSync(join(pkg, "import.js"), 'export default "import-condition";');
		writeFileSync(join(pkg, "require.cjs"), 'module.exports = "require-condition";');
		const alias = { "./state.js": join(dir, "selected.ts"), selected: join(dir, "real.js") };
		const options = { moduleCache: false, tryNative: false, alias };
		const expected = await createJiti(entry, options).import(entry, { default: true });
		const actual = await createJiti(entry, {
			...options,
			...sourceImportOptions(() => join(dir, "cache"), alias),
		}).import(entry, { default: true });
		assert.deepEqual(actual, expected);
		assert.deepEqual(actual, ["alias", "real-js", "import-condition"]);
		// Jiti normalizes a ./ alias target to a bare specifier. Preserve its
		// existing rejection rather than inventing relative-target semantics.
		const relativeAlias = { ...alias, selected: "./real.js" };
		await assert.rejects(
			createJiti(entry, { ...options, alias: relativeAlias }).import(entry),
			/Cannot find module 'real.js'/,
		);
		await assert.rejects(
			createJiti(entry, {
				...options,
				alias: relativeAlias,
				...sourceImportOptions(() => join(dir, "cache"), relativeAlias),
			}).import(entry),
			/Cannot find module 'real.js'/,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("shares the live host singleton while ordinary extension loads keep independent editable module state", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			`
			import { SessionManager } from "@bastani/atomic";
			import { SessionManager as Compat } from "@earendil-works/pi-coding-agent";
			import { next } from "./state.js";
			export default () => ({ host: SessionManager, compat: Compat, count: next() });
		`,
		);
		writeFileSync(join(dir, "state.ts"), "let count = 0; export const next = () => ++count;");
		const first = (await loadExtensionModule(entry)) as () => {
			host: typeof SessionManager;
			compat: typeof SessionManager;
			count: number;
		};
		const second = (await loadExtensionModule(entry)) as typeof first;
		assert.deepEqual(first(), { host: SessionManager, compat: SessionManager, count: 1 });
		assert.equal(first().count, 2);
		assert.deepEqual(second(), { host: SessionManager, compat: SessionManager, count: 1 });
		writeFileSync(join(dir, "state.ts"), "export const next = () => 99;");
		const edited = (await loadExtensionModule(entry)) as typeof first;
		assert.equal(edited().count, 99);
		assert.equal(first().count, 3);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("does not use a shadowed filename parameter to resolve a deferred dynamic import", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		const decoy = join(dir, "decoy");
		mkdirSync(decoy);
		writeFileSync(
			entry,
			`
			async function f(__filename: string) { return (await import("./state.js")).default; }
			export default () => f(${JSON.stringify(join(decoy, "entry.ts"))});
		`,
		);
		writeFileSync(join(dir, "state.js"), 'export default "real-js";');
		writeFileSync(join(dir, "state.ts"), 'export default "wrong-ts";');
		writeFileSync(join(decoy, "state.ts"), 'export default "decoy";');
		const run = (await loadExtensionModule(entry)) as () => Promise<string>;
		assert.equal(await run(), "real-js");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("preserves an explicit caller opt-out from Jiti's filesystem cache", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	const previous = process.env.JITI_FS_CACHE;
	try {
		process.env.JITI_FS_CACHE = "false";
		const entry = join(dir, "entry.ts");
		writeFileSync(entry, "const value: number = 42; export default value;");
		const cache = join(dir, "cache");
		const jiti = createJiti(entry, { moduleCache: false, tryNative: false, ...sourceImportOptions(() => cache) });
		assert.equal(jiti.options.fsCache, false);
		assert.equal(await jiti.import(entry, { default: true }), 42);
		assert.equal(existsSync(cache), false);
	} finally {
		if (previous === undefined) delete process.env.JITI_FS_CACHE;
		else process.env.JITI_FS_CACHE = previous;
		rmSync(dir, { recursive: true, force: true });
	}
});

it("keeps the original importing file when extension code assigns to its CommonJS filename", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		const decoy = join(dir, "decoy");
		mkdirSync(decoy);
		writeFileSync(
			entry,
			`
			__filename = ${JSON.stringify(join(decoy, "entry.ts"))};
			export default async () => (await import("./state.js")).default;
		`,
		);
		writeFileSync(join(dir, "state.js"), 'export default "real-js";');
		writeFileSync(join(dir, "state.ts"), 'export default "wrong-ts";');
		writeFileSync(join(decoy, "state.ts"), 'export default "decoy";');
		const run = (await loadExtensionModule(entry)) as () => Promise<string>;
		assert.equal(await run(), "real-js");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

it("does not consult a reassigned CommonJS require when evaluating a deferred ESM import", async () => {
	const dir = mkdtempSync(join(tmpdir(), "atomic-source-imports-"));
	try {
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			'require = () => { throw Error("extension-owned require"); }; export default async () => (await import("./state.js")).default;',
		);
		writeFileSync(join(dir, "state.ts"), 'export default "source";');
		const run = (await loadExtensionModule(entry)) as () => Promise<string>;
		assert.equal(await run(), "source");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
