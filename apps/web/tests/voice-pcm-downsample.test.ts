import { describe, expect, it } from "vitest";

import { toPcm16 } from "../src/lib/voiceStream";

describe("toPcm16", () => {
  it("keeps 16 kHz audio sample for sample", () => {
    const pcm = toPcm16(new Float32Array([0, 0.5, -0.5, 1]), 16000);
    expect(Array.from(pcm)).toEqual([0, 16383, -16384, 32767]);
  });

  it("averages 48 kHz audio down to a third of the samples", () => {
    const pcm = toPcm16(new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]), 48000);
    expect(pcm).toHaveLength(2);
    expect(pcm[0]).toBeGreaterThan(0);
    expect(pcm[1]).toBeLessThan(0);
  });
});
