import { describe, expect, it } from "vitest";
import { prefixBeforeTrailingAnd, splitTopLevelAndChain } from "../src/split";

describe("splitTopLevelAndChain", () => {
	it("splits top-level commands without splitting quoted &&", () => {
		expect(splitTopLevelAndChain("git status && git branch && echo 'a && b'")).toEqual([
			"git status",
			"git branch",
			"echo 'a && b'",
		]);
	});
});

describe("prefixBeforeTrailingAnd", () => {
	it("returns the prefix when the command ends with &&", () => {
		expect(prefixBeforeTrailingAnd("git status &&")).toBe("git status");
		expect(prefixBeforeTrailingAnd("git status && ")).toBe("git status");
	});

	it("returns null when there is no trailing &&", () => {
		expect(prefixBeforeTrailingAnd("git status")).toBeNull();
		expect(prefixBeforeTrailingAnd("git status && git diff")).toBeNull();
	});

	it("does not split && inside single quotes", () => {
		expect(prefixBeforeTrailingAnd("echo 'a && b' &&")).toBe("echo 'a && b'");
	});

	it("does not split && inside double quotes", () => {
		expect(prefixBeforeTrailingAnd('echo "a && b" &&')).toBe('echo "a && b"');
	});

	it("handles multiple top-level && chains", () => {
		expect(prefixBeforeTrailingAnd("git status && git diff &&")).toBe(
			"git status && git diff",
		);
	});

	it("returns null for unclosed quotes", () => {
		expect(prefixBeforeTrailingAnd('echo "unfinished &&')).toBeNull();
		expect(prefixBeforeTrailingAnd("echo 'unfinished &&")).toBeNull();
	});

	it("returns null for empty prefix", () => {
		expect(prefixBeforeTrailingAnd("&&")).toBeNull();
		expect(prefixBeforeTrailingAnd(" && ")).toBeNull();
	});
});
