import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { BrandLockup } from "../components/Brand";
import { CallToAction } from "../components/CallToAction";
import { AdCanvas, BigHeadline, Caption, Kicker, SafeFrame, Scene } from "../components/Layout";
import { FloatingCallout, ProblemCluster, ProductPreview } from "../components/ProductPreview";
import type { CombinedStoryConfig } from "../config/types";
import { clamp, easeOut, springIn, stagger } from "../motion";

export function CombinedStory({ config }: { config: CombinedStoryConfig }) {
  return (
    <AdCanvas theme={config.theme}>
      <CombinedHeader chapters={config.chapters} />

      <Sequence from={0} durationInFrames={170}>
        <Scene duration={170} fadeIn={0} fadeOut={22} className="combined-intro-scene">
          <CombinedIntro config={config} />
        </Scene>
      </Sequence>

      <Sequence from={140} durationInFrames={200}>
        <Scene duration={200} fadeOut={22} className="combined-problem-scene">
          <CombinedProblem />
        </Scene>
      </Sequence>

      <Sequence from={310} durationInFrames={330}>
        <Scene duration={330} fadeOut={24} className="combined-feature-scene import-story-scene">
          <ImportStory config={config} />
        </Scene>
      </Sequence>

      <Sequence from={610} durationInFrames={240}>
        <Scene duration={240} fadeOut={24} className="combined-feature-scene dashboard-story-scene">
          <DashboardStory config={config} />
        </Scene>
      </Sequence>

      <Sequence from={820} durationInFrames={310}>
        <Scene duration={310} fadeOut={24} className="combined-feature-scene assistant-story-scene">
          <AssistantStory config={config} />
        </Scene>
      </Sequence>

      <Sequence from={1100} durationInFrames={400}>
        <Scene duration={400} fadeOut={24} className="combined-feature-scene voice-story-scene">
          <VoiceStory config={config} />
        </Scene>
      </Sequence>

      <Sequence from={1470} durationInFrames={220}>
        <Scene duration={220} fadeOut={22} className="combined-recap-scene">
          <FeatureRecap />
        </Scene>
      </Sequence>

      <Sequence from={1660} durationInFrames={140}>
        <Scene duration={140} fadeOut={0} className="cta-sequence combined-cta">
          <CallToAction
            dark
            headline="Understand your money. Ask what comes next."
            subtext="Import, track, budget, and use the read-only assistant by text or voice."
            cta={config.cta}
            url={config.url}
          />
        </Scene>
      </Sequence>
    </AdCanvas>
  );
}

function CombinedHeader({ chapters }: { chapters: CombinedStoryConfig["chapters"] }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const visible = Math.min(
    easeOut(frame, 116, 16),
    interpolate(frame, [1640, 1670], [1, 0], clamp),
  );
  const chapter =
    frame < 610
      ? chapters[0]
      : frame < 820
        ? chapters[1]
        : frame < 1100
          ? chapters[2]
          : chapters[3];
  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 100], clamp);

  return (
    <div className="combined-header" style={{ opacity: visible }}>
      <BrandLockup size={45} wordmarkSize={25} />
      <span className="combined-chapter">{chapter}</span>
      <span className="combined-time">{Math.min(60, Math.floor(frame / 30) + 1)} / 60</span>
      <i>
        <b style={{ width: `${progress}%` }} />
      </i>
    </div>
  );
}

function CombinedIntro({ config }: { config: CombinedStoryConfig }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = springIn(frame, fps, 0);
  const title = easeOut(frame, 12, 24);
  const underline = interpolate(frame, [38, 72], [0, 100], clamp);
  return (
    <SafeFrame className="combined-intro-frame">
      <div
        className="combined-intro-orbit"
        style={{ transform: `scale(${0.65 + brand * 0.7})`, opacity: 1 - brand * 0.48 }}
      />
      <BrandLockup
        inverse
        size={84}
        wordmarkSize={48}
        style={{ opacity: brand, transform: `translateY(${28 * (1 - brand)}px)` }}
      />
      <h1 style={{ opacity: title, transform: `translateY(${45 * (1 - title)}px)` }}>
        {config.headline}
      </h1>
      <p style={{ opacity: easeOut(frame, 28, 20) }}>{config.subtext}</p>
      <div className="combined-intro-line">
        <span style={{ width: `${underline}%` }} />
      </div>
      <small>One minute with Zoption</small>
    </SafeFrame>
  );
}

function CombinedProblem() {
  return (
    <SafeFrame className="combined-problem-frame">
      <div className="combined-problem-copy">
        <Kicker>MONEY GETS SCATTERED</Kicker>
        <BigHeadline delay={3}>Statements. Receipts. Budgets in your head.</BigHeadline>
        <Caption delay={16}>The useful picture is there. It just needs bringing together.</Caption>
      </div>
      <div className="combined-problem-cluster">
        <ProblemCluster lines={["Statements", "Daily expenses", "No monthly picture"]} />
      </div>
    </SafeFrame>
  );
}

