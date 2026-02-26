import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ServerPortProvider } from "./context/ServerPortContext";
import "./electroview";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ServerPortProvider>
			<App />
		</ServerPortProvider>
	</StrictMode>,
);
