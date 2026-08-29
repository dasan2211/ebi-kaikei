import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyFontFamily, getStoredFontFamily } from "./lib/font-family";
import { applyThemePreference, getStoredThemePreference } from "./lib/theme";
import "./styles.css";

applyFontFamily(getStoredFontFamily());
applyThemePreference(getStoredThemePreference());

const root = document.getElementById("root");

if (!root) {
  throw new Error("アプリケーションの描画先が見つかりません");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
