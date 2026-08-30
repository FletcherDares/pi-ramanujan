import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RamanujanStatsStore } from "../src/stats-store";

describe("RamanujanStatsStore", () => {
	it("persists updates across store instances", () => {
		const directory = mkdtempSync(join(tmpdir(), "ramanujan-"));
		try {
			const file = join(directory, "stats.data");
			const first = new RamanujanStatsStore(file);
			first.append({ version: 1, kind: "update", speculations: 1, speculativeMs: 12 });
			first.append({ version: 1, kind: "clear", speculations: 0, speculativeMs: 0 });
			first.append({ version: 1, kind: "update", speculations: 2, speculativeMs: 34 });

			const second = new RamanujanStatsStore(file);
			expect(second.load()).toEqual([
				{ version: 1, kind: "update", speculations: 1, speculativeMs: 12 },
				{ version: 1, kind: "clear", speculations: 0, speculativeMs: 0 },
				{ version: 1, kind: "update", speculations: 2, speculativeMs: 34 },
			]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
