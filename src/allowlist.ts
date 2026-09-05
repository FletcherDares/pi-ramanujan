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
	if (/[;&|<>$`'"\\\n\r#]/.test(command)) return false;
	const normalized = command.trim().replace(/\s+/g, " ");
	return isReadOnlyGitCommand(normalized);
}

function isReadOnlyGitCommand(command: string): boolean {
	if (!/^git [a-z-]+(?: .*)?$/.test(command)) return false;
	if (/[;&|<>$`\n\r]/.test(command)) return false;

	const [, name, rawArgs = ""] = command.match(/^git ([a-z-]+)(?: (.*))?$/) ?? [];
	if (!READ_ONLY_GIT_COMMANDS.has(name)) return false;

	const args = rawArgs.split(/\s+/).filter(Boolean);
	if (args.some(isMutatingOrExternalOption)) return false;

	if (["status", "diff", "log", "show", "rev-parse", "ls-files"].includes(name)) {
		return true;
	}

	if (name === "branch" || name === "tag") {
		return args.every((arg) => arg.startsWith("-"));
	}

	return args.length === 0 || ["-v", "--verbose", "get-url"].includes(args[0]);
}

function isMutatingOrExternalOption(arg: string): boolean {
	const normalized = arg.toLowerCase();
	return (
		arg === "-o" ||
		MUTATING_OR_EXTERNAL_OPTIONS.some(
			(option) => normalized === option || normalized.startsWith(`${option}=`) ||
			(normalized.length > 2 && option.startsWith("--") && option.startsWith(normalized.split("=", 1)[0])),
		) ||
		[
			"--delete", "-d", "-D", "--move", "-m", "-M", "--copy", "-c", "-C",
			"--force", "-f", "--set-upstream", "--set-upstream-to", "--unset-upstream",
		].includes(normalized) ||
		(normalized.startsWith("--set-upstream=") || normalized.startsWith("--set-upstream-to="))
	);
}
