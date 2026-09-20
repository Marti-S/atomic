import type { ChildProcess, ChildProcessByStdio } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { createInterface } from "node:readline";
import { type Duplex, PassThrough, type Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnProcess, waitForChildProcess } from "../../../src/utils/child-process.ts";

function createSyntheticChildProcess(): { child: ChildProcess; stdout: PassThrough } {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const events = new EventEmitter();
	const child = Object.assign(events, {
		stdout,
		stderr,
		stdin: null,
		stdio: [null, stdout, stderr, null, null],
		pid: 0,
		connected: false,
		killed: false,
		exitCode: null,
		signalCode: null,
		spawnargs: [],
		spawnfile: "synthetic-child",
		kill: () => true,
		ref: () => events as ChildProcess,
		unref: () => events as ChildProcess,
		send: () => false,
		disconnect: () => undefined,
	}) as ChildProcess;

	return { child, stdout };
}

/**
 * Regression test for https://github.com/earendil-works/pi/issues/5303
 *
 * waitForChildProcess armed a fixed 100ms timer on `exit` and destroyed the
 * stdio streams when it fired. When a short-lived detached descendant kept the
 * stdout pipe open, `close` never fired, so that timer was the only thing that
 * resolved the wait, and any output written more than 100ms after exit was
 * binned.
 */
describe.skipIf(process.platform === "win32")("issue #5303 bash output truncation past exit", () => {
	let child: ChildProcessByStdio<null, Readable, Readable> | undefined;

	afterEach(() => {
		vi.useRealTimers();
		if (child?.pid) {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				// Already gone.
			}
		}
		child = undefined;
	});

	it("captures output emitted after exit while a detached child holds stdout open", async () => {
		// Control the drain clock, not OS scheduling. The real descendant cannot
		// emit a tick until the test requests it after observing the parent's exit.
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const writer = `
			const fs = require("node:fs");
			const command = Buffer.alloc(1);
			let tick = 0;
			while (fs.readSync(3, command, 0, 1, null) === 1 && command[0] === 84) {
				fs.writeSync(1, "TICK" + (++tick) + "\\n");
			}
		`;
		const parent = `
			require("node:fs").writeSync(1, "HEAD\\n");
			require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(writer)}], {
				stdio: ["ignore", 1, 2, 3]
			}).unref();
			process.exit(0);
		`;
		child = spawnProcess(process.execPath, ["-e", parent], {
			stdio: ["ignore", "pipe", "pipe", "pipe"],
			detached: true,
		}) as ChildProcessByStdio<null, Readable, Readable>;
		const control = child.stdio[3] as Duplex;
		const lines = createInterface({ input: child.stdout });
		const received = lines[Symbol.asyncIterator]();
		let resolved = false;
		const wait = waitForChildProcess(child).then((code) => {
			resolved = true;
			return code;
		});
		try {
			await once(child, "exit");
			expect((await received.next()).value).toBe("HEAD");
			for (let tick = 1; tick <= 30; tick++) {
				await vi.advanceTimersByTimeAsync(50);
				expect(resolved).toBe(false);
				control.write("T");
				expect(await received.next()).toEqual({ value: `TICK${tick}`, done: false });
			}
			control.end("Q");
			expect(await wait).toBe(0);
			expect((await received.next()).done).toBe(true);
		} finally {
			control.destroy();
			lines.close();
		}
	});

	it("resolves promptly when a detached child holds stdout open but stays quiet", async () => {
		const command = 'printf "DONE\\n"; ( sleep 30 ) &';
		child = spawnProcess("/bin/sh", ["-c", command], {
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		}) as ChildProcessByStdio<null, Readable, Readable>;

		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});

		const start = Date.now();
		const exitCode = await waitForChildProcess(child);
		const elapsed = Date.now() - start;

		expect(exitCode).toBe(0);
		expect(output).toContain("DONE");
		expect(elapsed).toBeLessThan(2000);
	});

	// Issue #5303: activity extends the idle grace; it does not remove the bound.
	it("re-arms the idle cutoff for output just below the boundary", async () => {
		vi.useFakeTimers();
		const idleGraceMs = 100;
		const synthetic = createSyntheticChildProcess();
		let output = "";
		synthetic.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		let resolved = false;
		const wait = waitForChildProcess(synthetic.child).then((code) => {
			resolved = true;
			return code;
		});
		synthetic.child.emit("exit", 0, null);
		await vi.advanceTimersByTimeAsync(idleGraceMs - 1);
		synthetic.stdout.write("TAIL\n");
		await vi.advanceTimersByTimeAsync(idleGraceMs - 1);
		expect(resolved).toBe(false);
		expect(output).toBe("TAIL\n");
		await vi.advanceTimersByTimeAsync(1);
		expect(await wait).toBe(0);
		expect(synthetic.stdout.destroyed).toBe(true);
	});

	it("closes an idle inherited pipe before output above the cutoff", async () => {
		vi.useFakeTimers();
		const idleGraceMs = 100;
		const synthetic = createSyntheticChildProcess();
		let output = "";
		synthetic.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		let resolved = false;
		const wait = waitForChildProcess(synthetic.child).then((code) => {
			resolved = true;
			return code;
		});
		synthetic.child.emit("exit", 0, null);
		synthetic.stdout.write("HEAD\n");
		await vi.advanceTimersByTimeAsync(idleGraceMs + 1);
		expect(resolved).toBe(true);
		expect(await wait).toBe(0);
		expect(synthetic.stdout.destroyed).toBe(true);
		expect(synthetic.stdout.write("TAIL\n")).toBe(false);
		expect(output).toBe("HEAD\n");
	});

	it("enforces an active-drain hard cap when a detached child keeps writing after exit", async () => {
		vi.useFakeTimers();
		const activeDrainCapMs = 5_000;
		const synthetic = createSyntheticChildProcess();

		let output = "";
		synthetic.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});

		let resolved = false;
		const wait = waitForChildProcess(synthetic.child).then((code) => {
			resolved = true;
			return code;
		});
		synthetic.child.emit("exit", 0, null);
		synthetic.stdout.emit("data", Buffer.from("HEAD\n"));

		const noiseInterval = setInterval(() => {
			synthetic.stdout.emit("data", Buffer.from("NOISE\n"));
		}, 50);

		vi.advanceTimersByTime(activeDrainCapMs - 1);
		await Promise.resolve();
		expect(resolved).toBe(false);
		clearInterval(noiseInterval);

		vi.advanceTimersByTime(1);
		const exitCode = await wait;

		expect(exitCode).toBe(0);
		expect(output).toContain("HEAD");
		expect(output).toContain("NOISE");
		expect(resolved).toBe(true);
	});
});
