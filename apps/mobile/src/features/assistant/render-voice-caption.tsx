import type { ReactNode } from "react";
import { type StyleProp, Text, type TextStyle } from "react-native";
import { splitVoiceCaption } from "@zoption/shared";

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
  return splitVoiceCaption(content).map((segment, index) =>
    segment.kind === "bold" ? (
      <Text key={`bold-${index}`} style={[textStyle, boldStyle]}>
        {segment.text}
      </Text>
    ) : (
      <Text key={`text-${index}`} style={textStyle}>
        {segment.text}
      </Text>
    ),
  );
}
