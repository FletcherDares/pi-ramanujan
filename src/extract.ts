/**
 * Pull the bash `command` string out of a partial tool-call JSON blob.
 * Works before the JSON is complete (no closing quote yet).
 */
export function extractPartialCommand(partialJson: string): string | null {
	const key = '"command"';
	const keyIndex = partialJson.indexOf(key);
	if (keyIndex === -1) {
		return null;
	}

	let i = keyIndex + key.length;
	while (i < partialJson.length && (partialJson[i] === " " || partialJson[i] === "\t")) {
		i++;
	}
	if (partialJson[i] !== ":") {
		return null;
	}
	i++;
	while (i < partialJson.length && (partialJson[i] === " " || partialJson[i] === "\t")) {
		i++;
	}
	if (partialJson[i] !== '"') {
		return null;
	}
	i++;

	let result = "";
	while (i < partialJson.length) {
		const ch = partialJson[i];
		if (ch === '"') {
			break;
		}
		if (ch === "\\") {
			i++;
			if (i >= partialJson.length) {
				break;
			}
			if (partialJson[i] === "u") {
				const code = partialJson.slice(i + 1, i + 5);
				if (!/^[0-9a-fA-F]{4}$/.test(code)) break;
				result += String.fromCharCode(Number.parseInt(code, 16));
				i += 4;
			} else {
				result += decodeJsonEscape(partialJson[i]);
			}
		} else {
			result += ch;
		}
		i++;
	}

	return result;
}

function decodeJsonEscape(ch: string): string {
	switch (ch) {
		case "n":
			return "\n";
		case "t":
			return "\t";
		case "r":
			return "\r";
		case '"':
			return '"';
		case "\\":
			return "\\";
		case "/":
			return "/";
		case "b":
			return "\b";
		case "f":
			return "\f";
		default:
			return ch;
	}
}
