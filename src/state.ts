import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from "@earendil-works/pi-coding-agent";
import type { BashExecResult } from "./exec.js";
import { isPreExecutable } from "./allowlist.js";
import { extractPartialCommand } from "./extract.js";
import { prefixBeforeTrailingAnd, splitTopLevelAndChain } from "./split.js";

type Launch = (prefix: string, signal: AbortSignal) => Promise<BashExecResult>;
type PersistStateChange = (change: RamanujanStateChange) => void;

interface Call {
	prefix: string;
	speculations: Array<{ command: string; result: Promise<BashExecResult> }>;
	suffix: string | null;
	prefixOutput?: BashExecResult[];
	startedAt: number;
	endedAt?: number;
	accounted?: boolean;
	controller: AbortController;
	removeParentAbort?: () => void;
}

export interface SpeculationStats {
	speculations: number;
	speculativeMs: number;
}

/** A compact, project-persisted stats update. It is not sent to the model. */
export interface RamanujanStateChange {
	version: 1;
	kind: "update" | "clear";
	speculations: number;
	speculativeMs: number;
}

export function isRamanujanStateChange(value: unknown): value is RamanujanStateChange {
	if (!value || typeof value !== "object") return false;
	const change = value as Partial<RamanujanStateChange>;
	return (
		change.version === 1 &&
		(change.kind === "update" || change.kind === "clear") &&
		numberIsFiniteNonNegative(change.speculations) &&
		Number.isInteger(change.speculations) &&
		numberIsFiniteNonNegative(change.speculativeMs)
	);
}

export class RamanujanState {
	private calls = new Map<string, Call>();
	private stats: SpeculationStats = { speculations: 0, speculativeMs: 0 };
	private persist?: PersistStateChange;

	constructor(private readonly now = Date.now) {}

	setPersistence(listener: PersistStateChange | undefined): void {
		this.persist = listener;
	}

	restore(changes: readonly RamanujanStateChange[]): void {
		// Reloading persisted counters must not affect active execution.
		this.stats = { speculations: 0, speculativeMs: 0 };
		for (const change of changes) {
			if (change.kind === "clear") {
				this.stats = { speculations: 0, speculativeMs: 0 };
				continue;
			}
			this.stats.speculations += change.speculations;
			this.stats.speculativeMs += change.speculativeMs;
		}
	}

	onDelta(
		toolCallId: string,
		partialJson: string,
		launch: Launch,
		parsedCommand?: string,
		parentSignal?: AbortSignal,
	): void {
		const command =
			extractPartialCommand(partialJson) ??
			(typeof parsedCommand === "string" ? parsedCommand : null);
		if (!command) return;

		const existing = this.calls.get(toolCallId);
		const prefix = prefixBeforeTrailingAnd(command);
		const parts = prefix ? splitTopLevelAndChain(prefix) : null;
		if (!prefix || !parts) return;

		let call = existing;
		let speculativeMs = 0;
		const retained = Boolean(
			call &&
			call.speculations.every((_, index) => parts[index] === call!.speculations[index]?.command),
		);
		if (call && !retained) {
			speculativeMs = this.account(call);
			this.disposeCall(call, true);
			this.calls.delete(toolCallId);
			call = undefined;
		}

		const launchParts = parts.slice(call?.speculations.length ?? 0);
		const eligibleParts: string[] = [];
		for (const part of launchParts) {
			if (!isPreExecutable(part)) break;
			eligibleParts.push(part);
		}
		if (!eligibleParts.length) {
			if (speculativeMs) this.emit(0, speculativeMs);
			return;
		}
		if (parentSignal?.aborted) {
			if (speculativeMs) this.emit(0, speculativeMs);
			return;
		}

		const controller = call?.controller ?? new AbortController();
		let removeParentAbort: (() => void) | undefined;
		if (!call && parentSignal) {
			const abort = () => controller.abort();
			parentSignal.addEventListener("abort", abort, { once: true });
			removeParentAbort = () => parentSignal.removeEventListener("abort", abort);
		}

		const startedAt = call?.startedAt ?? this.now();
		const speculations = call?.speculations ?? [];
		for (const part of eligibleParts) {
			let result: Promise<BashExecResult>;
			try {
				result = Promise.resolve(launch(part, controller.signal));
			} catch (error) {
				result = Promise.reject(error);
			}
			speculations.push({ command: part, result });
		}
		if (!call) {
			call = { prefix: eligibleParts.join(" && "), speculations, suffix: null, startedAt, controller, removeParentAbort };
			this.calls.set(toolCallId, call);
		} else {
			call.prefix = speculations.map((item) => item.command).join(" && ");
		}
		for (const speculation of speculations.slice(-eligibleParts.length)) {
			speculation.result.then(() => { call!.endedAt = this.now(); }, () => { call!.endedAt = this.now(); });
		}
		this.stats.speculations += eligibleParts.length;
		this.emit(eligibleParts.length, speculativeMs);
	}

