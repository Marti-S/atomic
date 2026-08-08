import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bunExecutable } from "../../../../../test/helpers/runtime.ts";

/** Deadline for the real Bun child that runs Bun-only mock.module. */
const subprocessTimeoutMs = 10_000;

/**
 * Regression test for https://github.com/earendil-works/pi-mono/issues/2791
 *
 * fs.watch() returns an FSWatcher (EventEmitter). If the watcher emits an
 * 'error' event after creation and no error handler is attached, Node.js
 * treats it as an uncaught exception and terminates the process.
 *
 * We test this by spawning a child process that:
 * 1. Replaces node:fs.watch with a captured in-memory watcher
 * 2. Sets up a custom theme with the watcher enabled
 * 3. Emits a synthetic 'error' event on the captured watcher
 * 4. If the watcher has no error handler -> crash (exit != 0) -> bug present
 * 5. If the watcher has an error handler -> clean exit (exit 0) -> bug fixed
 */
describe("issue #2791 fs.watch error event crashes process", () => {
	let tempRoot: string;

	beforeEach(() => {
		tempRoot = mkdtempSync(join(tmpdir(), "pi-2791-"));
		const agentDir = join(tempRoot, "agent");
		const themesDir = join(agentDir, "themes");
		mkdirSync(themesDir, { recursive: true });

		// Copy dark.json as "custom-test" theme
		const darkThemePath = join(__dirname, "../../../src/modes/interactive/theme/dark.json");
		const darkTheme = JSON.parse(readFileSync(darkThemePath, "utf-8"));
		darkTheme.name = "custom-test";
		writeFileSync(join(themesDir, "custom-test.json"), JSON.stringify(darkTheme, null, 2));
	});

	afterEach(() => {
		rmSync(tempRoot, { recursive: true, force: true });
	});

	it("process should survive an error event on the theme FSWatcher", () => {
		const globalThemeModuleUrl = pathToFileURL(
			join(__dirname, "../../../src/modes/interactive/theme/global-theme.ts"),
		).href;
		const agentDir = join(tempRoot, "agent");

		// Script that sets up the watcher and emits a synthetic error on it.
		// If no .on('error') handler is attached, EventEmitter.emit('error')
		// throws, which either crashes the process or gets caught by our try/catch.
		const script = `
import { mock } from "bun:test";
import { EventEmitter } from "node:events";
import * as realFs from "node:fs";

let fsWatcher;

mock.module("node:fs", () => ({
	...realFs,
	watch: () => {
		fsWatcher = Object.assign(new EventEmitter(), { close() {} });
		return fsWatcher;
	},
}));

const { setTheme, stopThemeWatcher } = await import(${JSON.stringify(globalThemeModuleUrl)});
setTheme("custom-test", true);

if (!fsWatcher) {
	process.stderr.write("theme fs.watch was not called\\n");
	process.exit(2);
}

const errorListenerCount = fsWatcher.listenerCount("error");
if (errorListenerCount === 0) {
	process.stderr.write("BUG: FSWatcher has no error handler (issue #2791)\\n");
}

// Emitting 'error' on an EventEmitter with no error listener throws.
// This simulates an async OS error (e.g. ReadDirectoryChangesW invalidation).
try {
	fsWatcher.emit("error", new Error("simulated OS watcher failure"));
} catch {
	process.stderr.write("error event was unhandled and threw\\n");
	process.exit(1);
}

stopThemeWatcher();
process.exit(0);
`;

		const child = spawnSync(bunExecutable(), ["--eval", script], {
			timeout: subprocessTimeoutMs,
			encoding: "utf-8",
			env: { ...process.env, ATOMIC_CODING_AGENT_DIR: agentDir },
			stdio: ["pipe", "pipe", "pipe"],
		});
		const timedOut = child.error !== undefined && "code" in child.error && child.error.code === "ETIMEDOUT";
		if (timedOut) {
			throw new Error(
				[
					`Theme watcher child timed out after ${subprocessTimeoutMs}ms.`,
					"This is test-infrastructure starvation, not the #2791 FSWatcher crash. Retry on a runner with capacity.",
					`stderr: ${child.stderr.trim()}`,
				].join("\n"),
			);
		}

		if (child.signal !== null) {
			throw new Error(
				[
					`Theme watcher child was killed by ${child.signal} before it could report an exit code.`,
					"This is test-infrastructure pressure, not the #2791 FSWatcher crash.",
					`stderr: ${child.stderr.trim()}`,
				].join("\n"),
			);
		}

		expect(child.error, `Could not start Bun child: ${child.error?.message ?? ""}`).toBeUndefined();
		const crashDiagnostic = [
			`Theme watcher child exited non-zero (exit ${child.status ?? child.signal ?? "unknown"}).`,
			"This may be the #2791 FSWatcher crash.",
			`stderr: ${child.stderr.trim()}`,
		].join("\n");
		expect(child.status, crashDiagnostic).toBe(0);
	});
});
