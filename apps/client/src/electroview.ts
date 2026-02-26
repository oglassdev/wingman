import { Electroview } from "electrobun/view";

import type { WingmanSettings } from "../../../packages/shared/src/types";

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

export const wingmanRpc = Electroview.defineRPC<WingmanRPCSchema>({
	handlers: {
		requests: {},
		messages: {},
	},
});

export const electroview = new Electroview({
	rpc: wingmanRpc,
});
