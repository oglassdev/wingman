import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";

import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { Elysia, sse, status, t, type Static } from "elysia";

import type {
	InferenceServerStatus,
	WingmanContext,
	WritebackPayload,
} from "../../../packages/shared/src/types";
import { WINGMAN_PORT_FILE } from "../../../packages/shared/src/port";
import { getAgent, getAgentModelId, isAgentConfigured, reconfigureAgent } from "./agent";
import { buildFimPrompt, buildSystemPrompt, getContext, setContext } from "./context";
import { loadSettings } from "./settings";

const DEFAULT_PORT = 7891;
const ABORT_TIMEOUT_MS = 2_000;

const nullableStringSchema = t.Nullable(t.String());
const nullableLineSchema = t.Nullable(t.Integer({ minimum: 0 }));

const okResponseSchema = t.Object({ ok: t.Literal(true) });
const errorResponseSchema = t.Object({ error: t.String() });
const contextSchema = t.Object({
	file: nullableStringSchema,
	line: nullableLineSchema,
	selection: nullableStringSchema,
	surroundingCode: nullableStringSchema,
});
const contextUpdateSchema = t.Object({
	file: t.Optional(nullableStringSchema),
	line: t.Optional(nullableLineSchema),
	selection: t.Optional(nullableStringSchema),
	surroundingCode: t.Optional(nullableStringSchema),
});
const generateBodySchema = t.Object({
	prompt: t.String(),
});
const writebackPayloadSchema = t.Object({
	file: nullableStringSchema,
	line: nullableLineSchema,
	code: nullableStringSchema,
});
const writebackPostSchema = t.Object({
	file: nullableStringSchema,
	line: nullableLineSchema,
	code: nullableStringSchema,
});
const writebackQuerySchema = t.Object({
	file: t.String({ minLength: 1 }),
});
const healthSchema = t.Object({
	ok: t.Literal(true),
	port: t.Integer({ minimum: 0 }),
	model: nullableStringSchema,
});

type ContextUpdateBody = Static<typeof contextUpdateSchema>;
type GenerateBody = Static<typeof generateBodySchema>;
type WritebackPostBody = Static<typeof writebackPostSchema>;
type WritebackQuery = Static<typeof writebackQuerySchema>;

const writebackStore = new Map<string, WritebackPayload>();
let currentServerPort: number | null = null;

class HttpApiError extends Error {
	constructor(
		public readonly statusCode: number,
		message: string,
	) {
		super(message);
		this.name = "HttpApiError";
	}
}

class BusyRequestError extends HttpApiError {
	constructor() {
		super(409, "Another request is still shutting down.");
		this.name = "BusyRequestError";
	}
}

class MissingContextError extends HttpApiError {
	constructor() {
		super(400, "No context. Call POST /context first.");
		this.name = "MissingContextError";
	}
}

class NotConfiguredError extends HttpApiError {
	constructor() {
		super(503, "Wingman not configured. Open the settings panel.");
		this.name = "NotConfiguredError";
	}
}

function normalizeContextUpdate(body: ContextUpdateBody): Partial<WingmanContext> {
	return {
		file: body.file ?? null,
		line: body.line ?? null,
		selection: body.selection ?? null,
		surroundingCode: body.surroundingCode ?? null,
	};
}

