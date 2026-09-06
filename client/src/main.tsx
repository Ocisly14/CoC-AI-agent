import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import "./i18n"; // Initialize i18next

const GrayhavenSandboxPage = React.lazy(() => import("./observer/grayhaven/GrayhavenSandboxPage"));
const isGrayhavenSandbox = window.location.pathname.replace(/\/$/, "") === "/sandbox/grayhaven";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isGrayhavenSandbox ? <React.Suspense fallback={<div>正在展开灰港镇…</div>}><GrayhavenSandboxPage /></React.Suspense> : <App />}
  </React.StrictMode>
);
