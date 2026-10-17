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

/**
 * A member as a sentence names them: "you", their email, or "a former member". `start`
 * capitalizes the phrases (never an email) for the start of a sentence.
 */
export function memberName(
  detail: FamilyDetail | undefined,
  userId: string,
  me: string,
  start = false,
): string {
  const phrase = (text: string) => (start ? text.charAt(0).toUpperCase() + text.slice(1) : text);
  if (userId === me) return phrase("you");
  const member = detail?.members.find((item) => item.userId === userId);
  if (!member) return phrase("a former member");
  return member.email ?? phrase("a family member");
}
