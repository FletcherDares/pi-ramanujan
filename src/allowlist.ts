const READ_ONLY_GIT_COMMANDS = new Set([
	"status",
	"branch",
	"diff",
	"log",
	"show",
	"remote",
	"tag",
	"rev-parse",
	"ls-files",
]);

const MUTATING_OR_EXTERNAL_OPTIONS = [
	"--output",
	"--exec",
	"--ext-diff",
	"--textconv",
];

export function isPreExecutable(command: string): boolean {
	const normalized = command.trim().replace(/\s+/g, " ");
	return isReadOnlyGitCommand(normalized);
}

/**
 * Accept read-only git commands with arbitrary normal arguments. Git's option
 * sets are intentionally not duplicated here: new filters, revisions, and
 * formatting options should not require an allowlist change.
 */
function isReadOnlyGitCommand(command: string): boolean {
	if (!/^git [a-z-]+(?: .*)?$/.test(command)) return false;
	if (/[;&|<>$`\n\r]/.test(command)) return false;

	const [, name, rawArgs = ""] = command.match(/^git ([a-z-]+)(?: (.*))?$/) ?? [];
	if (!READ_ONLY_GIT_COMMANDS.has(name)) return false;

	const args = rawArgs.split(/\s+/).filter(Boolean);
	if (args.some(isMutatingOrExternalOption)) return false;

	// These commands accept positional arguments that are data to inspect.
	if (["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(name)) {
		return true;
	}

	// `git branch NAME` and `git tag NAME` create refs. Only option-only forms
	// are speculative; this still covers listing, formatting, and filtering.
	if (name === "branch" || name === "tag") {
		return args.every((arg) => arg.startsWith("-"));
	}

	// Remote inspection has a small, explicit read-only subcommand grammar.
	return args.length === 0 || ["-v", "--verbose", "show", "get-url"].includes(args[0]);
}

function isMutatingOrExternalOption(arg: string): boolean {
	return (
		arg === "-o" ||
		MUTATING_OR_EXTERNAL_OPTIONS.some(
			(option) => arg === option || arg.startsWith(`${option}=`),
		) ||
		["--delete", "-d", "-D", "--move", "-m", "-M", "--copy", "-c", "-C", "--force", "-f"].includes(arg)
	);
}
