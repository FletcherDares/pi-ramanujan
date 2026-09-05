import { describe, expect, it } from "vitest";
import { readRamanujanMode } from "../src/mode";

describe("readRamanujanMode", () => {
	it("defaults to on", () => {
		expect(readRamanujanMode("C:/path-that-does-not-exist")).toBe("on");
	});
});
