import { Img, staticFile } from "remotion";
import { C, FONT, ease, easeInOut, pop, prog, settle } from "../theme";
import { vf } from "../timing";
import { Caption } from "../ui/Caption";
import { Chip, Finger, Ripple } from "../ui/bits";
import { AppIcon, CartIcon, CheckIcon, KeyboardIcon, MicIcon, UtensilsIcon } from "../ui/Icons";
import { Phone, PHONE_H, PHONE_W } from "../ui/Phone";
import { voiceLevel } from "../ui/voice";

const TRANSCRIPT = "I spent 250 on Jollibee for lunch and 2,000 on groceries".split(" ");
const CARD = { left: 30, top: 300, width: 516 };
const MIC = { x: CARD.left + 25 + 55, y: CARD.top + 95 };

const Waveform = ({ rel }: { rel: number }) => {
  const level = voiceLevel("demo1", rel);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 120 }}>
      {Array.from({ length: 30 }, (_, i) => {
        const centre = 1 - Math.abs(i - 14.5) / 22;
        const wobble = 0.35 + 0.65 * Math.abs(Math.sin(rel * 0.42 + i * 0.95));
        const h = 8 + level * 150 * wobble * centre;
        return <div key={i} style={{ width: 8, height: h, borderRadius: 4, background: C.brand, opacity: 0.55 + 0.45 * centre }} />;
      })}
    </div>
  );
};

