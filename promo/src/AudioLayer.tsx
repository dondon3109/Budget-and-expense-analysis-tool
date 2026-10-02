import { Audio, Sequence, interpolate, staticFile } from "remotion";
import { FPS, MUSIC, SCENES, SFX, TOTAL_FRAMES, VOICE, VOICE_OFFSET, f, type SceneKey } from "./timing";

const sceneKeys = Object.keys(VOICE) as SceneKey[];

/** Speech activity (0..1) at absolute frame, so the music can duck under the voiceover. */
const speech = (frame: number) => {
  let a = 0;
  for (const key of sceneKeys) {
    const base = SCENES[key].from + VOICE_OFFSET;
    for (const seg of VOICE[key].segments) {
      const s = base + seg.start * FPS;
      const e = base + seg.end * FPS;
      // ramp down quickly before the phrase, recover slowly after it
      const v = interpolate(frame, [s - 4, s + 2, e, e + 10], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      a = Math.max(a, v);
    }
  }
  return a;
};

const musicVolume = (frame: number) => {
  const reveal = SCENES.reveal.from;
  if (frame < reveal) {
    // under the 17.5s intro clip: quiet bed that swells into the drop
    const bed = interpolate(frame, [0, 30, reveal - 90, reveal - 4], [0, 0.2, 0.26, 0.5], {
      extrapolateRight: "clamp",
    });
    return bed;
  }
  const open = 0.6;
  const ducked = 0.3;
  const vol = open + (ducked - open) * speech(frame);
  const fade = interpolate(frame, [TOTAL_FRAMES - 45, TOTAL_FRAMES - 1], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return vol * fade;
};

export const AudioLayer = () => (
  <>
    <Audio src={staticFile(MUSIC.file)} volume={musicVolume} />
    {sceneKeys.map((key) => (
      <Sequence key={key} from={SCENES[key].from + VOICE_OFFSET} layout="none">
        <Audio src={staticFile(VOICE[key].file)} volume={1} />
      </Sequence>
    ))}
    {SFX.map((s, i) => (
      <Sequence key={i} from={f(s.at)} layout="none">
        <Audio src={staticFile(`audio/${s.file}.mp3`)} volume={s.volume ?? 1} />
      </Sequence>
    ))}
  </>
);
