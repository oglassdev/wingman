import { useEffect, useState } from "react";

import type { WingmanContext } from "../../../../packages/shared/src/types";
import { useServerPort } from "../context/ServerPortContext";

export function useServerContext() {
	const { baseUrl } = useServerPort();
	const [context, setContext] = useState<WingmanContext | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			try {
				const response = await fetch(`${baseUrl}/context`);
				if (!response.ok) {
					throw new Error(`Context request failed (${response.status})`);
				}

				const payload = (await response.json()) as WingmanContext;
				if (!cancelled) {
					setContext(payload);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load context");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		void load();
		const interval = window.setInterval(() => {
			void load();
		}, 2000);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [baseUrl]);

	return { context, isLoading, error };
}
