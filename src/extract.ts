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
			result += decodeJsonEscape(partialJson[i]);
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
		case "u":
			return "\\u";
		default:
			return ch;
	}
}
