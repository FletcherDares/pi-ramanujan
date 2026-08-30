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
	return ALLOW.has(command.trim().replace(/\s+/g, " "));
}
