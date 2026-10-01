import envelopes from "../voiceEnvelope.json";
import { VOICE, VOICE_OFFSET, type SceneKey } from "../timing";

const data = envelopes as Record<string, number[]>;

/** 0..1 loudness of a scene's voiceover at relative frame `rel`, from the real recording. */
export const voiceLevel = (scene: SceneKey, rel: number) => {
  const file = VOICE[scene].file.split("/").pop()!;
  return data[file]?.[rel - VOICE_OFFSET] ?? 0;
};
