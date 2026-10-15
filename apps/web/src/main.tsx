import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ItemTooltipProvider>
      <App />
    </ItemTooltipProvider>
  </StrictMode>,
);
