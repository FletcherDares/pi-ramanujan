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
			"git log -2 --oneline",
			"git log --since=1.week --author=Fletcher --format=%h:%s -- path/to/file",
			"git show",
			"git show --stat",
			"git show --oneline --stat",
			"git remote -v",
			"git tag",
			"git rev-parse --show-toplevel",
			"git rev-parse --abbrev-ref HEAD",
			"git rev-parse --is-inside-work-tree",
			"git ls-files",
			"git diff --cached HEAD -- src/index.ts",
			"git status --short --untracked-files=all",
			"git log --decorate --graph --oneline --all",
			"git show HEAD:src/index.ts",
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
			"git commit -m message",
			"git checkout main",
			"git diff --output=changes.patch",
			"git log --output=history.txt",
			"git log --exec=touch\ hacked",
			"git log --ext-diff",
			"git log --format=%H; rm -rf .",
			"git branch new-branch",
			"git branch -d old-branch",
			"git tag release-1",
			"git remote add origin https://example.com/repo.git",
			"git fetch",
			"git status && git branch",
		]) {
			expect(isPreExecutable(command)).toBe(false);
		}
	});
});
