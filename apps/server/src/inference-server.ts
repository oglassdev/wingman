import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";

import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { Elysia, sse, status } from "elysia";

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

const writebackStore = new Map<string, WritebackPayload>();
let currentServerPort: number | null = null;

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

async function prepareStreamingRun(): Promise<
	| { ok: true }
	| ReturnType<typeof status<409, { error: string }>>
> {
	const canProceed = await waitForAbortOrTimeout();
	if (canProceed) {
		return { ok: true };
	}

	return status(409, { error: "Another request is still shutting down." });
}

function streamAgentPrompt(request: Request, prompt: string) {
	if (!isAgentConfigured()) {
		return status(503, {
			error: "Wingman not configured. Open the settings panel.",
		});
	}

	const agent = getAgent();
	const queue: string[] = [];
	let resolveNext: (() => void) | null = null;
	let done = false;

	const notify = () => {
		resolveNext?.();
		resolveNext = null;
	};

	const push = (chunk: string) => {
		queue.push(chunk);
		notify();
	};

	const finish = () => {
		done = true;
		notify();
	};

	const waitForNext = () =>
		new Promise<void>((resolve) => {
			resolveNext = resolve;
		});

	return sse(
		(async function* () {
			const onAbort = () => {
				agent.abort();
				finish();
			};

			request.signal.addEventListener("abort", onAbort, { once: true });

			const unsubscribe = agent.subscribe((event: AgentEvent) => {
				if (event.type !== "message_update") return;
				const update = event.assistantMessageEvent;
				if (update.type !== "text_delta") return;
				push(update.delta);
			});

			try {
				void agent.prompt(prompt)
					.then(() => {
						push("[DONE]");
						finish();
					})
					.catch((error) => {
						if (!request.signal.aborted) {
							const message =
								error instanceof Error
									? error.message
									: "Inference request failed";
							push(JSON.stringify({ error: message }));
						}
						finish();
					});

				while (!done || queue.length > 0) {
					if (queue.length === 0) {
						await waitForNext();
						continue;
					}

					const chunk = queue.shift();
					if (chunk) {
						yield sse(chunk);
					}
				}
			} finally {
				unsubscribe();
				request.signal.removeEventListener("abort", onAbort);
			}
		})(),
	);
}

function createInferenceApp() {
	return new Elysia()
		.get("/health", () =>
			({
				ok: true,
				port: currentServerPort ?? DEFAULT_PORT,
				model: getAgentModelId(),
			}),
		)
		.post("/context", async ({ body }) => {
			const nextContext = setContext(parseContextBody(body));
			const agent = getAgent();
			agent.setSystemPrompt(buildSystemPrompt(nextContext));
			agent.clearMessages();
			return { ok: true };
		})
		.get("/context", () => getContext())
		.get("/inline", async ({ request }) => {
			const context = getContext();
			if (!context.file || !context.surroundingCode) {
				return status(400, { error: "No context. Call POST /context first." });
			}

			const prep = await prepareStreamingRun();
			if ("ok" in prep === false) {
				return prep;
			}

			return streamAgentPrompt(request, buildFimPrompt(context));
		})
		.post("/generate", async ({ body, request }) => {
			const prompt =
				body &&
				typeof body === "object" &&
				typeof (body as { prompt?: unknown }).prompt === "string"
					? (body as { prompt: string }).prompt
					: "";

			if (!prompt.trim()) {
				return status(400, { error: "Prompt is required." });
			}

			const prep = await prepareStreamingRun();
			if ("ok" in prep === false) {
				return prep;
			}

			return streamAgentPrompt(request, prompt);
		})
		.post("/abort", () => {
			getAgent().abort();
			return { ok: true };
		})
		.post("/writeback", async ({ body }) => {
			const payload = parseWritebackBody(body);
			if (!payload.file) {
				return status(400, { error: "file is required" });
			}

			writebackStore.set(payload.file, payload);
			return { ok: true };
		})
		.get("/writeback", ({ query }) => {
			const file = typeof query.file === "string" ? query.file : null;
			if (!file) {
				return status(400, { error: "file query param is required" });
			}

			const payload = writebackStore.get(file);
			if (!payload) {
				return { file: null, line: null, code: null };
			}

			writebackStore.delete(file);
			return payload;
		})
		.post("/reload-config", async () => {
			const settings = await loadSettings();
			reconfigureAgent(settings);
			return { ok: true };
		});
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
	const app = createInferenceApp();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port,
		fetch(request) {
			return app.handle(request);
		},
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
