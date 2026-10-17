import type { FamilyDetail } from "@zoption/shared";

export const ROLE_LABELS = { owner: "Owner", member: "Member", viewer: "Viewer" } as const;

/** Server timestamps (UTC instants) as a short local date. */
export function formatFamilyDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

/** A member as a sentence names them: "you", their email, or "a former member". */
export function memberName(detail: FamilyDetail | undefined, userId: string, me: string): string {
  if (userId === me) return "you";
  const member = detail?.members.find((item) => item.userId === userId);
  if (!member) return "a former member";
  return member.email ?? "a family member";
}
