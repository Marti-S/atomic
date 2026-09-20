import { lstatSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { JitiOptions } from "jiti";

// Jiti's ordinary resolution tries appended extensions before replacing .js.
const APPENDED_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".json"];

/** Avoid exception-driven .js-to-.ts probing without changing ambiguous resolutions. */
export function resolveSourceImport(specifier: string, importer: string): string {
	if (!(specifier.startsWith("./") || specifier.startsWith("../")) || !specifier.endsWith(".js")) {
		return specifier;
	}
	const target = resolve(dirname(importer), specifier);
	try {
		// Existing directories and even dangling symlinks belong to Jiti's resolver.
		if (lstatSync(target, { throwIfNoEntry: false })) return specifier;
		const source = `${target.slice(0, -3)}.ts`;
		if (!statSync(source, { throwIfNoEntry: false })?.isFile()) return specifier;
		for (const extension of APPENDED_EXTENSIONS) {
			if (lstatSync(target + extension, { throwIfNoEntry: false })) return specifier;
		}
		return `${specifier.slice(0, -3)}.ts`;
	} catch {
		// Permission and other filesystem errors must retain Jiti's diagnostics.
		return specifier;
	}
}

const SOURCE_IMPORT_MODULE = "atomic:extension-source-import";

// The small Babel plugin protocol used here is structural; Babel itself is
// supplied by jiti/static, not a second runtime dependency.
interface Expression {
	type: string;
	name?: string;
	value?: string;
}
interface CallPath {
	node: { callee: Expression; arguments: Expression[] };
	scope: { getBinding(name: string): object | undefined };
}
interface ProgramPath {
	scope: {
		getBinding(name: string): object | undefined;
		generateUidIdentifier(name: string): Expression;
	};
	unshiftContainer(key: "body", node: Expression): void;
	traverse(visitor: { CallExpression(path: CallPath): void }): void;
}
interface BabelApi {
	types: {
		identifier(name: string): Expression;
		stringLiteral(value: string): Expression;
		callExpression(callee: Expression, args: Expression[]): Expression;
		variableDeclaration(kind: "const", declarations: Expression[]): Expression;
		variableDeclarator(id: Expression, init: Expression): Expression;
	};
}

function sourceImportPlugin({ types }: BabelApi) {
	return {
		post({ path: program }: { path: ProgramPath }) {
			if (program.scope.getBinding("__filename")) return;
			let importer: Expression | undefined;
			const helper = program.scope.generateUidIdentifier("atomicSourceImport");
			// Jiti has now lowered ESM imports, including re-exports and dynamic
			// imports. Only literal relative specifiers participate. Computed,
			// package, virtual and native module imports remain Jiti-owned.
			program.traverse({
				CallExpression(path) {
					const { callee, arguments: args } = path.node;
					const id = args[0];
					if (
						callee.type !== "Identifier" ||
						callee.name !== "jitiImport" ||
						id?.type !== "StringLiteral" ||
						!id.value ||
						!(id.value.startsWith("./") || id.value.startsWith("../")) ||
						!id.value.endsWith(".js") ||
						path.scope.getBinding("jitiImport") ||
						path.scope.getBinding("require")
					)
						return;
					importer ??= program.scope.generateUidIdentifier("atomicSourceFilename");
					args[0] = types.callExpression(helper, [id, importer]);
				},
			});
			if (importer) {
				// Capture the real wrapper filename and helper before extension code
				// can reassign them; hygienic names also survive nested shadowing.
				program.unshiftContainer(
					"body",
					types.variableDeclaration("const", [
						types.variableDeclarator(importer, types.identifier("__filename")),
						types.variableDeclarator(
							helper,
							types.callExpression(types.identifier("require"), [types.stringLiteral(SOURCE_IMPORT_MODULE)]),
						),
					]),
				);
			}
		},
	};
}

/** Immutable transformed code is cached; source resolution and module state are not. */
export function sourceImportOptions(getCacheDir: () => string, aliases: Record<string, string> = {}): JitiOptions {
	// An explicit Jiti policy belongs to the caller. In particular, do not
	// create a cache directory when caching was disabled through either name.
	if (
		["JITI_FS_CACHE", "JITI_CACHE", "JITI_EXTENSIONS", "JITI_TSCONFIG_PATHS", "JITI_TRY_NATIVE", "JITI_JSX"].some(
			(key) => process.env[key] !== undefined,
		)
	)
		return {};
	// Relative aliases can be normalized by Jiti (including trailing slashes).
	// Leave their entire graph untouched rather than duplicate alias semantics.
	const hasRelativeAliases = Object.keys(aliases).some((alias) => !alias || alias.startsWith("."));
	return {
		// Jiti's cache key does not include transformOptions. Never mix ordinary
		// transformed output with output that requires the Atomic virtual helper.
		// Bump this suffix whenever the emitted transform changes.
		fsCache: join(getCacheDir(), "source-imports-v6"),
		transformOptions: { babel: { plugins: [sourceImportPlugin] } },
		virtualModules: {
			[SOURCE_IMPORT_MODULE]: (specifier: string, importer: string) => {
				if (hasRelativeAliases) {
					return specifier;
				}
				return resolveSourceImport(specifier, importer);
			},
		},
	};
}
