import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import { StaticPage, staticPageFromPath } from "./StaticPage.js";
import "./styles.css";

const staticPage = staticPageFromPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {staticPage === undefined ? (
      <ItemTooltipProvider>
        <App />
      </ItemTooltipProvider>
    ) : <StaticPage page={staticPage} />}
  </StrictMode>,
);
