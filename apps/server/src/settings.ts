import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { WingmanSettings } from "../../../packages/shared/src/types";

const SETTINGS_FILE_NAME = "wingman-settings.json";

const DEFAULT_SETTINGS: WingmanSettings = {
	provider: "",
	backendUrl: "http://localhost:11434",
	apiKey: "",
	modelId: "",
	temperature: 0.2,
};

function getAppDataDir(): string {
	if (process.platform === "darwin") {
		return join(homedir(), "Library", "Application Support", "Wingman");
	}

	if (process.platform === "win32") {
		return join(
			process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
			"Wingman",
		);
	}

	return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "wingman");
}

export function getSettingsPath(): string {
	return join(getAppDataDir(), SETTINGS_FILE_NAME);
}

export async function loadSettings(): Promise<WingmanSettings> {
	try {
		const raw = await readFile(getSettingsPath(), "utf8");
		const parsed = JSON.parse(raw) as Partial<WingmanSettings>;
		return {
			...DEFAULT_SETTINGS,
			...parsed,
			temperature:
				typeof parsed.temperature === "number"
					? Math.max(0, Math.min(1, parsed.temperature))
					: DEFAULT_SETTINGS.temperature,
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export async function saveSettings(
	settings: WingmanSettings,
): Promise<WingmanSettings> {
	const normalized: WingmanSettings = {
		...DEFAULT_SETTINGS,
		...settings,
		temperature: Math.max(0, Math.min(1, Number(settings.temperature ?? 0.2))),
	};

	await mkdir(dirname(getSettingsPath()), { recursive: true });
	await writeFile(getSettingsPath(), JSON.stringify(normalized, null, 2), "utf8");

	return normalized;
}

