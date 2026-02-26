import {
	createContext,
	type PropsWithChildren,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

const DEFAULT_SERVER_PORT = 7891;

type ServerPortContextValue = {
	port: number;
	baseUrl: string;
	isLoading: boolean;
	error: string | null;
};

const ServerPortContext = createContext<ServerPortContextValue | null>(null);

export function ServerPortProvider({ children }: PropsWithChildren) {
	const [port, setPort] = useState<number>(DEFAULT_SERVER_PORT);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const discoverPort = async () => {
			setIsLoading(true);
			try {
				const response = await fetch(
					`http://127.0.0.1:${DEFAULT_SERVER_PORT}/health`,
				);
				if (!response.ok) {
					throw new Error(`Health check failed (${response.status})`);
				}

				const payload = (await response.json()) as { port?: number };
				if (!cancelled && typeof payload.port === "number") {
					setPort(payload.port);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to reach server");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		void discoverPort();

		return () => {
			cancelled = true;
		};
	}, []);

	const value = useMemo(
		() => ({
			port,
			baseUrl: `http://127.0.0.1:${port}`,
			isLoading,
			error,
		}),
		[port, isLoading, error],
	);

	return (
		<ServerPortContext.Provider value={value}>
			{children}
		</ServerPortContext.Provider>
	);
}

export function useServerPort() {
	const value = useContext(ServerPortContext);
	if (!value) {
		throw new Error("useServerPort must be used within ServerPortProvider");
	}
	return value;
}
