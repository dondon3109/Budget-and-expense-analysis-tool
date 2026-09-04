import type { ReactNode } from "react";

/**
 * Renders caption content for voice conversation with markdown bold support.
 * Converts **bold text** into <strong> elements. Handles incomplete ** tags
 * during live typewriter streaming without exposing raw delimiter syntax.
 */
export function renderVoiceCaptionContent(content: string): ReactNode[] {
  if (!content) return [];

  const parts: ReactNode[] = [];
  let cursor = 0;
  let keyIndex = 0;

  while (cursor < content.length) {
    const opening = content.indexOf("**", cursor);
    if (opening === -1) {
      const remaining = content.slice(cursor);
      // Clean up solitary asterisk from sliced delimiter before cursor (e.g. "...*▍")
      if (remaining.endsWith("*▍")) {
        const prefix = remaining.slice(0, -2);
        if (prefix) parts.push(prefix);
        parts.push("▍");
      } else if (remaining) {
        parts.push(remaining);
      }
      break;
    }

    // Push text before the opening **
    if (opening > cursor) {
      parts.push(content.slice(cursor, opening));
    }

    // Find matching closing **
    const closing = content.indexOf("**", opening + 2);
    if (closing === -1) {
      // Unclosed **: active during typewriter streaming
      const unclosedText = content.slice(opening + 2);
      if (unclosedText) {
        parts.push(
          <strong key={`bold-${keyIndex++}`} className="assistant-voice-bold">
            {unclosedText}
          </strong>,
        );
      }
      break;
    }

    const boldText = content.slice(opening + 2, closing);
    if (boldText) {
      parts.push(
        <strong key={`bold-${keyIndex++}`} className="assistant-voice-bold">
          {boldText}
        </strong>,
      );
    }
    cursor = closing + 2;
  }

  return parts;
}
