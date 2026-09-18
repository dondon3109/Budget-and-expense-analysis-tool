import { describe, expect, it } from "vitest";

import { parseVoiceLanguage } from "../src/types";
import { VOICE_LANGUAGES } from "../src/voiceLanguages";

describe("VOICE_LANGUAGES", () => {
  it("lists Auto, English, and Tagalog in picker order with badge labels", () => {
    expect(VOICE_LANGUAGES.map((option) => option.code)).toEqual(["auto", "en", "fil"]);
    expect(VOICE_LANGUAGES.map((option) => option.shortLabel)).toEqual(["AUTO", "EN", "TL"]);
    expect(VOICE_LANGUAGES[0]).toMatchObject({
      code: "auto",
      label: "Auto",
      nativeLabel: "Auto (EN / TL)",
    });
  });

  it("stays in step with the boundary parser", () => {
    for (const option of VOICE_LANGUAGES) {
      expect(parseVoiceLanguage(option.code)).toBe(option.code);
    }
  });
});
