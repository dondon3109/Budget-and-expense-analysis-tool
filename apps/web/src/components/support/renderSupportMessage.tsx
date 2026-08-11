import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface SupportDestination {
  label: string;
  to: string;
  external?: boolean;
}

const SUPPORT_DESTINATIONS: SupportDestination[] = [
  { label: "Help and contact", to: "/app/settings#help-and-contact" },
  { label: "Help & contact", to: "/app/settings#help-and-contact" },
  { label: "Profile dashboard", to: "/app" },
  { label: "Terms of service", to: "/terms-of-service" },
  { label: "Privacy policy", to: "/privacy-policy" },
  { label: "Cookie policy", to: "/cookie-policy" },
  { label: "Plan and billing", to: "/app/settings#plan-and-billing" },
  { label: "Account settings", to: "/app/settings" },
  { label: "Goals & debt", to: "/app/plan" },
  { label: "AI Assistant", to: "/app/assistant" },
  { label: "Android APK", to: "/install" },
  { label: "Start free", to: "/signup" },
  { label: "Sign in", to: "/login" },
  { label: "Transactions", to: "/app/transactions" },
  { label: "Subscriptions", to: "/app/subscriptions" },
  { label: "Calendar", to: "/app/calendar" },
  { label: "Budgets", to: "/app/budgets" },
  { label: "Import", to: "/app/import" },
  { label: "Profile", to: "/app" },
  { label: "Contact", to: "/app/settings#contact" },
  { label: "Help", to: "/app/settings#help" },
  { label: "FAQ", to: "/faq" },
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
          href={destination.to}
          key={`${keyPrefix}-${labelStart}`}
        >
          {label}
        </a>,
      );
    } else {
      parts.push(
        <Link
          className="support-message-link"
          to={destination.to}
          key={`${keyPrefix}-${labelStart}`}
        >
          {label}
        </Link>,
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
