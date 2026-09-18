export interface VoiceCaptionSegment {
  kind: "text" | "bold";
  text: string;
}

/**
 * Splits streamed caption text into plain and bold segments. A stream can stop mid
 * marker, so an unclosed "**" renders as bold and a trailing "*▍" drops the sliced
 * asterisk instead of flashing it before the caret.
 */
export function splitVoiceCaption(content: string): VoiceCaptionSegment[] {
  const segments: VoiceCaptionSegment[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const opening = content.indexOf("**", cursor);
    if (opening === -1) {
      const remaining = content.slice(cursor);
      if (remaining.endsWith("*▍")) {
        const prefix = remaining.slice(0, -2);
        if (prefix) segments.push({ kind: "text", text: prefix });
        segments.push({ kind: "text", text: "▍" });
      } else if (remaining) {
        segments.push({ kind: "text", text: remaining });
      }
      break;
    }

    if (opening > cursor) {
      segments.push({ kind: "text", text: content.slice(cursor, opening) });
    }

    const closing = content.indexOf("**", opening + 2);
    if (closing === -1) {
      const unclosed = content.slice(opening + 2);
      if (unclosed) segments.push({ kind: "bold", text: unclosed });
      break;
    }

    const bold = content.slice(opening + 2, closing);
    if (bold) segments.push({ kind: "bold", text: bold });
    cursor = closing + 2;
  }

  return segments;
}
