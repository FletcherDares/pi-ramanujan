import { describe, expect, it } from "vitest";
import { formatStats, RamanujanState } from "../src/state";
import type { BashExecResult } from "../src/exec";

const ok = async () => ({ output: "prefix-out", exitCode: 0, cancelled: false });
const fail = async () => ({ output: "prefix-err", exitCode: 1, cancelled: false });

describe("RamanujanState", () => {
	it("launches allowlisted prefix on stream", () => {
		const state = new RamanujanState();
		let launched = false;
		state.onDelta("id-1", '{"command":"git status &&"}', async () => {
			launched = true;
			return ok();
		});
		expect(launched).toBe(true);
	});

	it("rewrites to suffix after successful prefix", async () => {
		const state = new RamanujanState();
		state.onDelta("id-1", '{"command":"git status &&"}', ok);
		expect(await state.prepare("id-1", "git status && git branch")).toBe("git branch");
	});

	it("no-ops when prefix fails", async () => {
		const state = new RamanujanState();
		state.onDelta("id-1", '{"command":"git status &&"}', fail);
		expect(await state.prepare("id-1", "git status && git branch")).toBe(":");
	});

	it("stitches output", async () => {
		const state = new RamanujanState();
		state.onDelta("id-1", '{"command":"git status &&"}', ok);
		await state.prepare("id-1", "git status && git branch");
		const result = state.stitch("id-1", [{ type: "text", text: "suffix-out" }], false);
		expect(result?.content[0]?.text).toBe("prefix-out\nsuffix-out");
	});

	it("tracks speculative execution before prepare", async () => {
		let now = 100;
		let resolve!: (value: BashExecResult) => void;
		const prefixResult = new Promise<BashExecResult>((r) => {
			resolve = r;
		});
		const state = new RamanujanState(() => now);

		state.onDelta("id-1", '{"command":"git status &&"}', async () => prefixResult);
		expect(state.getStats()).toEqual({ speculations: 1, speculativeMs: 0 });

		now = 150;
		const prepared = state.prepare("id-1", "git status && git branch");
		expect(state.getStats()).toEqual({ speculations: 1, speculativeMs: 50 });

		now = 200;
		resolve({ output: "prefix-out", exitCode: 0, cancelled: false });
		expect(await prepared).toBe("git branch");
	});

	it("formats stats", () => {
		expect(formatStats({ speculations: 2, speculativeMs: 1234 })).toBe(
			"2 speculations, 1.23s speculative execution.",
		);
	});
});
