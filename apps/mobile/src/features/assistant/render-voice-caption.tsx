import type { ReactNode } from "react";
import { type StyleProp, Text, type TextStyle } from "react-native";
import { splitVoiceCaption } from "@zoption/shared";

import type { AssistantWireMessage } from "@/api/assistant";

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

export interface AssistantVoiceCaption {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/**
 * Maps stored thread messages to voice captions, preserving order and
 * dropping empty content so a resumed voice session re-enters with prior
 * context instead of a blank conversation.
 */
export function mapAssistantMessagesToVoiceCaptions(
  messages: ReadonlyArray<Pick<AssistantWireMessage, "id" | "role" | "content">>,
): AssistantVoiceCaption[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({ id: message.id, role: message.role, text: message.content }));
}
