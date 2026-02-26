import { useState } from "react";

import { ContextHeader } from "./components/ContextHeader";
import { GeneratePanel } from "./components/GeneratePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useServerPort } from "./context/ServerPortContext";
import { useServerContext } from "./hooks/useServerContext";
import { useSettings } from "./hooks/useSettings";

type Tab = "generate" | "settings";

function App() {
	const [tab, setTab] = useState<Tab>("generate");
	const serverContext = useServerContext();
	const settingsState = useSettings();
	const { port, isLoading: isPortLoading, error: portError } = useServerPort();

	return (
		<div className="h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.22),transparent_45%),radial-gradient(circle_at_100%_0%,rgba(251,191,36,0.16),transparent_42%),#0a0b10] text-white">
			<div className="relative flex h-full flex-col gap-3 p-3">
				<div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-2xl shadow-black/30 backdrop-blur">
					<div className="mb-3 flex items-center justify-between gap-3">
						<div>
							<h1 className="text-lg font-semibold tracking-tight">Wingman</h1>
							<p className="text-xs text-zinc-400">
								{isPortLoading ? "Connecting..." : `Inference server :${port}`}
							</p>
						</div>
						<div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
							{(["generate", "settings"] as const).map((nextTab) => (
								<button
									key={nextTab}
									type="button"
									onClick={() => setTab(nextTab)}
									className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
										tab === nextTab
											? "bg-white text-zinc-900"
											: "text-zinc-300 hover:bg-white/5"
									}`}
								>
									{nextTab}
								</button>
							))}
						</div>
					</div>

					<ContextHeader
						context={serverContext.context}
						isLoading={serverContext.isLoading}
					/>

					{serverContext.error || portError ? (
						<p className="mt-2 text-xs text-rose-200">
							{serverContext.error ?? portError}
						</p>
					) : null}
				</div>

				<div className="min-h-0 flex-1 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-xl shadow-black/20 backdrop-blur">
					{tab === "settings" ? (
						<SettingsPanel settingsState={settingsState} />
					) : (
						<GeneratePanel context={serverContext.context} />
					)}
				</div>
			</div>
		</div>
	);
}

export default App;
