import { describe, expect, it } from "vitest";
import { RamanujanState, suffixAfterPrefix } from "../src/state";

describe("suffixAfterPrefix", () => {
	it("returns the part after a top-level &&", () => {
		expect(suffixAfterPrefix("git status && git diff", "git status")).toBe(
			"git diff",
		);
	});
});

describe("RamanujanState", () => {
	it("records a prefix during streaming", () => {
		const state = new RamanujanState();
		state.onToolCallStart("call-1", "bash");
		state.onToolCallDelta("call-1", "bash", '{"command":"git status &&"}');

		const history = state.getHistory();
		expect(history).toHaveLength(1);
		expect(history[0]?.phase).toBe("stream");
		expect(history[0]?.prefix).toBe("git status");
	});

	it("records suffix on completion", () => {
		const state = new RamanujanState();
		state.onToolCallStart("call-1", "bash");
		state.onToolCallDelta("call-1", "bash", '{"command":"git status &&"}');
		state.onToolCallComplete(
			"call-1",
			"bash",
			"git status && git diff --stat",
		);

		const complete = state.getHistory().find((entry) => entry.phase === "complete");
		expect(complete?.suffix).toBe("git diff --stat");
	});
});
