import { useEffect, useState } from "react";

import type { WingmanSettings } from "../../../../packages/shared/src/types";
import { wingmanRpc } from "../electroview";

type UseSettingsResult = {
	settings: WingmanSettings | null;
	isLoading: boolean;
	isSaving: boolean;
	error: string | null;
	save: (settings: WingmanSettings) => Promise<void>;
};

export function useSettings(): UseSettingsResult {
	const [settings, setSettings] = useState<WingmanSettings | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				const next = await wingmanRpc.proxy.request["settings:read"](undefined);
				if (!cancelled) {
					setSettings(next);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load settings");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	const save = async (next: WingmanSettings) => {
		setIsSaving(true);
		try {
			const saved = await wingmanRpc.proxy.request["settings:write"](next);
			setSettings(saved);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save settings");
			throw err;
		} finally {
			setIsSaving(false);
		}
	};

	return { settings, isLoading, isSaving, error, save };
}
