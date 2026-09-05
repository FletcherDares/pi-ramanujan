import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isBashToolResult, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { runShellCommand } from "../src/exec.js";
import { RamanujanStatsStore } from "../src/stats-store.js";
import { formatStats, RamanujanState } from "../src/state.js";
import { readRamanujanMode } from "../src/mode.js";

function toolBlock(message: { role: string; content?: unknown }, i: number) {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return null;
	const b = message.content[i];
	return b && typeof b === "object" && (b as { type: string }).type === "toolCall"
		? (b as { id: string; name: string; arguments?: Record<string, unknown>; partialJson?: string })
		: null;
}

export default function (pi: ExtensionAPI) {
	const state = new RamanujanState();
	const statsStore = new RamanujanStatsStore(join(homedir(), ".pi", "ramanujan-stats.data"));

	state.setPersistence((change) => {
		try {
			statsStore?.append(change);
		} catch (error) {
			console.error("Failed to persist Ramanujan stats:", error);
		}
	});

	pi.on("session_start", (_event, _ctx: ExtensionContext) => {
		state.restore(statsStore.load());
	});

	pi.on("message_update", async (event, ctx) => {
		if (!state.isEnabled()) return;

		const stream = event.assistantMessageEvent;
		if (!stream || stream.type !== "toolcall_delta") return;

		const block = toolBlock(event.message, stream.contentIndex);
		if (!block || block.name !== "bash") return;

		state.onDelta(
			block.id,
			block.partialJson ?? "",
			(prefix, signal) => runShellCommand(prefix, ctx.cwd, signal),
			typeof block.arguments?.command === "string" ? block.arguments.command : undefined,
			ctx.signal,
		);
	});

	pi.on("tool_call", async (event) => {
		if (!state.isEnabled()) return;
		if (!isToolCallEventType("bash", event)) return;
		const cmd = await state.prepare(event.toolCallId, event.input.command);
		if (cmd) event.input.command = cmd;
	});

	pi.on("tool_result", async (event) => {
		if (!state.isEnabled()) return;
		if (!isBashToolResult(event)) return;
		return state.stitch(event.toolCallId, event.content, event.isError) ?? undefined;
	});

	pi.on("turn_end", async () => state.clear());
	pi.on("session_shutdown", async () => state.clear());

	pi.registerCommand("ramanujan", {
		description: "Show speculative execution stats",
		handler: async (args, ctx) => {
			if (args.trim() === "clear") {
				state.clearStats();
				ctx.ui.notify("Cleared.", "info");
				return;
			}
			state.restore(statsStore.load());
			ctx.ui.notify(formatStats(state.getStats()), "info");
		},
	});
}
