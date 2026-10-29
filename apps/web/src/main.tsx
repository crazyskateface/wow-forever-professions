import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProfessionWorkspace } from "./ProfessionWorkspace.js";
import { ProfessionLanding } from "./ProfessionLanding.js";
import { professionIdFromUrl } from "./profession-navigation.js";
import { ItemTooltipProvider } from "./ItemTooltip.js";
import { LeatherworkingKnowledgePage } from "./LeatherworkingKnowledgePage.js";
import { leatherworkingKnowledgePageFromPath } from "./leatherworking-knowledge.js";
import { StaticPage, staticPageFromPath } from "./StaticPage.js";
import "./styles.css";
import "./best-crafts.css";
import "./professions.css";

const professionId = professionIdFromUrl(window.location.href);
const staticPage = staticPageFromPath(window.location.pathname);
const knowledgePage = leatherworkingKnowledgePageFromPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {staticPage !== undefined ? <StaticPage page={staticPage} /> : knowledgePage !== undefined ? (
      <LeatherworkingKnowledgePage page={knowledgePage} />
    ) : (
      <ItemTooltipProvider>
        {professionId === undefined ? <ProfessionLanding /> : <ProfessionWorkspace professionId={professionId} />}
      </ItemTooltipProvider>
    )}
  </StrictMode>,
);
