import { C, FONT, ease, pop, prog, settle } from "../theme";
import { vf } from "../timing";
import { Caption } from "../ui/Caption";
import { Finger, Ripple } from "../ui/bits";
import { CheckIcon, MicIcon, SparkleIcon, WalletIcon } from "../ui/Icons";
import { Phone, PHONE_H, PHONE_W } from "../ui/Phone";

const USER_TEXT = "300 na lang natira sa GCash ko";
const SAVE = { x: 288, y: 960 };

const Bubble = ({ rel, at, user, children }: { rel: number; at: number; user?: boolean; children: React.ReactNode }) => {
  const p = pop(rel, at, 13, 190);
  if (rel < at) return null;
  return (
    <div
      style={{
        alignSelf: user ? "flex-end" : "flex-start",
        maxWidth: 440,
        padding: "22px 30px",
        borderRadius: 34,
        borderBottomRightRadius: user ? 10 : 34,
        borderBottomLeftRadius: user ? 34 : 10,
        background: user ? C.brand : C.surface,
        color: user ? C.logoBg : C.ink,
        border: user ? "none" : `1px solid ${C.line}`,
        fontSize: 32,
        fontWeight: user ? 600 : 500,
        lineHeight: 1.3,
        transform: `scale(${0.85 + 0.15 * Math.min(1, p)}) translateY(${(1 - Math.min(1, p)) * 30}px)`,
        transformOrigin: user ? "bottom right" : "bottom left",
        opacity: Math.min(1, p * 2),
      }}
    >
      {children}
    </div>
  );
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderTop: `1px solid ${C.line}` }}>
    <span style={{ fontSize: 26, color: C.inkSoft }}>{label}</span>
    <span style={{ fontSize: 28, fontWeight: 600 }}>{children}</span>
  </div>
);

