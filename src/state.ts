import type { BashExecResult } from "./exec.js";
import { isPreExecutable } from "./allowlist.js";
import { extractPartialCommand } from "./extract.js";
import { prefixBeforeTrailingAnd } from "./split.js";

type Launch = (prefix: string) => Promise<BashExecResult>;

interface Call {
	prefix: string;
	prefixResult: Promise<BashExecResult>;
	suffix: string | null;
	prefixOutput?: BashExecResult;
}

export interface HistoryEntry {
	toolCallId: string;
	command: string;
	prefix: string;
	suffix: string | null;
	phase: "stream" | "done";
}

export class RamanujanState {
	private calls = new Map<string, Call>();
	private history: HistoryEntry[] = [];

	onDelta(
		toolCallId: string,
		partialJson: string,
		launch: Launch,
		parsedCommand?: string,
	): void {
		const command =
			extractPartialCommand(partialJson) ??
			(typeof parsedCommand === "string" ? parsedCommand : null);
		if (!command) return;

		const call = this.calls.get(toolCallId);
		const prefix = prefixBeforeTrailingAnd(command);
		if (!prefix || !isPreExecutable(prefix) || prefix === call?.prefix) return;

		this.calls.set(toolCallId, {
			prefix,
			prefixResult: launch(prefix),
			suffix: null,
		});
		this.history.push({
			toolCallId,
			command,
			prefix,
			suffix: null,
			phase: "stream",
		});
	}

	async prepare(toolCallId: string, command: string): Promise<string | null> {
		const call = this.calls.get(toolCallId);
		if (!call) return null;

		call.suffix = suffixAfterPrefix(command, call.prefix);
		call.prefixOutput = await call.prefixResult;
		const failed =
			call.prefixOutput.exitCode !== 0 ||
			call.prefixOutput.exitCode === undefined ||
			call.prefixOutput.cancelled;

		this.history.push({
			toolCallId,
			command,
			prefix: call.prefix,
			suffix: call.suffix,
			phase: "done",
		});

		if (failed || !call.suffix) return ":";
		return call.suffix;
	}

	stitch(
		toolCallId: string,
		suffixContent: ReadonlyArray<{ type: string; text?: string }>,
		suffixIsError: boolean,
	): { content: Array<{ type: "text"; text: string }>; isError: boolean } | null {
		const call = this.calls.get(toolCallId);
		if (!call?.prefixOutput) return null;

		const failed =
			call.prefixOutput.exitCode !== 0 ||
			call.prefixOutput.exitCode === undefined ||
			call.prefixOutput.cancelled;
		const suffix = suffixContent
			.filter((b) => b.type === "text" && b.text)
			.map((b) => b.text as string)
			.join("");
		const text = failed
			? call.prefixOutput.output
			: [call.prefixOutput.output, suffix].filter(Boolean).join("\n");

		this.calls.delete(toolCallId);
		return {
			content: [{ type: "text", text }],
			isError: failed || Boolean(call.suffix && suffixIsError),
		};
	}

	clear(): void {
		this.calls.clear();
	}

	getHistory(): readonly HistoryEntry[] {
		return this.history;
	}

	clearHistory(): void {
		this.history = [];
	}
}

export function suffixAfterPrefix(command: string, prefix: string): string | null {
	let rest = command.trim().slice(prefix.trim().length).trimStart();
	if (rest.startsWith("&&")) rest = rest.slice(2).trimStart();
	return rest || null;
}

export function formatHistory(history: readonly HistoryEntry[]): string {
	if (!history.length) return "No splits yet.";
	return history
		.map((e, i) => {
			let line = `${i + 1}. [${e.phase}] ${e.command}\n   prefix: ${e.prefix}`;
			if (e.suffix) line += `\n   suffix: ${e.suffix}`;
			return line;
		})
		.join("\n\n");
}