function normalizeWritebackPayload(body: WritebackPostBody): WritebackPayload {
	return {
		file: body.file ?? null,
		line: body.line ?? null,
		code: body.code ?? null,
	};
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

function streamAgentPrompt(request: Request, prompt: string) {
	if (!isAgentConfigured()) {
		throw new NotConfiguredError();
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
				void agent
					.prompt(prompt)
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
					if (chunk !== undefined) {
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
	return new Elysia({
		name: "wingman-inference-server",
	})
		.state({
			writebackStore,
		})
		.decorate({
			getPort(): number {
				return currentServerPort ?? DEFAULT_PORT;
			},
			applyContextUpdate(body: ContextUpdateBody): WingmanContext {
				const nextContext = setContext(normalizeContextUpdate(body));
				const agent = getAgent();
				agent.setSystemPrompt(buildSystemPrompt(nextContext));
				agent.clearMessages();
				return nextContext;
			},
			async ensureStreamingSlot() {
				const ok = await waitForAbortOrTimeout();
				if (!ok) {
					throw new BusyRequestError();
				}
			},
			streamPrompt(request: Request, prompt: string) {
				return streamAgentPrompt(request, prompt);
			},
			async reloadAgentConfig() {
				const settings = await loadSettings();
				reconfigureAgent(settings);
			},
		})
		.onError(({ code, error }) => {
			if (error instanceof HttpApiError) {
				return status(error.statusCode as 400 | 409 | 503, {
					error: error.message,
				});
			}

			if (code === "VALIDATION") {
				return status(400, { error: error.message });
			}

			if (code === "NOT_FOUND") {
				return status(404, { error: "Not found" });
			}

			console.error("Inference server error", error);
			return status(500, { error: "Internal server error" });
		})
		.group("", (app) =>
			app
				.get(
					"/health",
					({ getPort }) =>
						({
							ok: true,
							port: getPort(),
							model: getAgentModelId(),
						}) satisfies InferenceServerStatus,
					{
						response: {
							200: healthSchema,
						},
					},
				)
				.get("/context", () => getContext(), {
					response: {
						200: contextSchema,
					},
				})
				.post(
					"/context",
					({ body, applyContextUpdate }) => {
						applyContextUpdate(body);
						return { ok: true } as const;
					},
					{
						body: contextUpdateSchema,
						response: {
							200: okResponseSchema,
							400: errorResponseSchema,
						},
					},
				)
				.get("/inline", async ({ request, ensureStreamingSlot, streamPrompt }) => {
					const context = getContext();
					if (!context.file || !context.surroundingCode) {
						throw new MissingContextError();
					}

					await ensureStreamingSlot();
					return streamPrompt(request, buildFimPrompt(context));
				})
				.post(
					"/generate",
					async ({ body, request, ensureStreamingSlot, streamPrompt }) => {
						const { prompt } = body as GenerateBody;
						if (!prompt.trim()) {
							throw new HttpApiError(400, "Prompt is required.");
						}

						await ensureStreamingSlot();
						return streamPrompt(request, prompt);
					},
					{
						body: generateBodySchema,
						response: {
							400: errorResponseSchema,
							409: errorResponseSchema,
							503: errorResponseSchema,
						},
					},
				)
				.post("/abort", () => {
					getAgent().abort();
					return { ok: true } as const;
				}, {
					response: {
						200: okResponseSchema,
					},
				})
				.post("/reload-config", async ({ reloadAgentConfig }) => {
					await reloadAgentConfig();
					return { ok: true } as const;
				}, {
					response: {
						200: okResponseSchema,
					},
				}),
		)
		.group("/writeback", (app) =>
			app
				.post(
					"",
					({ body, store }) => {
						const payload = normalizeWritebackPayload(body as WritebackPostBody);
						if (!payload.file) {
							throw new HttpApiError(400, "file is required");
						}

						store.writebackStore.set(payload.file, payload);
						return { ok: true } as const;
					},
					{
						body: writebackPostSchema,
						response: {
							200: okResponseSchema,
							400: errorResponseSchema,
						},
					},
				)
				.get(
					"",
					({ query, store }) => {
						const { file } = query as WritebackQuery;
						const payload = store.writebackStore.get(file);
						if (!payload) {
							return { file: null, line: null, code: null } as const;
						}

						store.writebackStore.delete(file);
						return payload;
					},
					{
						query: writebackQuerySchema,
						response: {
							200: writebackPayloadSchema,
							400: errorResponseSchema,
						},
					},
				),
		);
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
	app.listen({
		hostname: "127.0.0.1",
		port,
	});

	const resolvedPort =
		typeof app.server?.port === "number" ? app.server.port : port;
	currentServerPort = resolvedPort;
	await writeFile(WINGMAN_PORT_FILE, String(resolvedPort), "utf8");

	return {
		port: resolvedPort,
		url: `http://127.0.0.1:${resolvedPort}`,
		stop: () => {
			void app.stop(true);
			currentServerPort = null;
		},
	};
}
