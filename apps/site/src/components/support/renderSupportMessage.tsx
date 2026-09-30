import type { ReactNode } from "react";
import { appUrl } from "../../lib/appUrl";

interface SupportDestination {
  label: string;
  href: string;
  external?: boolean;
}

const SUPPORT_DESTINATIONS: SupportDestination[] = [
  { label: "Help and contact", href: appUrl("/app/settings#help-and-contact") },
  { label: "Help & contact", href: appUrl("/app/settings#help-and-contact") },
  { label: "Profile dashboard", href: appUrl("/app") },
  { label: "Terms of service", href: "/terms-of-service" },
  { label: "Privacy policy", href: "/privacy-policy" },
  { label: "Cookie policy", href: "/cookie-policy" },
  { label: "Plan and billing", href: appUrl("/app/settings#plan-and-billing") },
  { label: "Account settings", href: appUrl("/app/settings") },
  { label: "Goals & debt", href: appUrl("/app/plan") },
  { label: "AI Assistant", href: appUrl("/app/assistant") },
  { label: "Android APK", href: "/install" },
  { label: "Start free", href: appUrl("/signup") },
  { label: "Sign in", href: appUrl("/login") },
  { label: "Transactions", href: appUrl("/app/transactions") },
  { label: "Subscriptions", href: appUrl("/app/subscriptions") },
  { label: "Calendar", href: appUrl("/app/calendar") },
  { label: "Budgets", href: appUrl("/app/budgets") },
  { label: "Import", href: appUrl("/app/import") },
  { label: "Profile", href: appUrl("/app") },
  { label: "Contact", href: appUrl("/app/settings#contact") },
  { label: "Help", href: appUrl("/app/settings#help") },
  { label: "FAQ", href: "/faq" },
];

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const destinationByLabel = new Map(
  SUPPORT_DESTINATIONS.map((destination) => [destination.label.toLowerCase(), destination]),
);
const destinationPattern = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${SUPPORT_DESTINATIONS.map(({ label }) => escapePattern(label)).join("|")})(?=$|[^\\p{L}\\p{N}])`,
  "gu",
);

function linkifyText(content: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  destinationPattern.lastIndex = 0;

  while ((match = destinationPattern.exec(content)) !== null) {
    const leading = match[1] ?? "";
    const label = match[2] ?? "";
    const destination = destinationByLabel.get(label.toLowerCase());
    const labelStart = match.index + leading.length;

    if (labelStart > cursor) parts.push(content.slice(cursor, labelStart));
    if (!destination) {
      parts.push(label);
    } else if (destination.external) {
      parts.push(
        <a
          className="support-message-link"
          href={destination.href}
          key={`${keyPrefix}-${labelStart}`}
        >
          {label}
        </a>,
      );
    } else {
      parts.push(
        <a
          className="support-message-link"
          href={destination.href}
          key={`${keyPrefix}-${labelStart}`}
        >
          {label}
        </a>,
      );
    }
    cursor = labelStart + label.length;
  }

  if (cursor < content.length) parts.push(content.slice(cursor));
  return parts;
}

export function renderSupportMessage(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const opening = content.indexOf("**", cursor);
    if (opening === -1) {
      parts.push(...linkifyText(content.slice(cursor), `plain-${cursor}`));
      break;
    }

    const closing = content.indexOf("**", opening + 2);
    if (closing === -1) {
      parts.push(...linkifyText(content.slice(cursor), `plain-${cursor}`));
      break;
    }

    if (opening > cursor) {
      parts.push(...linkifyText(content.slice(cursor, opening), `plain-${cursor}`));
    }
    const emphasized = content.slice(opening + 2, closing);
    if (emphasized) {
      parts.push(
        <strong key={`strong-${opening}`}>{linkifyText(emphasized, `strong-${opening}`)}</strong>,
      );
    } else {
      parts.push("****");
    }
    cursor = closing + 2;
  }

  return parts;
}
