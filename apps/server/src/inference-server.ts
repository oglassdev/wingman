import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";

import type { AgentEvent } from "@mariozechner/pi-agent-core";

import type {
	WingmanContext,
	WritebackPayload,
} from "../../../packages/shared/src/types";
import { WINGMAN_PORT_FILE } from "../../../packages/shared/src/port";
import { getAgent, getAgentModelId, isAgentConfigured, reconfigureAgent } from "./agent";
import { buildFimPrompt, buildSystemPrompt, getContext, setContext } from "./context";
import { loadSettings } from "./settings";

const DEFAULT_PORT = 7891;
const ABORT_TIMEOUT_MS = 2_000;

type JsonOk = { ok: true };

const writebackStore = new Map<string, WritebackPayload>();
let currentServerPort: number | null = null;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function sse(data: string): string {
	return `${data
		.split("\n")
		.map((line) => `data: ${line}`)
		.join("\n")}\n\n`;
}

function withCorsHeaders(headers: Headers): Headers {
	headers.set("cache-control", "no-cache");
	headers.set("connection", "keep-alive");
	headers.set("content-type", "text/event-stream");
	return headers;
}

async function waitForAbortOrTimeout(): Promise<boolean> {
	const agent = getAgent();
	if (!agent.state.isStreaming) {
		return true;
	}

	agent.abort();

	const timeout = new Promise<false>((resolve) => {
		setTimeout(() => resolve(false), ABORT_TIMEOUT_MS);
	});

	const idle = agent.waitForIdle().then(() => true);
	return Promise.race([idle, timeout]);
}

function requireConfiguredAgent(): Response | null {
	if (isAgentConfigured()) {
		return null;
	}

	return json(
		{ error: "Wingman not configured. Open the settings panel." },
		503,
	);
}

function parseContextBody(body: unknown): Partial<WingmanContext> {
	if (!body || typeof body !== "object") {
		return {};
	}

	const record = body as Record<string, unknown>;

	return {
		file: typeof record.file === "string" ? record.file : null,
		line:
			typeof record.line === "number" && Number.isFinite(record.line)
				? record.line
				: null,
		selection: typeof record.selection === "string" ? record.selection : null,
		surroundingCode:
			typeof record.surroundingCode === "string" ? record.surroundingCode : null,
	};
}

function parseWritebackBody(body: unknown): WritebackPayload {
	if (!body || typeof body !== "object") {
		return { file: null, line: null, code: null };
	}

	const record = body as Record<string, unknown>;
	return {
		file: typeof record.file === "string" ? record.file : null,
		line:
			typeof record.line === "number" && Number.isFinite(record.line)
				? record.line
				: null,
		code: typeof record.code === "string" ? record.code : null,
	};
}

async function prepareStreamingRun(): Promise<Response | null> {
	const canProceed = await waitForAbortOrTimeout();
	if (canProceed) {
		return null;
	}

	return json({ error: "Another request is still shutting down." }, 409);
}

function streamAgentPrompt(request: Request, prompt: string): Response {
	const guardResponse = requireConfiguredAgent();
	if (guardResponse) {
		return guardResponse;
	}

	const agent = getAgent();
	let unsubscribe: (() => void) | undefined;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			const close = () => {
				if (closed) return;
				closed = true;
				try {
					controller.close();
				} catch {
					// Ignore double-close races during aborts.
				}
			};

			const enqueue = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					close();
				}
			};

			const onAbort = () => {
				agent.abort();
				close();
			};
			request.signal.addEventListener("abort", onAbort, { once: true });

			try {
				unsubscribe = agent.subscribe((event: AgentEvent) => {
					if (event.type !== "message_update") return;
					const update = event.assistantMessageEvent;
					if (update.type !== "text_delta") return;
					enqueue(sse(update.delta));
				});

				await agent.prompt(prompt);
				enqueue(sse("[DONE]"));
				close();
			} catch (error) {
				if (!request.signal.aborted) {
					const message =
						error instanceof Error ? error.message : "Inference request failed";
					enqueue(sse(JSON.stringify({ error: message })));
				}
				close();
			} finally {
				unsubscribe?.();
				request.signal.removeEventListener("abort", onAbort);
			}
		},
		cancel() {
			getAgent().abort();
			unsubscribe?.();
		},
	});

	const headers = withCorsHeaders(new Headers());
	return new Response(stream, { status: 200, headers });
}

