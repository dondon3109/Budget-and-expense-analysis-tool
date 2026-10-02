import { C, FONT, ease, pop, prog } from "../theme";
import { vf } from "../timing";
import { Caption } from "../ui/Caption";
import { ArrowRightIcon } from "../ui/Icons";

export const Cta = ({ rel }: { rel: number }) => {
  const word = "zoption".split("");
  const btnAt = vf(1.57);
  const btn = pop(rel, btnAt, 10, 170);
  const beat = rel >= btnAt ? 1 + 0.035 * Math.sin((rel - btnAt) * 0.28) : 1;
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: FONT.display }}>
      <div style={{ position: "absolute", top: 1010, left: 0, right: 0, display: "flex", justifyContent: "center", fontWeight: 800, fontSize: 170, letterSpacing: -5 }}>
        {word.map((ch, i) => {
          const p = pop(rel, 8 + i * 2, 13, 160);
          return (
            <span key={i} style={{ display: "inline-block", color: i === 0 ? C.brand : C.ink, opacity: Math.min(1, p * 2), transform: `translateY(${(1 - Math.min(1, p)) * 90}px)` }}>
              {ch}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 1215, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `scale(${Math.max(0, btn) * beat})`, opacity: Math.min(1, btn * 2) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "30px 62px", borderRadius: 999, background: C.brand, color: C.logoBg, fontWeight: 800, fontSize: 60 }}>
          Start free <ArrowRightIcon size={58} stroke={2.8} /> zoption.site
        </div>
      </div>
      <div style={{ position: "absolute", top: 1360, left: 0, right: 0, textAlign: "center", fontFamily: FONT.mono, fontSize: 32, letterSpacing: 6, color: C.inkSoft, opacity: prog(rel, vf(2.4), 12, ease) }}>
        ANDROID · WEB
      </div>
      <Caption scene="cta" rel={rel} y={1470} />
    </div>
  );
};
