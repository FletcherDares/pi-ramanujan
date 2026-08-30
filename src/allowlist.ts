const ALLOW = new Set([
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
]);

export function isPreExecutable(command: string): boolean {
	const normalized = command.trim().replace(/\s+/g, " ");
	return ALLOW.has(normalized) || isReadOnlyGitLog(normalized);
}

/**
 * `git log` has a deliberately open-ended, read-only argument grammar. Keep
 * accepting its normal filters and formatting options without having to grow
 * the allowlist for every useful invocation, while excluding options that can
 * write files, execute commands, or invoke external tooling.
 */
function isReadOnlyGitLog(command: string): boolean {
	if (!/^git log(?: .*)?$/.test(command)) return false;
	if (/[;&|<>$`\n\r]/.test(command)) return false;

	const args = command.slice("git log".length).trim().split(/\s+/).filter(Boolean);
	return !args.some(
		(arg) =>
			arg === "-o" ||
			arg === "--output" ||
			arg.startsWith("--output=") ||
			arg === "--exec" ||
			arg.startsWith("--exec=") ||
			arg === "--ext-diff" ||
			arg === "--textconv",
	);
}
