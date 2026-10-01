import { C, FONT, ease, pop, prog } from "../theme";
import { Caption } from "../ui/Caption";
import { Kicker } from "../ui/bits";

const WORD = "zoption".split("");

export const Reveal = ({ rel }: { rel: number }) => {
  const flash = 1 - prog(rel, 0, 9, ease);
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT.display }}>
      <div style={{ position: "absolute", inset: 0, background: C.brand, opacity: flash * 0.6 }} />
      <Kicker style={{ position: "absolute", top: 150, left: 0, right: 0, opacity: prog(rel, 14, 12), transform: `translateY(${(1 - prog(rel, 14, 12)) * 30}px)` }}>
        Meet
      </Kicker>
      <div
        style={{
          position: "absolute",
          top: 1060,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 210,
          letterSpacing: -6,
          color: C.ink,
        }}
      >
        {WORD.map((ch, i) => {
          const p = pop(rel, 12 + i * 2, 13, 160);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - Math.min(1, p)) * 160}px) rotate(${(1 - Math.min(1, p)) * 12}deg)`,
                opacity: Math.min(1, p * 2),
                color: i === 0 ? C.brand : C.ink,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
      <Caption scene="reveal" rel={rel} />
    </div>
  );
};