function ImportStory({ config }: { config: CombinedStoryConfig }) {
  const frame = useCurrentFrame();
  return (
    <SafeFrame className="combined-product-frame">
      <StoryHeading
        kicker="BRING IT TOGETHER"
        headline="Import without the blind leap."
        body="Choose a CSV or Excel file, match its columns, and preview every row before saving."
      />
      <div className="combined-product-wrap import-product-wrap">
        <ProductPreview asset={config.asset} variant="import" />
        {config.importSteps.map((step, index) => {
          const progress = springIn(frame, 30, 38 + stagger(index, 22));
          return (
            <div
              key={step}
              className={`story-step-chip story-step-${index + 1}`}
              style={{
                opacity: progress,
                transform: `translateY(${30 * (1 - progress)}px) scale(${0.92 + progress * 0.08})`,
              }}
            >
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          );
        })}
      </div>
    </SafeFrame>
  );
}

function DashboardStory({ config }: { config: CombinedStoryConfig }) {
  return (
    <SafeFrame className="combined-product-frame">
      <StoryHeading
        kicker="SEE THE MONTH"
        headline="From rows to a clearer picture."
        body="Expenses, cash flow, category budgets, and what is still available—together."
      />
      <div className="combined-product-wrap dashboard-product-wrap">
        <ProductPreview asset={config.asset} variant="dashboard" />
        <FloatingCallout delay={32} side="left" style={{ top: 150, left: -20 }}>
          Expenses in context
        </FloatingCallout>
        <FloatingCallout delay={55} side="right" style={{ top: 430, right: -14 }}>
          Budget visibility
        </FloatingCallout>
        <FloatingCallout delay={78} side="left" style={{ bottom: 72, left: 22 }}>
          Trends you can follow
        </FloatingCallout>
      </div>
    </SafeFrame>
  );
}

function AssistantStory({ config }: { config: CombinedStoryConfig }) {
  const frame = useCurrentFrame();
  return (
    <SafeFrame className="combined-product-frame assistant-story-frame">
      <StoryHeading
        kicker="ASK YOUR FINANCES"
        headline="A read-only AI assistant, grounded in your workspace."
        body="Ask about recorded expenses, budgets, trends, recurring costs, goals, and planning results."
      />
      <div className="assistant-prompt-stack">
        {config.assistantPrompts.map((prompt, index) => {
          const progress = springIn(frame, 30, 14 + stagger(index, 16));
          return (
            <div
              key={prompt}
              style={{ opacity: progress, transform: `translateX(${55 * (1 - progress)}px)` }}
            >
              <span>Ask</span>
              {prompt}
            </div>
          );
        })}
      </div>
      <div className="combined-product-wrap assistant-product-wrap">
        <ProductPreview asset={config.asset} variant="assistant" />
        <div className="readonly-seal" style={{ opacity: easeOut(frame, 78, 18) }}>
          <span>✓</span>
          <div>
            <strong>Read only</strong>
            <small>Explains. Never edits your records.</small>
          </div>
        </div>
      </div>
    </SafeFrame>
  );
}

function VoiceStory({ config }: { config: CombinedStoryConfig }) {
  const frame = useCurrentFrame();
  return (
    <SafeFrame className="combined-product-frame voice-story-frame">
      <StoryHeading
        kicker="VOICE MODE"
        headline="When typing slows you down, just ask."
        body="With your permission, Zoption transcribes your question and can answer in a voice you choose."
      />
      <div className="voice-benefit-row">
        {config.voiceBenefits.map((benefit, index) => {
          const progress = springIn(frame, 30, 12 + stagger(index, 15));
          return (
            <span
              key={benefit}
              style={{ opacity: progress, transform: `translateY(${22 * (1 - progress)}px)` }}
            >
              <b>{index + 1}</b>
              {benefit}
            </span>
          );
        })}
      </div>
      <div className="combined-product-wrap voice-product-wrap">
        <ProductPreview asset={config.asset} variant="voice" />
        <div
          className="voice-focal-ring"
          style={{
            opacity: 0.24 + Math.abs(Math.sin(frame / 12)) * 0.32,
            transform: `scale(${0.9 + Math.abs(Math.sin(frame / 12)) * 0.2})`,
          }}
        />
      </div>
    </SafeFrame>
  );
}

function FeatureRecap() {
  const frame = useCurrentFrame();
  const features = ["Import", "Track", "Budget", "Understand", "Ask", "Speak"];
  return (
    <AbsoluteFill className="feature-recap">
      <SafeFrame className="feature-recap-frame">
        <Kicker>ONE PRIVATE WORKSPACE</Kicker>
        <h2>
          More than tracking.
          <br />A clearer way to decide what comes next.
        </h2>
        <div className="feature-recap-ribbon">
          {features.map((feature, index) => {
            const progress = springIn(frame, 30, 18 + stagger(index, 9));
            return (
              <span
                key={feature}
                style={{ opacity: progress, transform: `translateY(${35 * (1 - progress)}px)` }}
              >
                {feature}
                <b>→</b>
              </span>
            );
          })}
        </div>
        <div className="feature-recap-proof" style={{ opacity: easeOut(frame, 82, 20) }}>
          <strong>Private by design</strong>
          <span>Free plan available</span>
          <span>No bank connection required</span>
        </div>
      </SafeFrame>
    </AbsoluteFill>
  );
}

function StoryHeading({
  kicker,
  headline,
  body,
}: {
  kicker: string;
  headline: string;
  body: string;
}) {
  return (
    <div className="story-heading">
      <Kicker>{kicker}</Kicker>
      <h2>{headline}</h2>
      <Caption delay={8}>{body}</Caption>
    </div>
  );
}
