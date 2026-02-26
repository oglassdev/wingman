import { useEffect, useRef, useState } from "react";

import type { WingmanContext } from "../../../../packages/shared/src/types";
import { useServerPort } from "../context/ServerPortContext";

type Props = {
	context: WingmanContext | null;
};

function parseSseChunk(buffer: string, onData: (data: string) => void): string {
	let rest = buffer;

	while (true) {
		const boundaryIndex = rest.indexOf("\n\n");
		if (boundaryIndex === -1) {
			return rest;
		}

		const rawEvent = rest.slice(0, boundaryIndex);
		rest = rest.slice(boundaryIndex + 2);
		const data = rawEvent
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trimStart())
			.join("\n");

		if (data) {
			onData(data);
		}
	}
}

export function GeneratePanel({ context }: Props) {
	const { baseUrl } = useServerPort();
	const [prompt, setPrompt] = useState("");
	const [output, setOutput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [sentNotice, setSentNotice] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!sentNotice) return;
		const timeout = window.setTimeout(() => setSentNotice(null), 1500);
		return () => window.clearTimeout(timeout);
	}, [sentNotice]);

	const stopStreaming = async () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setIsStreaming(false);
		try {
			await fetch(`${baseUrl}/abort`, { method: "POST" });
		} catch {
			// Best-effort stop.
		}
	};

	const startStreaming = async () => {
		setError(null);
		setOutput("");
		setSentNotice(null);
		setIsStreaming(true);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const response = await fetch(`${baseUrl}/generate`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ prompt }),
				signal: controller.signal,
			});

			if (!response.ok) {
				const body = await response.text().catch(() => "");
				throw new Error(`Generate failed (${response.status}) ${body}`.trim());
			}

			if (!response.body) {
				throw new Error("No response stream available");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				buffer = parseSseChunk(buffer, (data) => {
					if (data === "[DONE]") return;
					try {
						const parsed = JSON.parse(data) as { error?: string };
						if (parsed.error) {
							setError(parsed.error);
							return;
						}
					} catch {
						// Token chunk, not JSON.
					}
					setOutput((prev) => prev + data);
				});
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Generation failed");
			}
		} finally {
			if (abortRef.current === controller) {
				abortRef.current = null;
			}
			setIsStreaming(false);
		}
	};

	const canWrite = Boolean(output && context?.file && context.line !== null);

	const writeToEditor = async () => {
		if (!context?.file || context.line === null || !output) return;
		const response = await fetch(`${baseUrl}/writeback`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				file: context.file,
				line: context.line,
				code: output,
			}),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Writeback failed (${response.status}) ${body}`.trim());
		}

		setSentNotice("Sent!");
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-3">
			<label className="flex min-h-0 flex-col gap-1 text-xs text-zinc-300">
				<span>Prompt</span>
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Refactor this function to use async/await..."
					rows={4}
					className="resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50"
				/>
			</label>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() => void startStreaming()}
					disabled={isStreaming || !prompt.trim()}
					className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isStreaming ? "Generating..." : "Generate"}
				</button>
				<button
					type="button"
					onClick={() => void stopStreaming()}
					disabled={!isStreaming}
					className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
				>
					Stop
				</button>
				<button
					type="button"
					onClick={() =>
						void writeToEditor().catch((err: Error) => setError(err.message))
					}
					disabled={!canWrite}
					className="rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Write to Editor
				</button>
				<span className="text-xs text-emerald-200">{sentNotice ?? ""}</span>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/35">
				<pre className="h-full overflow-auto p-3 text-xs leading-5 text-zinc-100">
					<code>{output || "// Generated code will stream here..."}</code>
				</pre>
			</div>

			{error ? <p className="text-xs text-rose-200">{error}</p> : null}
		</div>
	);
}
