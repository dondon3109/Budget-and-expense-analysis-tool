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
import { ProblemCluster, ProductPreview } from "../components/ProductPreview";
import type { ProblemSolutionConfig } from "../config/types";
import { easeOut, springIn, stagger } from "../motion";

export function ProblemToSolution({ config }: { config: ProblemSolutionConfig }) {
  return (
    <AdCanvas theme={config.theme}>
      <PersistentHeader />

      <Sequence from={0} durationInFrames={112}>
        <Scene duration={112} fadeIn={0} fadeOut={18}>
          <SafeFrame className="problem-scene">
            <div className="problem-copy">
              <Kicker>THE PROBLEM</Kicker>
              <BigHeadline delay={2}>{config.headline}</BigHeadline>
            </div>
            <ProblemCluster lines={config.problemLines} />
          </SafeFrame>
        </Scene>
      </Sequence>

      <Sequence from={92} durationInFrames={130}>
        <Scene duration={130} className="solution-reveal-scene" fadeOut={18}>
          <SafeFrame className="solution-reveal-frame">
            <div className="solution-word">Zoption</div>
            <Caption delay={6}>{config.subtext}</Caption>
            <ProductPreview asset={config.asset} compact variant="budget" />
          </SafeFrame>
        </Scene>
      </Sequence>

      <Sequence from={202} durationInFrames={150}>
        <Scene duration={150} className="steps-scene" fadeOut={18}>
          <SolutionSteps config={config} />
        </Scene>
      </Sequence>

      <Sequence from={334} durationInFrames={116}>
        <Scene duration={116} fadeOut={0} className="cta-sequence">
          <CallToAction
            dark
            headline="Clarity starts with one month."
            subtext="Track without connecting your bank."
            cta={config.cta}
            url={config.url}
          />
        </Scene>
      </Sequence>
    </AdCanvas>
  );
}

function SolutionSteps({ config }: { config: ProblemSolutionConfig }) {
  const frame = useCurrentFrame();
  return (
    <SafeFrame className="steps-frame">
      <Kicker>{config.eyebrow}</Kicker>
      <h2>
        From records
        <br />
        to real visibility.
      </h2>
      <div className="solution-step-list">
        {config.solutionSteps.map((step, index) => {
          const progress = springIn(frame, 30, 15 + stagger(index, 13));
          return (
            <div
              className="solution-step"
              key={step}
              style={{ opacity: progress, transform: `translateX(${70 * (1 - progress)}px)` }}
            >
              <span>{index + 1}</span>
              <strong>{step}</strong>
              <i style={{ transform: `scaleX(${easeOut(frame, 30 + stagger(index, 13), 18)})` }} />
            </div>
          );
        })}
      </div>
      <p className="illustration-note">Illustrative product data</p>
    </SafeFrame>
  );
}
