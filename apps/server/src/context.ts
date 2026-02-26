import type { WingmanContext } from "../../../packages/shared/src/types";

const emptyContext: WingmanContext = {
	file: null,
	line: null,
	selection: null,
	surroundingCode: null,
};

let currentContext: WingmanContext = { ...emptyContext };

export function setContext(next: Partial<WingmanContext>): WingmanContext {
	currentContext = {
		file: next.file ?? null,
		line: next.line ?? null,
		selection: next.selection ?? null,
		surroundingCode: next.surroundingCode ?? null,
	};
	return currentContext;
}

export function getContext(): WingmanContext {
	return { ...currentContext };
}

export function buildSystemPrompt(context: WingmanContext): string {
	const parts = [
		"You are Wingman, a concise coding assistant focused on safe, minimal edits.",
		"Prefer direct code answers and preserve the user's existing style.",
	];

	if (context.file || context.line || context.selection || context.surroundingCode) {
		parts.push("Current editor context:");
		parts.push(`- File: ${context.file ?? "(none)"}`);
		parts.push(`- Line: ${context.line ?? "(none)"}`);
		parts.push(
			`- Selection: ${context.selection ? JSON.stringify(context.selection) : "(none)"}`,
		);
		parts.push(
			[
				"Surrounding code:",
				"```",
				context.surroundingCode ?? "(none)",
				"```",
			].join("\n"),
		);
	} else {
		parts.push("No editor context is currently available.");
	}

	return parts.join("\n\n");
}

export function buildFimPrompt(context: WingmanContext): string {
	return [
		"Complete the code at the cursor position.",
		"Return only the completion text with no markdown fences or explanations.",
		context.selection
			? `Selected text near cursor:\n${context.selection}`
			: "No text is selected.",
		"Surrounding code:",
		context.surroundingCode ?? "",
	].join("\n\n");
}
