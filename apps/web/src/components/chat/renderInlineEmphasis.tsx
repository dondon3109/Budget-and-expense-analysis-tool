import type { ReactNode } from "react";

export function renderInlineEmphasis(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const opening = content.indexOf("**", cursor);
    if (opening === -1) {
      parts.push(content.slice(cursor));
      break;
    }

    const closing = content.indexOf("**", opening + 2);
    if (closing === -1) {
      parts.push(content.slice(cursor));
      break;
    }

    if (opening > cursor) parts.push(content.slice(cursor, opening));
    const emphasized = content.slice(opening + 2, closing);
    if (emphasized) {
      parts.push(<strong key={opening}>{emphasized}</strong>);
    } else {
      parts.push("****");
    }
    cursor = closing + 2;
  }

  return parts;
}
