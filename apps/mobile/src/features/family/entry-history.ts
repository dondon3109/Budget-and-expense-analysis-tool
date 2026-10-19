import type { FamilyEntryEvent, FamilyEntryView } from "@zoption/shared";

const FIELD_NAMES: [keyof FamilyEntryView, string][] = [
  ["amountMinor", "amount"],
  ["description", "description"],
  ["date", "date"],
  ["categoryName", "category"],
  ["accountName", "account"],
  ["kind", "type"],
  ["currency", "currency"],
  ["notes", "notes"],
];

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** One history line without its author and time: "changed the amount and date", "deleted it". */
export function describeEntryEvent(event: FamilyEntryEvent): string {
  if (event.action === "deleted") return "deleted it";
  if (event.action === "restored") return "restored it";
  const { before, after } = event;
  const changed =
    before && after
      ? FIELD_NAMES.filter(([field]) => before[field] !== after[field]).map(([, name]) => name)
      : [];
  return changed.length > 0 ? `changed the ${joinNames(changed)}` : "edited it";
}

/** A Worker timestamp ("2026-10-19 08:00:00", UTC) as a short local date: "Oct 19". */
export function formatFamilyTime(at: string): string {
  const parsed = new Date(at.includes("T") ? at : `${at.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return at;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
