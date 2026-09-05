import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { isRamanujanStateChange, type RamanujanStateChange } from "./state.js";

export class RamanujanStatsStore {
	constructor(private readonly filePath: string) {}

	load(): RamanujanStateChange[] {
		let content: string;
		try {
			content = readFileSync(this.filePath, "utf8");
		} catch {
			return [];
		}

		const changes: RamanujanStateChange[] = [];
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			try {
				const value: unknown = JSON.parse(line);
				if (isRamanujanStateChange(value)) changes.push(value);
			} catch {
			}
		}
		return changes;
	}

	append(change: RamanujanStateChange): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		appendFileSync(this.filePath, `${JSON.stringify(change)}\n`, "utf8");
	}
}
