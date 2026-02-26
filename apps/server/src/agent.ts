import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

import type { WingmanSettings } from "../../../packages/shared/src/types";
import { buildSystemPrompt, getContext } from "./context";

const agent = new Agent();
let configured = false;
let configurationError: string | null = null;

export function getAgent(): Agent {
	return agent;
}

export function resetAgent(): Agent {
	agent.clearMessages();
	agent.setSystemPrompt(buildSystemPrompt(getContext()));
	return agent;
}

export function isAgentConfigured(): boolean {
	return configured;
}

export function getAgentConfigurationError(): string | null {
	return configurationError;
}

export function getAgentModelId(): string | null {
	return configured ? agent.state.model?.id ?? null : null;
}

export function reconfigureAgent(settings: WingmanSettings): void {
	const hasConfig = Boolean(settings.provider && settings.modelId);
	if (!hasConfig) {
		configured = false;
		configurationError = "Wingman not configured. Open the settings panel.";
		agent.setSystemPrompt(buildSystemPrompt(getContext()));
		agent.clearMessages();
		return;
	}

	try {
		const model = getModel(settings.provider as never, settings.modelId as never);
		if (settings.backendUrl) {
			model.baseUrl = settings.backendUrl;
		}

		agent.getApiKey = () => settings.apiKey || undefined;
		agent.setModel(model);
		agent.setSystemPrompt(buildSystemPrompt(getContext()));
		agent.clearMessages();

		configured = true;
		configurationError = null;
	} catch (error) {
		configured = false;
		configurationError =
			error instanceof Error
				? error.message
				: "Wingman not configured. Open the settings panel.";
		agent.setSystemPrompt(buildSystemPrompt(getContext()));
		agent.clearMessages();
	}
}

