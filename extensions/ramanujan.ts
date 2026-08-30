import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { isBashToolResult, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { runShellCommand } from "../src/exec.js";
import {
	formatStats,
	isRamanujanStateChange,
	RAMANUJAN_STATE_ENTRY,
	RamanujanState,
} from "../src/state.js";

function toolBlock(message: { role: string; content?: unknown }, i: number) {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return null;
	const b = message.content[i];
	return b && typeof b === "object" && (b as { type: string }).type === "toolCall"
		? (b as { id: string; name: string; arguments?: Record<string, unknown>; partialJson?: string })
		: null;
}

export default function (pi: ExtensionAPI) {
	const state = new RamanujanState();

	// Custom entries are persisted in Pi's session JSONL but are not sent to the
	// model. Store changes rather than full snapshots so the session does not grow
	// quadratically as the history gets longer.
	state.setPersistence((change) => pi.appendEntry(RAMANUJAN_STATE_ENTRY, change));

	const restoreState = (_event: unknown, ctx: ExtensionContext) => {
		const changes = ctx.sessionManager
			.getBranch()
			.filter(
				(entry): entry is Extract<SessionEntry, { type: "custom" }> =>
					entry.type === "custom" && entry.customType === RAMANUJAN_STATE_ENTRY,
			)
			.map((entry) => entry.data)
			.filter(isRamanujanStateChange);
		state.restore(changes);
	};

	pi.on("session_start", restoreState);
	pi.on("session_tree", restoreState);

	pi.on("message_update", async (event, ctx) => {
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
		if (!isToolCallEventType("bash", event)) return;
		const cmd = await state.prepare(event.toolCallId, event.input.command);
		if (cmd) event.input.command = cmd;
	});

	pi.on("tool_result", async (event) => {
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
			ctx.ui.notify(formatStats(state.getStats()), "info");
		},
	});
}
