import type { ReactNode } from "react";
import { splitVoiceCaption } from "@zoption/shared";

/**
 * Renders caption content for voice conversation with markdown bold support.
 * Converts **bold text** into <strong> elements. Handles incomplete ** tags
 * during live typewriter streaming without exposing raw delimiter syntax.
 */
export function renderVoiceCaptionContent(content: string): ReactNode[] {
  return splitVoiceCaption(content).map((segment, index) =>
    segment.kind === "bold" ? (
      <strong key={`bold-${index}`} className="assistant-voice-bold">
        {segment.text}
      </strong>
    ) : (
      segment.text
    ),
  );
}
