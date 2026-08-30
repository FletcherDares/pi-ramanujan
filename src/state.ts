import { extractPartialCommand } from "./extract.js";
import { prefixBeforeTrailingAnd } from "./split.js";

const SHELL_TOOLS = new Set(["bash", "powershell"]);

export interface ShellDetection {
	toolCallId: string;
	toolName: string;
	command: string;
	prefix: string | null;
	suffix: string | null;
	phase: "stream" | "complete";
	at: number;
}

interface ActiveCall {
	toolName: string;
	lastCommand: string;
	streamPrefix: string | null;
}

export class RamanujanState {
	private active = new Map<string, ActiveCall>();
	private history: ShellDetection[] = [];

	onToolCallStart(toolCallId: string, toolName: string): void {
		if (!SHELL_TOOLS.has(toolName)) {
			return;
		}
		this.active.set(toolCallId, {
			toolName,
			lastCommand: "",
			streamPrefix: null,
		});
	}

	onToolCallDelta(
		toolCallId: string,
		toolName: string,
		partialJson: string,
		parsedCommand?: string,
	): void {
		if (!SHELL_TOOLS.has(toolName)) {
			return;
		}

		const command =
			extractPartialCommand(partialJson) ??
			(typeof parsedCommand === "string" ? parsedCommand : null);
		if (command === null) {
			return;
		}

		let call = this.active.get(toolCallId);
		if (!call) {
			call = { toolName, lastCommand: "", streamPrefix: null };
			this.active.set(toolCallId, call);
		}

		call.lastCommand = command;
		const prefix = prefixBeforeTrailingAnd(command);
		if (prefix === null || prefix === call.streamPrefix) {
			return;
		}

		call.streamPrefix = prefix;
		this.history.push({
			toolCallId,
			toolName,
			command,
			prefix,
			suffix: null,
			phase: "stream",
			at: Date.now(),
		});
	}

	onToolCallComplete(toolCallId: string, toolName: string, command: string): void {
		if (!SHELL_TOOLS.has(toolName)) {
			return;
		}

		const call = this.active.get(toolCallId);
		const prefix = call?.streamPrefix ?? null;
		const suffix = prefix ? suffixAfterPrefix(command, prefix) : null;

		this.history.push({
			toolCallId,
			toolName,
			command,
			prefix,
			suffix,
			phase: "complete",
			at: Date.now(),
		});

		this.active.delete(toolCallId);
	}

	onTurnEnd(): void {
		this.active.clear();
	}

	getHistory(): readonly ShellDetection[] {
		return this.history;
	}

	clearHistory(): void {
		this.history = [];
	}
}

export function suffixAfterPrefix(command: string, prefix: string): string | null {
	const commandTrimmed = command.trim();
	const prefixTrimmed = prefix.trim();
	if (!commandTrimmed.startsWith(prefixTrimmed)) {
		return null;
	}

	let rest = commandTrimmed.slice(prefixTrimmed.length).trimStart();
	if (rest.startsWith("&&")) {
		rest = rest.slice(2).trimStart();
	}
	return rest.length > 0 ? rest : null;
}

export function formatHistory(history: readonly ShellDetection[]): string {
	if (history.length === 0) {
		return "No bash splits detected yet.";
	}

	return history
		.map((entry, index) => {
			const lines = [
				`${index + 1}. [${entry.phase}] ${entry.toolName} (${entry.toolCallId})`,
				`   command: ${entry.command}`,
			];
			if (entry.prefix) {
				lines.push(`   prefix:  ${entry.prefix}`);
			}
			if (entry.suffix) {
				lines.push(`   suffix:  ${entry.suffix}`);
			}
			return lines.join("\n");
		})
		.join("\n\n");
}
