import { describe, expect, it } from "vitest";
import { isPreExecutable } from "../src/allowlist";

describe("isPreExecutable", () => {
	it("allows common read-only git commands", () => {
		for (const command of [
			"git status",
			"git status --short",
			"git status --porcelain",
			"git branch",
			"git branch --show-current",
			"git branch -a",
			"git diff",
			"git diff --stat",
			"git diff --shortstat",
			"git diff --name-only",
			"git diff --name-status",
			"git log",
			"git log --oneline",
			"git show",
			"git show --stat",
			"git show --oneline --stat",
			"git remote -v",
			"git tag",
			"git rev-parse --show-toplevel",
			"git rev-parse --abbrev-ref HEAD",
			"git rev-parse --is-inside-work-tree",
			"git ls-files",
		]) {
			expect(isPreExecutable(command)).toBe(true);
		}
	});

	it("normalizes whitespace", () => {
		expect(isPreExecutable("  git   status\t--short  ")).toBe(true);
	});

	it("rejects mutating commands and unsafe arguments", () => {
		for (const command of [
			"git add .",
			"git commit -m message",
			"git branch -d old-branch",
			"git checkout main",
			"git diff --output=changes.patch",
			"git log -n 10",
			"git show HEAD",
			"git fetch",
			"git status && git branch",
		]) {
			expect(isPreExecutable(command)).toBe(false);
		}
	});
});
