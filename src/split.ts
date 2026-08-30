/** Split a command at top-level `&&` operators, preserving quoted operators. */
export function splitTopLevelAndChain(command: string): string[] | null {
	if (!isSafelyParseable(command)) return null;

	const parts: string[] = [];
	let start = 0;
	let inSingle = false;
	let inDouble = false;
	let inBacktick = false;

	for (let i = 0; i < command.length; i++) {
		const ch = command[i];
		if (inSingle) {
			if (ch === "'") inSingle = false;
			continue;
		}
		if (inDouble) {
			if (ch === "\\") i++;
			else if (ch === '"') inDouble = false;
			continue;
		}
		if (inBacktick) {
			if (ch === "`") inBacktick = false;
			continue;
		}
		if (ch === "'") inSingle = true;
		else if (ch === '"') inDouble = true;
		else if (ch === "`") inBacktick = true;
		else if (ch === "&" && command[i + 1] === "&") {
			const part = command.slice(start, i).trim();
			if (!part) return null;
			parts.push(part);
			start = i + 2;
			i++;
		}
	}

	const last = command.slice(start).trim();
	if (!last) return null;
	parts.push(last);
	return parts;
}

/**
 * If `command` ends with a top-level `&&`, return the left-hand side.
 * Returns null when there is no complete prefix, or when parsing is unsafe.
 */
export function prefixBeforeTrailingAnd(command: string): string | null {
	if (!isSafelyParseable(command)) {
		return null;
	}

	const trimmed = command.trimEnd();
	if (!trimmed.endsWith("&&")) {
		return null;
	}

	const andIndex = findLastTopLevelAnd(trimmed);
	if (andIndex === -1) {
		return null;
	}

	const afterAnd = trimmed.slice(andIndex + 2).trim();
	if (afterAnd.length > 0) {
		return null;
	}

	const prefix = trimmed.slice(0, andIndex).trimEnd();
	return prefix.length > 0 ? prefix : null;
}

function isSafelyParseable(command: string): boolean {
	let inSingle = false;
	let inDouble = false;
	let inBacktick = false;

	for (let i = 0; i < command.length; i++) {
		const ch = command[i];

		if (inSingle) {
			if (ch === "'") {
				inSingle = false;
			}
			continue;
		}

		if (inDouble) {
			if (ch === "\\") {
				i++;
				continue;
			}
			if (ch === '"') {
				inDouble = false;
			}
			continue;
		}

		if (inBacktick) {
			if (ch === "`") {
				inBacktick = false;
			}
			continue;
		}

		if (ch === "'") {
			inSingle = true;
		} else if (ch === '"') {
			inDouble = true;
		} else if (ch === "`") {
			inBacktick = true;
		}
	}

	return !inSingle && !inDouble && !inBacktick;
}

function findLastTopLevelAnd(command: string): number {
	let inSingle = false;
	let inDouble = false;
	let inBacktick = false;
	let lastAnd = -1;

	for (let i = 0; i < command.length; i++) {
		const ch = command[i];

		if (inSingle) {
			if (ch === "'") {
				inSingle = false;
			}
			continue;
		}

		if (inDouble) {
			if (ch === "\\") {
				i++;
				continue;
			}
			if (ch === '"') {
				inDouble = false;
			}
			continue;
		}

		if (inBacktick) {
			if (ch === "`") {
				inBacktick = false;
			}
			continue;
		}

		if (ch === "'") {
			inSingle = true;
			continue;
		}
		if (ch === '"') {
			inDouble = true;
			continue;
		}
		if (ch === "`") {
			inBacktick = true;
			continue;
		}

		if (ch === "&" && command[i + 1] === "&") {
			lastAnd = i;
			i++;
		}
	}

	return lastAnd;
}
