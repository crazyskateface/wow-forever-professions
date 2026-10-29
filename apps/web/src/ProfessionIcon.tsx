import { getProfessionDefinition } from "@forever-professions/contracts";
import manifest from "../public/icons/professions/manifest.json";
import { ItemIcon } from "./ItemIcon.js";

export function ProfessionIcon({ professionId, className, eager = false }: {
  readonly professionId: string;
  readonly className: string;
  readonly eager?: boolean;
}) {
  const profession = getProfessionDefinition(professionId);
  const icon = (manifest.icons as Readonly<Record<string, { readonly path: string }>>)[professionId];
  return <ItemIcon className={className} eager={eager} gameItemId={undefined} name={profession?.name ?? "Profession"} fallbackText={profession?.initials} src={icon?.path} />;
}