	async prepare(toolCallId: string, command: string): Promise<string | null> {
		const call = this.calls.get(toolCallId);
		if (!call) return null;

		const speculativeMs = this.account(call);
		if (speculativeMs) this.emit(0, speculativeMs);
		const matchesPrefix = commandUsesPrefix(command, call.prefix);
		call.suffix = matchesPrefix ? suffixAfterPrefix(command, call.prefix) : null;

		const prefixOutput: BashExecResult[] = [];
		for (const speculation of call.speculations) {
			try {
				prefixOutput.push(await speculation.result);
			} catch {
				prefixOutput.push({ output: "", exitCode: undefined, cancelled: true });
			}
		}
		this.cleanupParentAbort(call);

		const failed = prefixOutput.some(
			(output) => output.exitCode !== 0 || output.exitCode === undefined || output.cancelled,
		);
		if (matchesPrefix) call.prefixOutput = prefixOutput;

		if (!matchesPrefix) return null;
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

		const failed = call.prefixOutput.some(
			(output) => output.exitCode !== 0 || output.exitCode === undefined || output.cancelled,
		);
		const suffix = suffixContent
			.filter((b) => b.type === "text" && b.text)
			.map((b) => b.text as string)
			.join("");
		const prefix = call.prefixOutput.map((output) => output.output).filter(Boolean).join("\n");
		const fullText = failed ? prefix : [prefix, suffix].filter(Boolean).join("\n");
		const truncation = truncateTail(fullText, {
			maxLines: DEFAULT_MAX_LINES,
			maxBytes: DEFAULT_MAX_BYTES,
		});
		const text = truncation.truncated
			? `${truncation.content}\n\n[Speculative output truncated at ${formatSize(DEFAULT_MAX_BYTES)} or ${DEFAULT_MAX_LINES} lines]`
			: fullText;

		this.cleanupParentAbort(call);
		this.calls.delete(toolCallId);
		return {
			content: [{ type: "text", text }],
			isError: failed || Boolean(call.suffix && suffixIsError),
		};
	}

	clear(): void {
		let speculativeMs = 0;
		for (const call of this.calls.values()) {
			speculativeMs += this.account(call);
			this.disposeCall(call, true);
		}
		this.calls.clear();
		if (speculativeMs) this.emit(0, speculativeMs);
	}

	getStats(): SpeculationStats {
		return { ...this.stats };
	}

	clearStats(): void {
		// Statistics are independent from active execution. Clearing the display
		// must not cancel or discard work that is already in flight.
		this.stats = { speculations: 0, speculativeMs: 0 };
		this.emitClear();
	}

	private account(call: Call): number {
		if (call.accounted) return 0;
		call.accounted = true;
		const speculativeMs = Math.max(0, (call.endedAt ?? this.now()) - call.startedAt);
		this.stats.speculativeMs += speculativeMs;
		return speculativeMs;
	}

	private emit(speculations: number, speculativeMs: number): void {
		this.persist?.({ version: 1, kind: "update", speculations, speculativeMs });
	}

	private emitClear(): void {
		this.persist?.({ version: 1, kind: "clear", speculations: 0, speculativeMs: 0 });
	}

	private disposeCalls(abort: boolean): void {
		for (const call of this.calls.values()) this.disposeCall(call, abort);
		this.calls.clear();
	}

	private disposeCall(call: Call, abort: boolean): void {
		if (abort) call.controller.abort();
		this.cleanupParentAbort(call);
	}

	private cleanupParentAbort(call: Call): void {
		call.removeParentAbort?.();
		call.removeParentAbort = undefined;
	}
}

function isStats(value: unknown): value is SpeculationStats {
	if (!value || typeof value !== "object") return false;
	const stats = value as Partial<SpeculationStats>;
	return (
		numberIsFiniteNonNegative(stats.speculations) &&
		Number.isInteger(stats.speculations) &&
		numberIsFiniteNonNegative(stats.speculativeMs)
	);
}

function numberIsFiniteNonNegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function commandUsesPrefix(command: string, prefix: string): boolean {
	const commandTrimmed = command.trim();
	const prefixTrimmed = prefix.trim();
	if (!commandTrimmed.startsWith(prefixTrimmed)) return false;
	const rest = commandTrimmed.slice(prefixTrimmed.length).trimStart();
	return rest.length === 0 || rest.startsWith("&&");
}

export function suffixAfterPrefix(command: string, prefix: string): string | null {
	if (!commandUsesPrefix(command, prefix)) return null;
	let rest = command.trim().slice(prefix.trim().length).trimStart();
	if (rest.startsWith("&&")) rest = rest.slice(2).trimStart();
	return rest || null;
}

export function formatStats(stats: SpeculationStats): string {
	return `${stats.speculations} speculations, ${(stats.speculativeMs / 1000).toFixed(2)}s speculative execution.`;
}
