import { useMemo } from "react";
import { C, FONT, pop } from "../theme";
import { FPS, VOICE, VOICE_OFFSET, type SceneKey } from "../timing";

type Word = { text: string; start: number };
type Group = { words: Word[]; start: number; end: number };

const MAX_WORDS = 4;

/** Splits each spoken phrase into short on-screen groups and times every word across the phrase. */
const buildGroups = (scene: SceneKey): Group[] => {
  const groups: Group[] = [];
  for (const seg of VOICE[scene].segments) {
    const words = seg.text.split(/\s+/);
    const weights = words.map((w) => w.length + 2);
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    const timed = words.map((text, i) => {
      const start = seg.start + ((seg.end - seg.start) * acc) / total;
      acc += weights[i];
      return { text, start };
    });
    const n = Math.ceil(words.length / MAX_WORDS);
    const size = Math.ceil(words.length / n);
    for (let g = 0; g < n; g++) {
      const slice = timed.slice(g * size, (g + 1) * size);
      const next = timed[(g + 1) * size];
      groups.push({ words: slice, start: slice[0].start, end: next ? next.start : seg.end });
    }
  }
  return groups;
};

const isHot = (w: string) => /[₱\d]|zoption|free|pro|ai|gcash|safe|no$|card|charge/i.test(w.replace(/[^\w₱]/g, ""));

/** Word-by-word captions locked to the voiceover; the newest word is highlighted. */
export const Caption = ({ scene, rel, y = 1490 }: { scene: SceneKey; rel: number; y?: number }) => {
  const groups = useMemo(() => buildGroups(scene), [scene]);
  const t = (rel - VOICE_OFFSET) / FPS;
  const group = [...groups].reverse().find((g) => t >= g.start - 0.08);
  if (!group || t > group.end + 0.45) return null;
  const visible = group.words.filter((w) => t >= w.start - 0.04);
  const newest = visible[visible.length - 1];
  const enter = pop(rel, Math.round((group.start - 0.08) * FPS + VOICE_OFFSET), 14, 190);

  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: y,
        transform: `translateY(-50%) scale(${0.9 + 0.1 * Math.min(1, enter)})`,
        opacity: Math.min(1, enter * 1.5),
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 22px",
        fontFamily: FONT.display,
        fontWeight: 800,
        fontSize: 88,
        lineHeight: 1.08,
        letterSpacing: -1.5,
        textAlign: "center",
      }}
    >
      {visible.map((w, i) => {
        const hot = w === newest || isHot(w.text);
        const wp = pop(rel, Math.round((w.start - 0.04) * FPS + VOICE_OFFSET), 12, 220);
        return (
          <span
            key={`${w.text}-${i}`}
            style={{
              display: "inline-block",
              color: w === newest ? C.brand : hot ? C.brandStrong : C.ink,
              transform: `translateY(${(1 - Math.min(1, wp)) * 26}px) scale(${w === newest ? 1.06 : 1})`,
              opacity: Math.min(1, wp * 1.6),
              WebkitTextStroke: `14px ${C.bg}`,
              paintOrder: "stroke fill",
              textShadow: "0 6px 0 rgba(0,0,0,0.35)",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
