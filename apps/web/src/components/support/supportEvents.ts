export const OPEN_SUPPORT_CHAT_EVENT = "zoption:open-support-chat";

export function openSupportChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_SUPPORT_CHAT_EVENT));
}
