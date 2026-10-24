import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import { LeatherworkingKnowledgePage } from "./LeatherworkingKnowledgePage.js";
import { leatherworkingKnowledgePageFromPath } from "./leatherworking-knowledge.js";
import { StaticPage, staticPageFromPath } from "./StaticPage.js";
import "./styles.css";

const staticPage = staticPageFromPath(window.location.pathname);
const knowledgePage = leatherworkingKnowledgePageFromPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {staticPage !== undefined ? <StaticPage page={staticPage} /> : knowledgePage !== undefined ? (
      <LeatherworkingKnowledgePage page={knowledgePage} />
    ) : (
      <ItemTooltipProvider>
        <App />
      </ItemTooltipProvider>
    )}
  </StrictMode>,
);
