import { Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { BrandLockup } from "../components/Brand";
import { CallToAction } from "../components/CallToAction";
import { AdCanvas, Caption, Kicker, SafeFrame, Scene } from "../components/Layout";
import { FloatingCallout, ProductPreview } from "../components/ProductPreview";
import type { ProductShowcaseConfig } from "../config/types";
import { clamp, easeOut, springIn } from "../motion";

export function ProductShowcase({ config }: { config: ProductShowcaseConfig }) {
  return (
    <AdCanvas theme={config.theme} progress={false}>
      <Sequence from={0} durationInFrames={76}>
        <Scene duration={76} fadeIn={0} fadeOut={18} className="logo-intro-scene">
          <LogoIntro eyebrow={config.eyebrow} />
        </Scene>
      </Sequence>

      <Sequence from={58} durationInFrames={232}>
        <Scene duration={232} className="showcase-scene" fadeOut={22}>
          <ShowcaseStage config={config} />
        </Scene>
      </Sequence>

      <Sequence from={270} durationInFrames={90}>
        <Scene duration={90} fadeOut={0} className="cta-sequence showcase-cta">
          <CallToAction
            dark
            headline={config.headline}
            subtext={config.subtext}
            cta={config.cta}
            url={config.url}
          />
        </Scene>
      </Sequence>
    </AdCanvas>
  );
}

function LogoIntro({ eyebrow }: { eyebrow: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = springIn(frame, fps, 0);
  const ring = interpolate(frame, [0, 42], [0.72, 1.42], clamp);
  return (
    <div className="logo-intro">
      <div
        className="logo-orbit"
        style={{ opacity: 1 - reveal * 0.56, transform: `scale(${ring})` }}
      />
      <BrandLockup
        inverse
        size={118}
        wordmarkSize={66}
        style={{ transform: `scale(${0.74 + reveal * 0.26})`, opacity: reveal }}
      />
      <p style={{ opacity: easeOut(frame, 14, 16) }}>{eyebrow}</p>
    </div>
  );
}

function ShowcaseStage({ config }: { config: ProductShowcaseConfig }) {
  const frame = useCurrentFrame();
  const headline = easeOut(frame, 3, 18);
  return (
    <SafeFrame className="showcase-frame">
      <div
        className="showcase-copy"
        style={{ opacity: headline, transform: `translateY(${24 * (1 - headline)}px)` }}
      >
        <Kicker>{config.eyebrow}</Kicker>
        <h2>{config.headline}</h2>
        <Caption delay={8}>{config.subtext}</Caption>
      </div>
      <div className="showcase-product-wrap">
        <div className="showcase-back-panel">
          <span>MONTHLY VIEW</span>
          <strong>Clear, without the noise.</strong>
        </div>
        <ProductPreview asset={config.asset} variant="assistant" />
        <FloatingCallout delay={34} side="left" style={{ top: 165, left: -24 }}>
          {config.callouts[0]}
        </FloatingCallout>
        <FloatingCallout delay={52} side="right" style={{ top: 420, right: -14 }}>
          {config.callouts[1]}
        </FloatingCallout>
        <FloatingCallout delay={70} side="left" style={{ bottom: 96, left: 20 }}>
          {config.callouts[2]}
        </FloatingCallout>
      </div>
    </SafeFrame>
  );
}
