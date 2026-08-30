import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

export interface BashExecResult {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
}

export async function runShellCommand(
	command: string,
	cwd: string,
	signal?: AbortSignal,
): Promise<BashExecResult> {
	const operations = createLocalBashOperations();
	const chunks: string[] = [];
	const decoder = new TextDecoder();

	const result = await operations.exec(command, cwd, {
		onData: (data) => {
			chunks.push(decoder.decode(data));
		},
		signal,
	});

	return {
		output: chunks.join(""),
		exitCode: signal?.aborted ? undefined : (result.exitCode ?? undefined),
		cancelled: signal?.aborted ?? false,
	};
}
