import { describe, expect, it } from "vitest";
import { extractPartialCommand } from "../src/extract";

describe("extractPartialCommand", () => {
	it("extracts a complete command field", () => {
		expect(extractPartialCommand('{"command":"git status &&"}')).toBe(
			"git status &&",
		);
	});

	it("extracts an incomplete command field", () => {
		expect(extractPartialCommand('{"command":"git status &&')).toBe(
			"git status &&",
		);
	});

	it("handles escaped characters", () => {
		expect(extractPartialCommand('{"command":"echo \\"hi\\" &&"}')).toBe(
			'echo "hi" &&',
		);
	});

	it("returns null when command is missing", () => {
		expect(extractPartialCommand('{"timeout":30')).toBeNull();
	});
});
