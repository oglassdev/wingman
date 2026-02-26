import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import * as vscode from "vscode";

type WingmanContextPayload = {
	file: string | null;
	line: number | null;
	selection: string | null;
	surroundingCode: string | null;
};

type WritebackPayload = {
	file: string | null;
	line: number | null;
	code: string | null;
};

const DEFAULT_PORT = 7891;
const DEBOUNCE_MS = 300;
const WINGMAN_PORT_FILE = path.join(os.tmpdir(), "wingman.port");

let inlineAbortController: AbortController | null = null;
let inlineDebounceTimer: NodeJS.Timeout | undefined;
let writebackPollTimer: NodeJS.Timeout | undefined;

function getConfig() {
	return vscode.workspace.getConfiguration("wingman");
}

async function readPortFromTmpFile(): Promise<number | null> {
	try {
		const raw = (await fs.readFile(WINGMAN_PORT_FILE, "utf8")).trim();
		const port = Number.parseInt(raw, 10);
		return Number.isFinite(port) ? port : null;
	} catch {
		return null;
	}
}

async function resolveBaseUrl(): Promise<string> {
	const configuredPort = getConfig().get<number>("inferencePort", DEFAULT_PORT);
	const candidates = [configuredPort, await readPortFromTmpFile()].filter(
		(port): port is number => typeof port === "number",
	);

	for (const port of candidates) {
		const url = `http://127.0.0.1:${port}`;
		try {
			const response = await fetch(`${url}/health`);
			if (response.ok) {
				return url;
			}
		} catch {
			// Try the next candidate.
		}
	}

	return `http://127.0.0.1:${configuredPort}`;
}

async function postContext(baseUrl: string, payload: WingmanContextPayload) {
	const response = await fetch(`${baseUrl}/context`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!response.ok) {
		throw new Error(`POST /context failed (${response.status})`);
	}
}

function getEditorContext(
	editor: vscode.TextEditor,
	position: vscode.Position,
): WingmanContextPayload {
	const document = editor.document;
	const startLine = Math.max(0, position.line - 20);
	const endLine = Math.min(document.lineCount - 1, position.line + 10);
	const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
	const surroundingCode = document.getText(range);
	const selection = editor.selection.isEmpty
		? null
		: document.getText(editor.selection);

	return {
		file: document.uri.fsPath,
		line: position.line + 1,
		selection,
		surroundingCode,
	};
}

async function readSseText(response: Response, token: vscode.CancellationToken): Promise<string> {
	if (!response.body) {
		return "";
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let output = "";

	while (!token.isCancellationRequested) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		while (true) {
			const boundary = buffer.indexOf("\n\n");
			if (boundary === -1) break;
			const rawEvent = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			const data = rawEvent
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");

			if (!data || data === "[DONE]") {
				continue;
			}

			// Server may emit JSON error objects over SSE.
			let parsed: { error?: string } | null = null;
			try {
				parsed = JSON.parse(data) as { error?: string };
			} catch {
				parsed = null;
			}

			if (parsed?.error) {
				throw new Error(parsed.error);
			}

			if (!parsed) {
				output += data;
			}
		}
	}

	return output;
}

function createInlineCompletionProvider(): vscode.InlineCompletionItemProvider {
	return {
		provideInlineCompletionItems: async (document, position, _context, token) => {
			if (!getConfig().get<boolean>("enabled", true)) {
				return [];
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
				return [];
			}

			if (inlineDebounceTimer) {
				clearTimeout(inlineDebounceTimer);
				inlineDebounceTimer = undefined;
			}
			inlineAbortController?.abort();
			inlineAbortController = null;

			const completion = await new Promise<string>((resolve) => {
				inlineDebounceTimer = setTimeout(async () => {
					if (token.isCancellationRequested) {
						resolve("");
						return;
					}

					const controller = new AbortController();
					inlineAbortController = controller;
					token.onCancellationRequested(() => controller.abort());

					try {
						const baseUrl = await resolveBaseUrl();
						await postContext(baseUrl, getEditorContext(editor, position));
						const response = await fetch(`${baseUrl}/inline`, {
							method: "GET",
							headers: { accept: "text/event-stream" },
							signal: controller.signal,
						});
						if (!response.ok) {
							resolve("");
							return;
						}

						const text = await readSseText(response, token);
						resolve(text);
					} catch {
						resolve("");
					} finally {
						if (inlineAbortController === controller) {
							inlineAbortController = null;
						}
					}
				}, DEBOUNCE_MS);
			});

			if (!completion || token.isCancellationRequested) {
				return [];
			}

			const item = new vscode.InlineCompletionItem(
				completion,
				new vscode.Range(position, position),
			);
			return [item];
		},
	};
}