export const Demo2 = ({ rel }: { rel: number }) => {
  const enter = pop(rel, 0, 15, 90);
  const rotY = 40 - 50 * ease(prog(rel, 0, 40)) + Math.sin(rel / 38) * 2.5;

  const typeStart = vf(2.75);
  const typed = Math.floor(prog(rel, typeStart, 38, (x) => x) * (USER_TEXT.length + 0.99));
  const showUser = rel >= typeStart + 38;
  const dotsOn = vf(4.1);
  const draftAt = vf(4.6);
  const tapAt = vf(6.55);
  const savedAt = vf(6.75);
  const draft = pop(rel, draftAt, 14, 150);
  const saved = pop(rel, savedAt, 10, 200);
  const isSaved = rel >= savedAt;
  const pulse = rel >= vf(5.93) && !isSaved ? 1 + 0.03 * Math.sin((rel - vf(5.93)) * 0.5) : 1;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: (1080 - PHONE_W) / 2, top: 96, perspective: 2400, transform: "scale(1.1)", transformOrigin: "top center" }}>
        <div
          style={{
            width: PHONE_W,
            height: PHONE_H,
            transform: `translateX(${(1 - Math.min(1, enter)) * 1000}px) rotateY(${rotY}deg) rotateX(${3 + Math.sin(rel / 30)}deg) rotateZ(${2 - Math.sin(rel / 41) * 0.8}deg)`,
          }}
        >
          <Phone style={{ position: "absolute", inset: 0 }}>
            {/* header */}
            <div style={{ position: "absolute", top: 80, left: 0, right: 0, height: 96, display: "flex", alignItems: "center", gap: 16, padding: "0 34px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 56, height: 56, borderRadius: 20, background: C.brandSoft, color: C.brand, display: "grid", placeItems: "center" }}>
                <SparkleIcon size={32} />
              </div>
              <div style={{ fontFamily: FONT.display, fontSize: 38, fontWeight: 800 }}>Zoption AI</div>
              <div style={{ marginLeft: "auto", fontSize: 22, color: C.brand, fontFamily: FONT.mono }}>● online</div>
            </div>

            {/* conversation */}
            <div style={{ position: "absolute", top: 196, left: 30, right: 30, display: "flex", flexDirection: "column", gap: 18 }}>
              <Bubble rel={rel} at={vf(0.45)}>Hi! What did you spend, or what&apos;s left in an account?</Bubble>
              {showUser && <Bubble rel={rel} at={typeStart + 38} user>{USER_TEXT}</Bubble>}
              {rel >= dotsOn && rel < draftAt && (
                <div style={{ alignSelf: "flex-start", display: "flex", gap: 10, padding: "24px 30px", borderRadius: 34, background: C.surface, border: `1px solid ${C.line}` }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 14, height: 14, borderRadius: 7, background: C.brand, opacity: 0.4 + 0.6 * Math.abs(Math.sin((rel - dotsOn) * 0.4 - i * 0.7)), transform: `translateY(${Math.sin((rel - dotsOn) * 0.4 - i * 0.7) * -5}px)` }} />
                  ))}
                </div>
              )}
              {rel >= draftAt && (
                <div
                  style={{
                    alignSelf: "stretch",
                    padding: "26px 28px 28px",
                    borderRadius: 38,
                    background: C.surface,
                    border: `2px solid ${isSaved ? C.brand : C.line}`,
                    transform: `translateY(${(1 - Math.min(1, draft)) * 80}px) scale(${0.92 + 0.08 * Math.min(1, draft)})`,
                    opacity: Math.min(1, draft * 2),
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.brand, fontWeight: 700, fontSize: 25, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT.mono }}>
                    <SparkleIcon size={24} /> Draft transaction
                  </div>
                  <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 84, margin: "8px 0 4px", letterSpacing: -2 }}>−₱700.00</div>
                  <div style={{ display: "inline-block", padding: "8px 18px", borderRadius: 999, background: C.brandSoft, color: C.brandStrong, fontSize: 23, fontWeight: 600, marginBottom: 14 }}>
                    Worked out: GCash ₱1,000 → ₱300
                  </div>
                  <Row label="Category">Food &amp; Drinks</Row>
                  <Row label="Account">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <WalletIcon size={26} /> GCash
                    </span>
                  </Row>
                  <div
                    style={{
                      marginTop: 18,
                      height: 78,
                      borderRadius: 26,
                      background: isSaved ? C.brandSoft : C.brand,
                      color: isSaved ? C.brand : C.logoBg,
                      border: isSaved ? `2px solid ${C.brand}` : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      fontSize: 33,
                      fontWeight: 700,
                      transform: `scale(${isSaved ? 0.96 + 0.1 * Math.min(1, saved) - 0.06 * Math.exp(-(rel - savedAt) / 4) : pulse})`,
                    }}
                  >
                    {isSaved ? <CheckIcon size={36} stroke={3.2} /> : null}
                    {isSaved ? "Saved" : "Save transaction"}
                  </div>
                  <div style={{ marginTop: 14, textAlign: "center", fontSize: 22, color: C.inkSoft }}>
                    Nothing saves until you tap Save
                  </div>
                </div>
              )}
            </div>

            {/* composer */}
            <div style={{ position: "absolute", left: 28, right: 28, bottom: 34, height: 92, borderRadius: 46, background: C.surface, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", padding: "0 14px 0 34px", gap: 14 }}>
              <div style={{ flex: 1, fontSize: 29, color: C.inkSoft, fontFamily: FONT.ui }}>
                {rel >= typeStart && rel < typeStart + 38 ? (
                  <span style={{ color: C.ink }}>{USER_TEXT.slice(0, typed)}<span style={{ color: C.brand }}>|</span></span>
                ) : (
                  "Tell me what you spent…"
                )}
              </div>
              <div style={{ width: 66, height: 66, borderRadius: "50%", background: C.brand, color: C.logoBg, display: "grid", placeItems: "center" }}>
                <MicIcon size={34} stroke={2.4} />
              </div>
            </div>

            <Ripple rel={rel} at={tapAt} x={SAVE.x} y={SAVE.y} size={150} />
            <Finger rel={rel} at={tapAt} x={SAVE.x} y={SAVE.y} />
          </Phone>
        </div>
      </div>
      <Caption scene="demo2" rel={rel} />
    </div>
  );
};
