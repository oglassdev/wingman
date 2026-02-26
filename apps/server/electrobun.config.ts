import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "wingman",
		identifier: "wingman.app",
		version: "1.0.0",
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"../client/dist/index.html": "views/mainview/index.html",
			"../client/dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["../client/dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
	runtime: {
		exitOnLastWindowClosed: false,
		window: {
			width: 640,
			height: 480,
			alwaysOnTop: true,
		},
	},
} satisfies ElectrobunConfig;
