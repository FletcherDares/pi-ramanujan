import { describe, expect, it } from "vitest";
import { isPreExecutable } from "../src/allowlist";

describe("isPreExecutable", () => {
	it("allows git status and git branch", () => {
		expect(isPreExecutable("git status")).toBe(true);
		expect(isPreExecutable("git branch")).toBe(true);
	});

	it("rejects other commands", () => {
		expect(isPreExecutable("git diff")).toBe(false);
		expect(isPreExecutable("git status && git branch")).toBe(false);
	});
});
