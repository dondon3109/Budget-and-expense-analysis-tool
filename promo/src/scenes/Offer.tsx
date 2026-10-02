import { C, FONT, ease, easeInOut, pop, prog } from "../theme";
import { vf } from "../timing";
import { Caption } from "../ui/Caption";
import { Kicker, Ripple } from "../ui/bits";
import { ArrowRightIcon, CardIcon, CheckIcon } from "../ui/Icons";

const Panel = ({ rel, from, to, children }: { rel: number; from: number; to: number; children: React.ReactNode }) => {
  const inP = prog(rel, from, 10);
  const outP = prog(rel, to, 9, easeInOut);
  if (rel < from || rel > to + 10) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: inP * (1 - outP),
        transform: `translateY(${(1 - inP) * 40 - outP * 60}px) scale(${1 - outP * 0.06})`,
      }}
    >
      {children}
    </div>
  );
};

const Stamp = ({ rel, at, children, rotate = -8, style }: { rel: number; at: number; children: React.ReactNode; rotate?: number; style?: React.CSSProperties }) => {
  if (rel < at) return null;
  const t = rel - at;
  const s = 3 - 2 * ease(Math.min(1, t / 6)) + 0.12 * Math.exp(-t / 6) * Math.sin(t * 0.9);
  return (
    <div
      style={{
        position: "absolute",
        padding: "6px 38px 14px",
        borderRadius: 30,
        background: C.brand,
        color: C.logoBg,
        border: `10px solid ${C.logoBg}`,
        boxShadow: `0 0 0 6px ${C.brand}, 0 30px 80px rgba(0,0,0,0.55)`,
        fontFamily: FONT.display,
        fontWeight: 800,
        letterSpacing: -3,
        transform: `rotate(${rotate}deg) scale(${s})`,
        opacity: Math.min(1, t / 2),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const Cursor = ({ x, y, rel, at }: { x: number; y: number; rel: number; at: number }) => {
  const p = prog(rel, at - 22, 20, easeInOut);
  const press = rel >= at && rel < at + 6 ? 0.85 : 1;
  if (p <= 0) return null;
  return (
    <svg
      width="76"
      height="76"
      viewBox="0 0 24 24"
      style={{ position: "absolute", left: x + (1 - p) * 220, top: y + (1 - p) * 260, transform: `scale(${press})`, filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.5))", zIndex: 40 }}
    >
      <path d="M5 3l14 7-6 2-2 6z" fill={C.ink} stroke={C.logoBg} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
};

export const Offer = ({ rel }: { rel: number }) => {
  const dayFill = (i: number) => vf(1.45 + i * 0.27);
  const aEnd = vf(4.95);
  const bFrom = vf(5.02);
  const bEnd = vf(6.45);
  const cFrom = vf(6.5);
  const cEnd = vf(9.15);
  const dFrom = vf(9.2);
  const signAt = vf(4.45);
  const sign = pop(rel, vf(3.95), 12, 170);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* A: the badge, the seven days, the sign-up tap */}
      <Panel rel={rel} from={0} to={aEnd}>
        <Kicker style={{ position: "absolute", top: 118, left: 0, right: 0, transform: `scale(${pop(rel, vf(0.17), 12, 200)})` }}>New here?</Kicker>
        <div
          style={{
            position: "absolute",
            top: 175,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: FONT.display,
            fontWeight: 800,
            fontSize: 108,
            letterSpacing: -4,
            lineHeight: 1,
            opacity: prog(rel, vf(0.9), 10),
            transform: `translateY(${(1 - prog(rel, vf(0.9), 12)) * 30}px)`,
          }}
        >
          Your first week
          <br />
          of Pro is <span style={{ color: C.brand }}>on us</span>
        </div>
        <Stamp rel={rel} at={vf(3.4)} rotate={8} style={{ left: 575, top: 470, fontSize: 140 }}>
          FREE
        </Stamp>
        <div style={{ position: "absolute", top: 1030, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 12 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const on = rel >= dayFill(i);
            const p = pop(rel, dayFill(i), 10, 220);
            return (
              <div
                key={i}
                style={{
                  width: 118,
                  height: 130,
                  borderRadius: 30,
                  background: on ? C.brand : C.surface,
                  border: `2px solid ${on ? C.brand : C.line}`,
                  color: on ? C.logoBg : C.inkSoft,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: FONT.display,
                  transform: `scale(${on ? 0.9 + 0.1 * Math.min(1.15, p) : 1})`,
                }}
              >
                <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 600, letterSpacing: 2 }}>DAY</span>
                <span style={{ fontSize: 62, fontWeight: 800, lineHeight: 1 }}>{i + 1}</span>
              </div>
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            top: 1190,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            transform: `scale(${Math.max(0, sign)})`,
            opacity: Math.min(1, sign * 2),
          }}
        >
          <div style={{ padding: "26px 74px", borderRadius: 999, background: C.cream, color: C.logoBg, fontFamily: FONT.display, fontWeight: 800, fontSize: 54, transform: `scale(${rel >= signAt ? 0.94 + 0.06 * Math.min(1, (rel - signAt) / 6) : 1})` }}>
            Sign up free
          </div>
        </div>
        <Cursor x={700} y={1262} rel={rel} at={signAt} />
        <Ripple rel={rel} at={signAt} x={716} y={1271} size={140} />
      </Panel>

      {/* B: no card */}
      <Panel rel={rel} from={bFrom} to={bEnd}>
        <div style={{ position: "absolute", top: 480, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `scale(${pop(rel, bFrom + 2, 11, 150)})` }}>
          <div style={{ position: "relative", width: 420, height: 420, color: C.brandStrong }}>
            <CardIcon size={420} stroke={1.3} />
            <div
              style={{
                position: "absolute",
                left: -20,
                top: 196,
                width: 460,
                height: 24,
                borderRadius: 12,
                background: C.danger,
                transform: `rotate(-38deg) scaleX(${prog(rel, vf(5.4), 7, ease)})`,
                transformOrigin: "left center",
                boxShadow: `0 0 0 8px ${C.bg}`,
              }}
            />
          </div>
        </div>
        <div style={{ position: "absolute", top: 1000, left: 0, right: 0, textAlign: "center", fontFamily: FONT.display, fontWeight: 800, fontSize: 112, letterSpacing: -3, opacity: prog(rel, bFrom + 8, 10) }}>
          No card <span style={{ color: C.brand }}>needed</span>
        </div>
      </Panel>

      {/* C: automatic drop to Free */}
      <Panel rel={rel} from={cFrom} to={cEnd}>
        <div style={{ position: "absolute", top: 560, left: 40, right: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 26, fontFamily: FONT.display }}>
          <div style={{ padding: "44px 46px", borderRadius: 56, background: C.brand, color: C.logoBg, textAlign: "center", transform: `scale(${Math.max(0, pop(rel, vf(6.57), 11, 170))})` }}>
            <div style={{ fontSize: 100, fontWeight: 800, lineHeight: 1 }}>PRO</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: 600, marginTop: 6 }}>DAY 7</div>
          </div>
          <div style={{ color: C.brandStrong, transform: `scaleX(${prog(rel, vf(7.2), 10)})`, transformOrigin: "left" }}>
            <ArrowRightIcon size={110} stroke={2.4} />
          </div>
          <div style={{ padding: "44px 46px", borderRadius: 56, background: C.surface, border: `3px solid ${C.brand}`, textAlign: "center", transform: `scale(${Math.max(0, pop(rel, vf(7.56), 11, 170))})` }}>
            <div style={{ fontSize: 100, fontWeight: 800, lineHeight: 1, color: C.ink }}>FREE</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: 600, marginTop: 6, color: C.brand }}>PLAN</div>
          </div>
        </div>
        <div style={{ position: "absolute", top: 900, left: 0, right: 0, textAlign: "center", fontFamily: FONT.display, fontWeight: 800, fontSize: 84, letterSpacing: -2, opacity: prog(rel, vf(7.9), 10), transform: `translateY(${(1 - prog(rel, vf(7.9), 12)) * 24}px)` }}>
          Automatically.
        </div>
      </Panel>

      {/* D: nothing charged */}
      <Panel rel={rel} from={dFrom} to={9999}>
        <div style={{ position: "absolute", top: 430, left: 0, right: 0, textAlign: "center", fontFamily: FONT.display, fontWeight: 800 }}>
          <div style={{ fontSize: 380, letterSpacing: -14, lineHeight: 1, color: C.brand, transform: `scale(${0.9 + 0.1 * Math.min(1.2, pop(rel, dFrom, 9, 180))})` }}>₱0</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 20, padding: "18px 44px", borderRadius: 999, background: C.cream, color: C.logoBg, fontSize: 60, transform: `scale(${pop(rel, dFrom + 8, 11, 190)})` }}>
            <span style={{ width: 62, height: 62, borderRadius: 31, background: C.brand, display: "grid", placeItems: "center" }}>
              <CheckIcon size={40} stroke={3.4} />
            </span>
            charged
          </div>
        </div>
      </Panel>

      <Caption scene="offer" rel={rel} />
    </div>
  );
};
