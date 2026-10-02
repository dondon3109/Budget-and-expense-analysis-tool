import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { AudioLayer } from "./AudioLayer";
import { Cta } from "./scenes/Cta";
import { Demo1 } from "./scenes/Demo1";
import { Demo2 } from "./scenes/Demo2";
import { Demo3 } from "./scenes/Demo3";
import { Offer } from "./scenes/Offer";
import { Reveal } from "./scenes/Reveal";
import { C, FONT } from "./theme";
import { HEIGHT, SCENES, TOTAL_FRAMES, WIDTH } from "./timing";
import { World } from "./three/World";
import { Fonts } from "./ui/Fonts";
import { Grain } from "./ui/Grain";
import { Wipe } from "./ui/Wipe";

/** Wraps a scene so its component receives the frame relative to the scene start. */
const Scene = ({ k, children }: { k: Exclude<keyof typeof SCENES, "intro">; children: (rel: number) => React.ReactNode }) => (
  <Sequence from={SCENES[k].from} durationInFrames={SCENES[k].dur} layout="none">
    <Rel>{children}</Rel>
  </Sequence>
);
const Rel = ({ children }: { children: (rel: number) => React.ReactNode }) => <>{children(useCurrentFrame())}</>;

/** Intro clip, dipped to black over its last few frames so the logo reveal lands from darkness. */
const Intro = () => {
  const frame = useCurrentFrame();
  const dip = interpolate(frame, [SCENES.intro.dur - 10, SCENES.intro.dur - 1], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <Sequence from={0} durationInFrames={SCENES.intro.dur} layout="none">
      <AbsoluteFill style={{ background: C.bg }}>
        <OffthreadVideo src={staticFile("scene1/Zoption-video.mp4")} style={{ opacity: dip, width: WIDTH, height: HEIGHT }} />
      </AbsoluteFill>
    </Sequence>
  );
};

export const Promo = () => (
  <AbsoluteFill style={{ background: C.bg, color: C.ink, fontFamily: FONT.ui }}>
    <Fonts />
    <ThreeCanvas
      from={SCENES.reveal.from}
      durationInFrames={TOTAL_FRAMES - SCENES.reveal.from}
      width={WIDTH}
      height={HEIGHT}
      camera={{ fov: 40, position: [0, 0, 6], near: 0.1, far: 60 }}
      gl={{ antialias: true }}
    >
      <World />
    </ThreeCanvas>

    <Intro />
    <Scene k="reveal">{(rel) => <Reveal rel={rel} />}</Scene>
    <Scene k="demo1">{(rel) => <Demo1 rel={rel} />}</Scene>
    <Scene k="demo2">{(rel) => <Demo2 rel={rel} />}</Scene>
    <Scene k="demo3">{(rel) => <Demo3 rel={rel} />}</Scene>
    <Scene k="offer">{(rel) => <Offer rel={rel} />}</Scene>
    <Scene k="cta">{(rel) => <Cta rel={rel} />}</Scene>

    {[SCENES.demo1.from, SCENES.demo2.from, SCENES.demo3.from, SCENES.offer.from, SCENES.cta.from].map((cut) => (
      <Wipe key={cut} cut={cut} />
    ))}
    <Sequence from={SCENES.reveal.from} layout="none">
      <Grain />
    </Sequence>
    <AudioLayer />
  </AbsoluteFill>
);
