export const ROLE_LABELS = { owner: "Owner", member: "Member", viewer: "Viewer" } as const;

/** Server timestamps (UTC instants) as a short local date. */
export function formatFamilyDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}
