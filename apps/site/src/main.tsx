import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Geist for text, Geist Mono for code: served with the site, latin subsets load on demand.
import "@fontsource-variable/geist";
import "@fontsource/geist-mono/400.css";
import "./studio.css";
import "./site.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
