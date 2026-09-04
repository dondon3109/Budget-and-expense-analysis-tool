import type { ReactNode } from "react";
import { type StyleProp, Text, type TextStyle } from "react-native";

/**
 * Renders caption content for mobile voice conversation with markdown bold support.
 * Converts **bold text** into bold Text components. Handles incomplete ** tags
 * during live typewriter streaming without exposing raw delimiter syntax.
 */
export function renderMobileVoiceCaption(
  content: string,
  textStyle: StyleProp<TextStyle>,
  boldStyle: StyleProp<TextStyle>,
): ReactNode[] {
  if (!content) return [];

  const parts: ReactNode[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const opening = content.indexOf("**", cursor);
    if (opening === -1) {
      const remaining = content.slice(cursor);
      if (remaining.endsWith("*▍")) {
        const prefix = remaining.slice(0, -2);
        if (prefix) {
          parts.push(
            <Text key={`text-${parts.length}`} style={textStyle}>
              {prefix}
            </Text>,
          );
        }
        parts.push(
          <Text key={`text-${parts.length}`} style={textStyle}>
            ▍
          </Text>,
        );
      } else if (remaining) {
        parts.push(
          <Text key={`text-${parts.length}`} style={textStyle}>
            {remaining}
          </Text>,
        );
      }
      break;
    }

    if (opening > cursor) {
      parts.push(
        <Text key={`text-${parts.length}`} style={textStyle}>
          {content.slice(cursor, opening)}
        </Text>,
      );
    }

    const closing = content.indexOf("**", opening + 2);
    if (closing === -1) {
      const unclosedText = content.slice(opening + 2);
      if (unclosedText) {
        parts.push(
          <Text key={`bold-${parts.length}`} style={[textStyle, boldStyle]}>
            {unclosedText}
          </Text>,
        );
      }
      break;
    }

    const boldText = content.slice(opening + 2, closing);
    if (boldText) {
      parts.push(
        <Text key={`bold-${parts.length}`} style={[textStyle, boldStyle]}>
          {boldText}
        </Text>,
      );
    }
    cursor = closing + 2;
  }

  return parts;
}
