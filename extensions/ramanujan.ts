import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { formatHistory, RamanujanState } from "../src/state.js";

const state = new RamanujanState();

type ToolCallBlock = {
	type: "toolCall";
	id: string;
	name: string;
	arguments?: Record<string, unknown>;
	partialJson?: string;
};

function getToolCallBlock(
	message: { role: string; content?: unknown },
	contentIndex: number,
): ToolCallBlock | null {
	if (message.role !== "assistant" || !Array.isArray(message.content)) {
		return null;
	}
	const block = message.content[contentIndex];
	if (!block || typeof block !== "object") {
		return null;
	}
	if ((block as ToolCallBlock).type !== "toolCall") {
		return null;
	}
	return block as ToolCallBlock;
}

export default function (pi: ExtensionAPI) {
	pi.on("message_update", async (event) => {
		const stream = event.assistantMessageEvent;
		if (!stream || typeof stream !== "object" || !("type" in stream)) {
			return;
		}

		if (stream.type === "toolcall_start") {
			if (event.message.role !== "assistant") {
				return;
			}
			const block = getToolCallBlock(event.message, stream.contentIndex);
			if (!block) {
				return;
			}
			state.onToolCallStart(block.id, block.name);
			return;
		}

		if (stream.type === "toolcall_delta") {
			if (event.message.role !== "assistant") {
				return;
			}
			const block = getToolCallBlock(event.message, stream.contentIndex);
			if (!block) {
				return;
			}
			const parsedCommand =
				typeof block.arguments?.command === "string"
					? block.arguments.command
					: undefined;
			state.onToolCallDelta(
				block.id,
				block.name,
				block.partialJson ?? "",
				parsedCommand,
			);
		}
	});

	pi.on("tool_call", async (event) => {
		if (isToolCallEventType("bash", event)) {
			state.onToolCallComplete(
				event.toolCallId,
				event.toolName,
				event.input.command,
			);
			return;
		}
		if (event.toolName === "powershell" && typeof event.input.command === "string") {
			state.onToolCallComplete(
				event.toolCallId,
				event.toolName,
				event.input.command,
			);
		}
	});

	pi.on("turn_end", async () => {
		state.onTurnEnd();
	});

	pi.registerCommand("ramanujan", {
		description: "Show detected bash && splits (detect-only mode)",
		handler: async (args, ctx) => {
			if (args.trim() === "clear") {
				state.clearHistory();
				ctx.ui.notify("Ramanujan history cleared.", "info");
				return;
			}
			ctx.ui.notify(formatHistory(state.getHistory()), "info");
		},
	});
}