async function handleRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const pathname = url.pathname;

	if (request.method === "GET" && pathname === "/health") {
		return json({
			ok: true,
			port: currentServerPort ?? DEFAULT_PORT,
			model: getAgentModelId(),
		});
	}

	if (request.method === "POST" && pathname === "/context") {
		const body = await request.json().catch(() => null);
		const nextContext = setContext(parseContextBody(body));
		const agent = getAgent();
		agent.setSystemPrompt(buildSystemPrompt(nextContext));
		agent.clearMessages();
		return json({ ok: true });
	}

	if (request.method === "GET" && pathname === "/context") {
		return json(getContext());
	}

	if (request.method === "GET" && pathname === "/inline") {
		const context = getContext();
		if (!context.file || !context.surroundingCode) {
			return json({ error: "No context. Call POST /context first." }, 400);
		}

		const busyResponse = await prepareStreamingRun();
		if (busyResponse) {
			return busyResponse;
		}

		return streamAgentPrompt(request, buildFimPrompt(context));
	}

	if (request.method === "POST" && pathname === "/generate") {
		const body = await request.json().catch(() => null);
		const prompt =
			body && typeof body === "object" && typeof (body as { prompt?: unknown }).prompt === "string"
				? (body as { prompt: string }).prompt
				: "";

		if (!prompt.trim()) {
			return json({ error: "Prompt is required." }, 400);
		}

		const busyResponse = await prepareStreamingRun();
		if (busyResponse) {
			return busyResponse;
		}

		return streamAgentPrompt(request, prompt);
	}

	if (request.method === "POST" && pathname === "/abort") {
		getAgent().abort();
		return json({ ok: true });
	}

	if (request.method === "POST" && pathname === "/writeback") {
		const body = await request.json().catch(() => null);
		const payload = parseWritebackBody(body);
		if (!payload.file) {
			return json({ error: "file is required" }, 400);
		}

		writebackStore.set(payload.file, payload);
		return json({ ok: true });
	}

	if (request.method === "GET" && pathname === "/writeback") {
		const file = url.searchParams.get("file");
		if (!file) {
			return json({ error: "file query param is required" }, 400);
		}

		const payload = writebackStore.get(file);
		if (!payload) {
			return json({ file: null, line: null, code: null });
		}

		writebackStore.delete(file);
		return json(payload);
	}

	if (request.method === "POST" && pathname === "/reload-config") {
		const settings = await loadSettings();
		reconfigureAgent(settings);
		return json({ ok: true });
	}

	return json({ error: "Not found" }, 404);
}

async function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close(() => resolve(true));
		});
		server.listen(port, "127.0.0.1");
	});
}

async function choosePort(preferredPort: number): Promise<number> {
	if (await isPortAvailable(preferredPort)) {
		return preferredPort;
	}

	const temp = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch() {
			return new Response("ok");
		},
	});
	const port = temp.port ?? DEFAULT_PORT;
	temp.stop(true);
	return port;
}

export interface InferenceServerHandle {
	port: number;
	url: string;
	stop: () => void;
}

export async function startInferenceServer(): Promise<InferenceServerHandle> {
	if (currentServerPort !== null) {
		return {
			port: currentServerPort,
			url: `http://127.0.0.1:${currentServerPort}`,
			stop: () => {},
		};
	}

	const settings = await loadSettings();
	reconfigureAgent(settings);

	const port = await choosePort(DEFAULT_PORT);
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port,
		fetch: handleRequest,
	});

	const resolvedPort = server.port ?? port;
	currentServerPort = resolvedPort;
	await writeFile(WINGMAN_PORT_FILE, String(resolvedPort), "utf8");

	return {
		port: resolvedPort,
		url: `http://127.0.0.1:${resolvedPort}`,
		stop: () => {
			server.stop(true);
			currentServerPort = null;
		},
	};
}
