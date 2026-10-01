import { C, FONT, ease, pop, prog } from "../theme";
import { vf } from "../timing";
import { CATEGORIES } from "../three/Donut";
import { Caption } from "../ui/Caption";
import { Kicker } from "../ui/bits";
import { CheckIcon, SparkleIcon } from "../ui/Icons";

const SAFE_MINOR = 41200;

const Pill = ({ rel, at, children, strong }: { rel: number; at: number; children: React.ReactNode; strong?: boolean }) => {
  const p = pop(rel, at, 12, 190);
  if (rel < at) return <div style={{ width: 0 }} />;
  return (
    <div
      style={{
        padding: "18px 30px",
        borderRadius: 26,
        background: strong ? C.brand : C.surfaceHover,
        color: strong ? C.logoBg : C.ink,
        fontFamily: FONT.display,
        fontWeight: 800,
        fontSize: 44,
        transform: `scale(${Math.max(0, p)})`,
        opacity: Math.min(1, p * 2),
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
};

export const Demo3 = ({ rel }: { rel: number }) => {
  const cardAt = vf(1.56);
  const card = pop(rel, cardAt, 12, 150);
  const count = Math.round(SAFE_MINOR * ease(prog(rel, cardAt + 4, 34)));
  const legendOut = 1 - prog(rel, cardAt - 4, 8);
  const guessAt = vf(4.85);
  const guess = pop(rel, guessAt, 11, 170);
  const [whole, cents] = (count / 100).toFixed(2).split(".");
  const pulse = rel >= guessAt ? 1 + 0.025 * Math.exp(-(rel - guessAt) / 6) * Math.sin((rel - guessAt) * 1.4) : 1;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Kicker style={{ position: "absolute", top: 140, left: 0, right: 0, opacity: prog(rel, 4, 10) }}>This month</Kicker>

      {/* legend under the big donut, gone once the number arrives */}
      <div
        style={{
          position: "absolute",
          top: 1180,
          left: 40,
          right: 40,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "center",
          opacity: legendOut,
        }}
      >
        {CATEGORIES.map((c, i) => {
          const p = pop(rel, 14 + i * 4, 12, 180);
          return (
            <div
              key={c.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 24px",
                borderRadius: 999,
                background: C.surface,
                border: `1px solid ${C.line}`,
                fontSize: 34,
                fontWeight: 600,
                color: C.ink,
                transform: `scale(${Math.max(0, p)})`,
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 11, background: c.color }} />
              {c.name} <span style={{ color: C.inkSoft }}>{c.pct}%</span>
            </div>
          );
        })}
      </div>

      {/* the one number */}
      {rel >= cardAt - 1 && (
        <div
          style={{
            position: "absolute",
            top: 610,
            left: 70,
            right: 70,
            padding: "46px 40px 44px",
            borderRadius: 64,
            background: C.surface,
            border: `2px solid ${rel >= guessAt ? C.brand : C.line}`,
            boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
            textAlign: "center",
            transform: `scale(${(0.6 + 0.4 * Math.min(1.08, card)) * pulse}) translateY(${(1 - Math.min(1, card)) * 120}px)`,
            opacity: Math.min(1, card * 2.5),
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 14, fontSize: 40, fontWeight: 600, color: C.inkSoft }}>
            <SparkleIcon size={34} color={C.brand} /> Safe to spend today
          </div>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, letterSpacing: -6, lineHeight: 1.02, marginTop: 10, color: C.brand }}>
            <span style={{ fontSize: 110, verticalAlign: "top", position: "relative", top: 20, marginRight: 6 }}>₱</span>
            <span style={{ fontSize: 220 }}>{Number(whole).toLocaleString("en-PH")}</span>
            <span style={{ fontSize: 100, letterSpacing: -2, color: C.brandStrong }}>.{cents}</span>
          </div>
          <div style={{ display: "inline-block", marginTop: 18, padding: "12px 28px", borderRadius: 999, background: C.brandSoft, color: C.brandStrong, fontSize: 32, fontWeight: 600 }}>
            On track this week
          </div>
        </div>
      )}

      {/* where it comes from */}
      <div style={{ position: "absolute", top: 1180, left: 40, right: 40, display: "flex", gap: 18, justifyContent: "center", alignItems: "center", fontFamily: FONT.display }}>
        <Pill rel={rel} at={vf(2.75)}>₱5,768 left</Pill>
        <Pill rel={rel} at={vf(3.25)}>÷ 14 days</Pill>
        <Pill rel={rel} at={vf(3.85)} strong>= ₱412</Pill>
      </div>

      {rel >= guessAt && (
        <div
          style={{
            position: "absolute",
            top: 1310,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${Math.max(0, guess)})`,
            opacity: Math.min(1, guess * 2),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 38px", borderRadius: 999, background: C.cream, color: C.logoBg, fontFamily: FONT.display, fontWeight: 800, fontSize: 52, transform: "rotate(-2deg)" }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: C.brand, display: "grid", placeItems: "center" }}>
              <CheckIcon size={36} stroke={3.4} />
            </div>
            No more guessing
          </div>
        </div>
      )}
      <Caption scene="demo3" rel={rel} />
    </div>
  );
};