const Entry = ({ rel, at, icon, title, sub, amount }: { rel: number; at: number; icon: "food" | "cart"; title: string; sub: string; amount: string }) => {
  const p = pop(rel, at, 13, 170);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "18px 0",
        transform: `translateX(${(1 - Math.min(1, p)) * 90}px)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      <div style={{ width: 70, height: 70, borderRadius: 24, background: C.brandSoft, display: "grid", placeItems: "center", color: C.brand }}>
        {icon === "food" ? <UtensilsIcon size={36} /> : <CartIcon size={36} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 32, fontWeight: 600, whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 24, color: C.inkSoft, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: 600, whiteSpace: "nowrap" }}>{amount}</div>
    </div>
  );
};

export const Demo1 = ({ rel }: { rel: number }) => {
  const enter = pop(rel, 0, 15, 90);
  const tap = vf(0.55);
  const listenOn = vf(0.62);
  const loggedOn = vf(4.69);
  const toastOn = vf(5.52);
  const toastOff = vf(7.7);

  const widget = 1 - prog(rel, tap + 2, 6);
  const listening = prog(rel, listenOn, 10) * (1 - prog(rel, loggedOn - 4, 8));
  const logged = pop(rel, loggedOn, 15, 140);
  const micPulse = rel >= tap ? 1 + 0.08 * Math.sin((rel - tap) * 0.6) * Math.exp(-(rel - tap) / 40) : 1;

  const wordsShown = Math.floor(prog(rel, vf(2.0), vf(4.1) - vf(2.0), (x) => x) * (TRANSCRIPT.length + 0.99));
  const listenP = settle(rel, listenOn);

  const toast = settle(rel, toastOn) * (1 - prog(rel, toastOff, 10, easeInOut));

  const sway = Math.sin(rel / 40) * 2.5;
  const rotY = -34 + 24 * ease(prog(rel, 0, 40)) + sway;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: (1080 - PHONE_W) / 2, top: 96, perspective: 2400, transform: "scale(1.1)", transformOrigin: "top center" }}>
        <div
          style={{
            width: PHONE_W,
            height: PHONE_H,
            transform: `translateY(${(1 - Math.min(1, enter)) * 1500}px) rotateY(${rotY}deg) rotateX(${4 + Math.sin(rel / 33) * 1.5}deg) rotateZ(${-2 + sway * 0.3}deg)`,
          }}
        >
          <Phone style={{ position: "absolute", inset: 0 }}>
            {/* launcher */}
            <div style={{ position: "absolute", top: 104, left: 0, right: 0, textAlign: "center", fontFamily: FONT.display }}>
              <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4 }}>9:41</div>
              <div style={{ fontSize: 28, color: C.inkSoft, fontFamily: FONT.ui, fontWeight: 500 }}>Thursday, October 1</div>
            </div>
            <div style={{ position: "absolute", top: 640, left: 44, right: 44, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 36 }}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} style={{ aspectRatio: "1", borderRadius: 24, background: C.surfaceHover, opacity: 0.8 }} />
              ))}
            </div>
            <div style={{ position: "absolute", bottom: 42, left: 44, right: 44, height: 120, borderRadius: 40, background: C.surface, display: "flex", justifyContent: "space-around", alignItems: "center" }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ width: 70, height: 70, borderRadius: 22, background: C.surfaceHover }} />
              ))}
            </div>

            {/* the Zoption mic widget */}
            <div
              style={{
                position: "absolute",
                left: CARD.left,
                top: CARD.top,
                width: CARD.width,
                height: 190,
                borderRadius: 44,
                background: C.surface,
                border: `2px solid rgba(95,227,184,0.35)`,
                display: "flex",
                alignItems: "center",
                gap: 26,
                padding: "0 25px",
                boxSizing: "border-box",
                opacity: widget,
                transform: `scale(${0.96 + 0.04 * widget})`,
              }}
            >
              <div style={{ width: 110, height: 110, borderRadius: "50%", background: C.brand, display: "grid", placeItems: "center", color: C.logoBg, transform: `scale(${micPulse})` }}>
                <MicIcon size={52} stroke={2.4} />
              </div>
              <div>
                <div style={{ fontFamily: FONT.display, fontSize: 38, fontWeight: 800 }}>Zoption</div>
                <div style={{ fontSize: 24, color: C.inkSoft, marginTop: 4 }}>Tap and say what you spent</div>
              </div>
            </div>

            {/* listening */}
            {listening > 0.01 && (
              <div
                style={{
                  position: "absolute",
                  left: CARD.left,
                  top: CARD.top,
                  width: CARD.width,
                  boxSizing: "border-box",
                  padding: "34px 34px 40px",
                  borderRadius: 44,
                  background: C.surface,
                  border: `2px solid ${C.brand}`,
                  opacity: listening,
                  transform: `scaleY(${0.5 + 0.5 * Math.min(1, listenP)})`,
                  transformOrigin: "top center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, color: C.brand }}>
                  <MicIcon size={34} />
                  Listening…
                </div>
                <Waveform rel={rel} />
                <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 44, lineHeight: 1.18, minHeight: 190 }}>
                  {TRANSCRIPT.slice(0, wordsShown).map((w, i) => (
                    <span key={i} style={{ color: i === wordsShown - 1 ? C.brand : C.ink }}>
                      {w}{" "}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* logged */}
            {rel >= loggedOn && (
              <div
                style={{
                  position: "absolute",
                  left: CARD.left,
                  top: CARD.top,
                  width: CARD.width,
                  boxSizing: "border-box",
                  padding: "30px 30px 14px",
                  borderRadius: 44,
                  background: C.surface,
                  border: `2px solid ${C.line}`,
                  transform: `scale(${0.9 + 0.1 * Math.min(1, logged)})`,
                  opacity: Math.min(1, logged * 2),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, color: C.brand, marginBottom: 6 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.brand, display: "grid", placeItems: "center", color: C.logoBg }}>
                    <CheckIcon size={26} stroke={3} />
                  </div>
                  2 entries logged
                </div>
                <Entry rel={rel} at={loggedOn + 3} icon="food" title="Jollibee" sub="Lunch · Food" amount="−₱250.00" />
                <div style={{ height: 2, background: C.line }} />
                <Entry rel={rel} at={loggedOn + 10} icon="cart" title="Groceries" sub="Groceries" amount="−₱2,000.00" />
              </div>
            )}

            <Ripple rel={rel} at={tap} x={MIC.x} y={MIC.y} />
            <Finger rel={rel} at={tap} x={MIC.x} y={MIC.y} />

            {/* notification */}
            {toast > 0.01 && (
              <div
                style={{
                  position: "absolute",
                  top: 90,
                  left: 26,
                  right: 26,
                  padding: "22px 26px",
                  borderRadius: 38,
                  background: "#1d2623",
                  border: `1px solid ${C.line}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  transform: `translateY(${(1 - toast) * -200}px)`,
                  opacity: toast,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                  zIndex: 20,
                }}
              >
                <Img src={staticFile("zoption-mark-512.png")} style={{ width: 68, height: 68, borderRadius: 20 }} />
                <div>
                  <div style={{ fontSize: 22, color: C.inkSoft }}>Zoption AI · now</div>
                  <div style={{ fontSize: 31, fontWeight: 700 }}>2 entries logged</div>
                </div>
              </div>
            )}
          </Phone>
        </div>
      </div>

      <Chip rel={rel} at={vf(6.28)} tilt={-5} style={{ left: 40, top: 1120 }}>
        <KeyboardIcon size={54} stroke={2.4} />
        <span style={{ position: "relative" }}>
          No typing
          <span style={{ position: "absolute", left: -6, right: -6, top: "54%", height: 7, borderRadius: 4, background: C.danger, transform: `scaleX(${prog(rel, vf(6.45), 8)})`, transformOrigin: "left" }} />
        </span>
      </Chip>
      <Chip rel={rel} at={vf(7.23)} tilt={4} style={{ right: 36, top: 1010, fontSize: 42 }}>
        <AppIcon size={50} stroke={2.4} />
        <span style={{ position: "relative" }}>
          Opening the app
          <span style={{ position: "absolute", left: -6, right: -6, top: "54%", height: 7, borderRadius: 4, background: C.danger, transform: `scaleX(${prog(rel, vf(7.5), 8)})`, transformOrigin: "left" }} />
        </span>
      </Chip>

      <Caption scene="demo1" rel={rel} />
    </div>
  );
};
