import { useThree } from "@react-three/fiber";
import { useCurrentFrame } from "remotion";
import { C, ease, easeInOut, prog } from "../theme";
import { SCENES, VOICE_OFFSET, f } from "../timing";
import { Badge } from "./BadgeStage";
import { Donut } from "./Donut";
import { AmbientCoins, LogoCoin, Particles, Shockwave, Stars, coinEntrance } from "./parts";

/** Exponentially decaying screen shake. */
const shake = (abs: number, start: number, amp: number) => {
  const t = abs - start;
  if (t < 0 || t > 24) return [0, 0] as const;
  const d = amp * Math.exp(-t / 5);
  return [Math.sin(t * 2.7) * d, Math.cos(t * 3.3) * d] as const;
};

const Rig = ({ abs }: { abs: number }) => {
  const camera = useThree((s) => s.camera);
  const { reveal, demo3, offer, cta } = SCENES;
  const [sx, sy] = shake(abs, reveal.from, 0.16);
  const [ox, oy] = shake(abs, offer.from + VOICE_OFFSET + f(3.4), 0.1);
  const [cx2, cy2] = shake(abs, offer.from + VOICE_OFFSET + f(9.31), 0.12);
  const intro = (1 - ease(prog(abs, reveal.from, 70))) * 1.3;
  const drift = abs >= demo3.from && abs < offer.from ? 0.5 : 0;
  const ctaPush = prog(abs, cta.from, 120, easeInOut) * -0.35;
  camera.position.set(
    Math.sin(abs / 110) * 0.12 + sx + ox + cx2,
    Math.cos(abs / 130) * 0.08 + sy + oy + cy2,
    6 + intro + drift + ctaPush,
  );
  camera.lookAt(0, 0, 0);
  return null;
};

export const World = () => {
  const rel = useCurrentFrame();
  const abs = rel + SCENES.reveal.from;
  const { reveal, demo1, demo3, offer, cta } = SCENES;

  // reveal coin: spins in, floats, then punches through the camera on the cut to the demo
  const r = abs - reveal.from;
  const intro = coinEntrance(r);
  const exit = prog(abs, demo1.from - 22, 22, easeInOut);
  const revealOn = abs < demo1.from;
  const revealScale = intro.scale * (1 + exit * 1.6);

  // cta coin
  const c = abs - cta.from;
  const ctaIntro = coinEntrance(c);
  const ctaPulseAt = VOICE_OFFSET + f(1.57);
  const ctaPulse = 1 + 0.14 * Math.exp(-Math.abs(c - ctaPulseAt) / 5) * (c >= ctaPulseAt ? 1 : 0.4);

  // ambient coins live behind the demo scenes
  const ambient =
    prog(abs, demo1.from - 4, 18) * (1 - 0.6 * prog(abs, demo3.from - 6, 12)) * (1 - prog(abs, offer.from - 6, 12));

  // donut
  const d = abs - demo3.from;
  const donutOn = abs >= demo3.from - 2 && abs < offer.from;
  const moveUp = prog(d, VOICE_OFFSET + f(1.5), 20, easeInOut);
  const donutScale = (1 - moveUp * 0.4) * Math.min(1, prog(d, 0, 6));
  const donutY = 0.5 + moveUp * 1.08;
  const donutSpin = d * 0.035 - 0.4;

  return (
    <>
      <color attach="background" args={[C.bg]} />
      <fog attach="fog" args={[C.bg, 7, 22]} />
      <Rig abs={abs} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2.5, 3.5, 5]} intensity={2.6} />
      <pointLight position={[-3, -1.5, 3]} intensity={26} color={C.brand} />
      <pointLight position={[3, 3, -1]} intensity={14} color={C.brandStrong} />
      <Stars abs={abs} />
      <AmbientCoins abs={abs} visible={Math.max(0, ambient)} />

      {revealOn && (
        <>
          <LogoCoin
            scale={revealScale}
            rotY={intro.spin + Math.sin(r / 22) * 0.14 + exit * 5}
            rotX={Math.sin(r / 27) * 0.08}
            position={[0, 0.78 + Math.sin(r / 18) * 0.03 + exit * 0.8, exit * 2]}
          />
          <Shockwave abs={abs} start={reveal.from} position={[0, 0.78, -0.2]} size={6} dur={28} />
          <Shockwave abs={abs} start={reveal.from + 6} position={[0, 0.78, -0.3]} size={9} dur={34} />
          <Particles abs={abs} start={reveal.from} origin={[0, 0.78, 0.2]} kind="sparks" count={120} seed={2} />
          <Particles abs={abs} start={reveal.from + 3} origin={[0, 0.78, 0.3]} kind="confetti" count={40} seed={5} />
        </>
      )}

      {donutOn && <Donut rel={d} position={[0, donutY, 0]} scale={donutScale} spin={donutSpin} />}

      <Badge abs={abs} />
      <Particles
        abs={abs}
        start={offer.from + VOICE_OFFSET + f(3.4)}
        origin={[0, 0.3, 0.6]}
        kind="confetti"
        count={190}
        seed={9}
      />
      <Particles
        abs={abs}
        start={offer.from + VOICE_OFFSET + f(9.31)}
        origin={[0, -0.2, 0.6]}
        kind="confetti"
        count={150}
        seed={13}
      />

      {abs >= cta.from - 2 && (
        <>
          <LogoCoin
            scale={ctaIntro.scale * ctaPulse}
            rotY={ctaIntro.spin * 0.5 + Math.sin(c / 25) * 0.18}
            rotX={Math.sin(c / 30) * 0.08}
            position={[0, 0.9 + Math.sin(c / 20) * 0.03, 0]}
          />
          <Shockwave abs={abs} start={cta.from + ctaPulseAt} position={[0, 0.9, -0.2]} size={7} dur={30} />
          <Particles
            abs={abs}
            start={cta.from + ctaPulseAt}
            origin={[0, 0.9, 0.3]}
            kind="sparks"
            count={110}
            seed={21}
          />
        </>
      )}
    </>
  );
};