async function launchWingmanApp(args: string[]) {
	// macOS-first MVP: use the app bundle name if installed/running.
	spawn("open", ["-a", "Wingman", "--args", ...args], {
		detached: true,
		stdio: "ignore",
	}).unref();
}

async function openWingmanForActiveEditor() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		void vscode.window.showInformationMessage("Open a file first.");
		return;
	}

	const payload = getEditorContext(editor, editor.selection.active);
	const baseUrl = await resolveBaseUrl();

	try {
		const health = await fetch(`${baseUrl}/health`);
		if (health.ok) {
			await postContext(baseUrl, payload);
			await launchWingmanApp([]);
			return;
		}
	} catch {
		// Server not running; fall through to app launch.
	}

	const args = ["--file", payload.file ?? "", "--line", String(payload.line ?? 1)];
	if (payload.selection) {
		args.push("--selection", payload.selection);
	}
	await launchWingmanApp(args);
}

async function applyWritebackToEditor(payload: WritebackPayload) {
	if (!payload.file || payload.line === null || !payload.code) {
		return;
	}

	const targetUri = vscode.Uri.file(payload.file);
	const document = await vscode.workspace.openTextDocument(targetUri);
	const editor =
		vscode.window.visibleTextEditors.find(
			(candidate) => candidate.document.uri.fsPath === payload.file,
		) ?? (await vscode.window.showTextDocument(document, { preview: false }));

	const insertLine = Math.max(0, Math.min(document.lineCount, payload.line - 1));
	const insertPosition =
		insertLine < document.lineCount
			? new vscode.Position(insertLine, 0)
			: new vscode.Position(document.lineCount, 0);

	const edit = new vscode.WorkspaceEdit();
	edit.insert(targetUri, insertPosition, payload.code);
	await vscode.workspace.applyEdit(edit);
	await document.save().catch(() => {});
	await editor.revealRange(new vscode.Range(insertPosition, insertPosition));
}

function startWritebackPolling(context: vscode.ExtensionContext) {
	const poll = async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const file = editor.document.uri.fsPath;
		const baseUrl = await resolveBaseUrl();
		try {
			const response = await fetch(
				`${baseUrl}/writeback?file=${encodeURIComponent(file)}`,
			);
			if (!response.ok) return;
			const payload = (await response.json()) as WritebackPayload;
			if (!payload.code || !payload.file) return;
			await applyWritebackToEditor(payload);
		} catch {
			// Polling is best-effort and should stay silent.
		}
	};

	writebackPollTimer = setInterval(() => {
		void poll();
	}, 2000);

	context.subscriptions.push({
		dispose() {
			if (writebackPollTimer) {
				clearInterval(writebackPollTimer);
				writebackPollTimer = undefined;
			}
		},
	});
}

export function activate(context: vscode.ExtensionContext) {
	const selector: vscode.DocumentSelector = [{ scheme: "file" }];

	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider(
			selector,
			createInlineCompletionProvider(),
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("wingman.open", async () => {
			await openWingmanForActiveEditor();
		}),
	);

	startWritebackPolling(context);
}

export function deactivate() {
	if (inlineDebounceTimer) {
		clearTimeout(inlineDebounceTimer);
		inlineDebounceTimer = undefined;
	}
	inlineAbortController?.abort();
	inlineAbortController = null;

	if (writebackPollTimer) {
		clearInterval(writebackPollTimer);
		writebackPollTimer = undefined;
	}
}
