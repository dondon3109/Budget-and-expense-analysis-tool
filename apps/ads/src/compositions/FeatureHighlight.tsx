import { Sequence, useCurrentFrame } from "remotion";

import { CallToAction } from "../components/CallToAction";
import {
  AdCanvas,
  BigHeadline,
  Caption,
  Kicker,
  PersistentHeader,
  SafeFrame,
  Scene,
} from "../components/Layout";
import { FloatingCallout, ProductPreview } from "../components/ProductPreview";
import type { FeatureHighlightConfig } from "../config/types";
import { easeOut } from "../motion";

export function FeatureHighlight({ config }: { config: FeatureHighlightConfig }) {
  return (
    <AdCanvas theme={config.theme}>
      <PersistentHeader />

      <Sequence from={0} durationInFrames={88}>
        <Scene duration={88} fadeIn={0}>
          <SafeFrame className="hook-scene">
            <Kicker>{config.eyebrow}</Kicker>
            <BigHeadline delay={3}>{config.headline}</BigHeadline>
            <Caption delay={14}>{config.subtext}</Caption>
          </SafeFrame>
        </Scene>
      </Sequence>

      <Sequence from={68} durationInFrames={235}>
        <Scene duration={235} className="feature-product-scene" fadeOut={22}>
          <FeatureProduct config={config} />
        </Scene>
      </Sequence>

      <Sequence from={278} durationInFrames={112}>
        <Scene duration={112} fadeOut={0} className="cta-sequence">
          <CallToAction
            headline="Make the month make sense."
            subtext="Start with the records you choose to add."
            cta={config.cta}
            url={config.url}
          />
        </Scene>
      </Sequence>
    </AdCanvas>
  );
}

function FeatureProduct({ config }: { config: FeatureHighlightConfig }) {
  const frame = useCurrentFrame();
  const title = easeOut(frame, 5, 16);
  return (
    <SafeFrame className="product-scene-frame">
      <div
        className="scene-copy compact-scene-copy"
        style={{ opacity: title, transform: `translateY(${20 * (1 - title)}px)` }}
      >
        <Kicker>{config.eyebrow}</Kicker>
        <h2>
          One monthly picture.
          <br />
          No guesswork.
        </h2>
      </div>
      <div className="product-stage-wrap">
        <ProductPreview asset={config.asset} />
        <FloatingCallout delay={24} side="left" style={{ top: 180, left: -12 }}>
          {config.featureLabels[0]}
        </FloatingCallout>
        <FloatingCallout delay={42} side="right" style={{ top: 450, right: -8 }}>
          {config.featureLabels[1]}
        </FloatingCallout>
        <FloatingCallout delay={60} side="left" style={{ bottom: 90, left: 36 }}>
          {config.featureLabels[2]}
        </FloatingCallout>
      </div>
    </SafeFrame>
  );
}
