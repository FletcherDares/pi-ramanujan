import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type RamanujanMode = "on" | "off";

export function readRamanujanMode(cwd: string): RamanujanMode {
	const global = readSettings(join(homedir(), ".pi", "agent", "settings.json"));
	const project = readSettings(join(cwd, ".pi", "settings.json"));
	const value = project?.ramanujan?.mode ?? global?.ramanujan?.mode;
	return value === "off" ? "off" : "on";
}

function readSettings(path: string): { ramanujan?: { mode?: unknown } } | undefined {
	try {
		const value: unknown = JSON.parse(readFileSync(path, "utf8"));
		return value && typeof value === "object" ? (value as { ramanujan?: { mode?: unknown } }) : undefined;
	} catch {
		return undefined;
	}
}
