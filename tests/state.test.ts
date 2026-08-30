import { describe, expect, it } from "vitest";
import { RamanujanState } from "../src/state";

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
});
