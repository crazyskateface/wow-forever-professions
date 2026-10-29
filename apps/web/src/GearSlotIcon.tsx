import type { GearSlot } from "./gear-slots.js";

// Original slot silhouettes, kept as vectors so the small controls stay sharp.
const SLOT_PATHS: Record<GearSlot, string> = {
  head: "M5 20V10a7 7 0 0 1 14 0v10l-5-3v-5h-4v5Z M5 10h5m4 0h5M12 3v5",
  neck: "M5 4C2 12 6 16 12 18c6-2 10-6 7-14M9 18l3-4 3 4-3 4Z",
  shoulders: "m2 9 5-5 4 2v7l-8 2Zm11-3 4-2 5 5-1 6-8-2ZM4 10l5-2m6 0 5 2",
  back: "m8 3 4 2 4-2 2 6 3 12-6-1-3 2-3-2-6 1L6 9ZM8 3l4 6 4-6M12 9v10",
  chest: "m8 3 4 2 4-2 5 4-3 5-2-1 1 10H7l1-10-2 1-3-5ZM8 3l1 6h6l1-6M8 15h8",
  wrist: "m8 3 10 3-3 15-10-3ZM7 7l10 3M6 15l10 3M11 10l-1 5",
  hands: "M7 12 6 5q1-2 2 0l2 5V3q1-2 2 0v7l2-6q2-2 2 1l-1 7 3-4q2-1 2 1l-3 7-1 5H7v-4l-4-5q-1-3 2-2ZM7 17h9",
  waist: "M3 7q9 3 18 0v10q-9-3-18 0Zm6 2h6v6H9Zm3 3h3M3 12h6m6 0h6",
  legs: "M6 3h12l2 18h-6l-2-11-2 11H4ZM6 7h12M12 3v4",
  feet: "M6 3h8v10l6 3v5H4v-6l2-3ZM6 7h8M5 17h14",
  finger: "M7 11a7 7 0 1 0 10 0M9 13a4 4 0 1 0 6 0M7 6l3-3h4l3 3-5 7Zm0 0h10M10 3l2 10 2-10",
  weapon: "m9 13 9-11 4 0v4L11 15ZM5 11l8 8M7 16l-4 4 1 1 4-4M3 19l2 2",
  "off-hand": "M12 2 3 6v6q0 6 9 10 9-4 9-10V6ZM12 5v14M6 8l6-3 6 3v4q0 3-6 7-6-4-6-7Z",
  relic: "m12 2 5 7-2 4 3 8H6l3-8-2-4Zm0 0v11M7 9h10M9 13h6M8 18h8",
};

export function GearSlotIcon({ slot }: { readonly slot: GearSlot }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"><path d={SLOT_PATHS[slot]} /></svg>;
}
