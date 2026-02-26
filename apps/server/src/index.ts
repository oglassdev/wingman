import { BrowserView, BrowserWindow, Screen, Tray, Updater, Utils } from "electrobun/bun";
import { postContext } from "../../../packages/shared/src/client";
import type { WingmanContext, WingmanSettings } from "../../../packages/shared/src/types";
import { loadSettings, saveSettings } from "./settings";
import { startInferenceServer } from "./inference-server";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const PANEL_WIDTH = 640;
const PANEL_HEIGHT = 480;
const PANEL_MARGIN = 24;

type WingmanRPCSchema = {
	bun: {
		requests: {
			"settings:read": {
				params: undefined;
				response: WingmanSettings;
			};
			"settings:write": {
				params: WingmanSettings;
				response: WingmanSettings;
			};
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {};
	};
};

function parseCliContext(argv: string[]): Partial<WingmanContext> | null {
	const args = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 1) {
		const key = argv[i];
		if (!key?.startsWith("--")) continue;
		const value = argv[i + 1];
		if (value && !value.startsWith("--")) {
			args.set(key, value);
			i += 1;
		}
	}

	const file = args.get("--file") ?? null;
	const lineRaw = args.get("--line");
	const line = lineRaw ? Number.parseInt(lineRaw, 10) : null;
	const selection = args.get("--selection") ?? null;

	if (!file && line === null && !selection) {
		return null;
	}

	return {
		file,
		line: Number.isFinite(line) ? line : null,
		selection,
		surroundingCode: null,
	};
}

function getFloatingPanelFrame() {
	const display = Screen.getPrimaryDisplay();
	const workArea = display.workArea;

	return {
		width: PANEL_WIDTH,
		height: PANEL_HEIGHT,
		x: Math.max(workArea.x + PANEL_MARGIN, workArea.x + workArea.width - PANEL_WIDTH - PANEL_MARGIN),
		y: workArea.y + PANEL_MARGIN,
	};
}

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'pnpm dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();
const inferenceServer = await startInferenceServer();
console.log(`Inference server listening on ${inferenceServer.url}`);

const rpc = BrowserView.defineRPC<WingmanRPCSchema>({
	handlers: {
		requests: {
			"settings:read": async () => loadSettings(),
			"settings:write": async (settings: WingmanSettings) => {
				const saved = await saveSettings(settings);
				await fetch(`${inferenceServer.url}/reload-config`, { method: "POST" }).catch(
					(error) => {
						console.warn("Failed to reload inference server config", error);
					},
				);
				return saved;
			},
		},
	},
});

let mainWindow: BrowserWindow<typeof rpc> | null = null;

function createMainWindow() {
	const window = new BrowserWindow({
		title: "Wingman",
		url,
		rpc,
		transparent: true,
		frame: getFloatingPanelFrame(),
	});
	window.setAlwaysOnTop(true);
	window.on("close", () => {
		mainWindow = null;
	});
	mainWindow = window;
	return window;
}

const cliContext = parseCliContext(process.argv.slice(2));
if (cliContext) {
	await postContext(inferenceServer.url, {
		file: cliContext.file ?? null,
		line: cliContext.line ?? null,
		selection: cliContext.selection ?? null,
		surroundingCode: null,
	}).catch((error) => {
		console.warn("Failed to push CLI context to inference server", error);
	});
}

createMainWindow();

const tray = new Tray({ title: "Wingman" });
tray.setMenu([
	{ type: "normal", label: "Show Wingman", action: "show" },
	{ type: "separator" },
	{ type: "normal", label: "Quit Wingman", action: "quit" },
]);
tray.on("tray-clicked", (event) => {
	const action = (event as { data?: { action?: string } }).data?.action;
	if (!action || action === "show") {
		const window = mainWindow ?? createMainWindow();
		window.show();
		window.focus();
		return;
	}

	if (action === "quit") {
		Utils.quit();
	}
});

console.log("Wingman app started!");
