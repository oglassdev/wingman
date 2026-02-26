import { useEffect, useState } from "react";

import type { WingmanSettings } from "../../../../packages/shared/src/types";
import { useSettings } from "../hooks/useSettings";

type Props = {
	settingsState: ReturnType<typeof useSettings>;
};

const PROVIDERS = [
	{ value: "openai", label: "OpenAI" },
	{ value: "anthropic", label: "Anthropic" },
	{ value: "openrouter", label: "OpenRouter" },
	{ value: "ollama", label: "Ollama (OpenAI-compatible)" },
];

export function SettingsPanel({ settingsState }: Props) {
	const { settings, isLoading, isSaving, error, save } = settingsState;
	const [form, setForm] = useState<WingmanSettings | null>(settings);
	const [saveNote, setSaveNote] = useState<string | null>(null);

	useEffect(() => {
		setForm(settings);
	}, [settings]);

	useEffect(() => {
		if (!saveNote) return;
		const timeout = window.setTimeout(() => setSaveNote(null), 2000);
		return () => window.clearTimeout(timeout);
	}, [saveNote]);

	if (isLoading || !form) {
		return <div className="text-sm text-zinc-300">Loading settings...</div>;
	}

	const update = <K extends keyof WingmanSettings>(key: K, value: WingmanSettings[K]) =>
		setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

	return (
		<form
			className="space-y-3"
			onSubmit={async (event) => {
				event.preventDefault();
				await save(form);
				setSaveNote("Saved");
			}}
		>
			<div className="grid grid-cols-2 gap-3">
				<label className="space-y-1 text-xs text-zinc-300">
					<span>Provider</span>
					<select
						value={form.provider}
						onChange={(e) => update("provider", e.target.value)}
						className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
					>
						<option value="">Select provider</option>
						{PROVIDERS.map((provider) => (
							<option key={provider.value} value={provider.value}>
								{provider.label}
							</option>
						))}
					</select>
				</label>

				<label className="space-y-1 text-xs text-zinc-300">
					<span>Model ID</span>
					<input
						value={form.modelId}
						onChange={(e) => update("modelId", e.target.value)}
						placeholder="gpt-4.1-mini"
						className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50"
					/>
				</label>
			</div>

			<label className="block space-y-1 text-xs text-zinc-300">
				<span>Backend URL</span>
				<input
					value={form.backendUrl}
					onChange={(e) => update("backendUrl", e.target.value)}
					placeholder="http://localhost:11434"
					className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50"
				/>
			</label>

			<label className="block space-y-1 text-xs text-zinc-300">
				<span>API Key</span>
				<input
					type="password"
					value={form.apiKey}
					onChange={(e) => update("apiKey", e.target.value)}
					placeholder="sk-..."
					className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50"
				/>
			</label>

			<label className="block space-y-2 text-xs text-zinc-300">
				<div className="flex items-center justify-between">
					<span>Temperature</span>
					<span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-zinc-200">
						{form.temperature.toFixed(2)}
					</span>
				</div>
				<input
					type="range"
					min={0}
					max={1}
					step={0.01}
					value={form.temperature}
					onChange={(e) =>
						update("temperature", Number.parseFloat(e.target.value))
					}
					className="w-full accent-cyan-300"
				/>
			</label>

			<div className="flex items-center justify-between gap-3">
				<div className="text-xs text-rose-200">{error ?? saveNote ?? "\u00a0"}</div>
				<button
					type="submit"
					disabled={isSaving}
					className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{isSaving ? "Saving..." : "Save"}
				</button>
			</div>
		</form>
	);
}
