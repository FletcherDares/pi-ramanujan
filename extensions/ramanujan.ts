import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isBashToolResult, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { runShellCommand } from "../src/exec.js";
import { formatHistory, formatStats, RamanujanState } from "../src/state.js";

const state = new RamanujanState();

function toolBlock(message: { role: string; content?: unknown }, i: number) {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return null;
	const b = message.content[i];
	return b && typeof b === "object" && (b as { type: string }).type === "toolCall"
		? (b as { id: string; name: string; arguments?: Record<string, unknown>; partialJson?: string })
		: null;
}

export default function (pi: ExtensionAPI) {
	pi.on("message_update", async (event, ctx) => {
		const stream = event.assistantMessageEvent;
		if (!stream || stream.type !== "toolcall_delta") return;

		const block = toolBlock(event.message, stream.contentIndex);
		if (!block || block.name !== "bash") return;

		state.onDelta(
			block.id,
			block.partialJson ?? "",
			(prefix) => runShellCommand(prefix, ctx.cwd, ctx.signal),
			typeof block.arguments?.command === "string" ? block.arguments.command : undefined,
		);
	});

	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const cmd = await state.prepare(event.toolCallId, event.input.command);
		if (cmd) event.input.command = cmd;
	});

	pi.on("tool_result", async (event) => {
		if (!isBashToolResult(event)) return;
		return state.stitch(event.toolCallId, event.content, event.isError) ?? undefined;
	});

	pi.on("turn_end", async () => state.clear());

	pi.registerCommand("ramanujan", {
		description: "Show speculative && splits",
		handler: async (args, ctx) => {
			if (args.trim() === "clear") {
				state.clearHistory();
				ctx.ui.notify("Cleared.", "info");
				return;
			}
			ctx.ui.notify(
				`${formatStats(state.getStats())}\n\n${formatHistory(state.getHistory())}`,
				"info",
			);
		},
	});
}
