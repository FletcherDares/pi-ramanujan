const ALLOW = new Set(["git status", "git branch"]);

export function isPreExecutable(command: string): boolean {
	return ALLOW.has(command.trim().replace(/\s+/g, " "));
}
