import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SpotlightApp } from "./components/SpotlightApp";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./index.css";

function Root() {
  const [isSpotlight, setIsSpotlight] = useState(() => {
    try {
      const win = getCurrentWebviewWindow();
      return win?.label === "spotlight";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const win = getCurrentWebviewWindow();
      if (win?.label === "spotlight") {
        setIsSpotlight(true);
        document.documentElement.classList.add("spotlight-window");
        document.body.classList.add("spotlight-window");
        const rootEl = document.getElementById("root");
        if (rootEl) rootEl.classList.add("spotlight-window");
      }
    } catch {
      // Fora do runtime Tauri (ex: preview no navegador)
    }
  }, []);

  return isSpotlight ? <SpotlightApp /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
