import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, easeOut, springIn } from "../motion";
import { BrandLockup } from "./Brand";

type CallToActionProps = {
  headline: string;
  subtext: string;
  cta: string;
  url: string;
  dark?: boolean;
};

export function CallToAction({ headline, subtext, cta, url, dark = false }: CallToActionProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const brand = easeOut(frame, 0, 12);
  const title = easeOut(frame, 7, 17);
  const button = springIn(frame, fps, 18);
  const pulse = interpolate(frame, [32, 42, 52], [1, 1.035, 1], {
    ...clamp,
  });
  const hold = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0.96], clamp);

  return (
    <div className={`cta-screen${dark ? " is-dark" : ""}`}>
      <BrandLockup
        inverse={dark}
        size={70}
        wordmarkSize={38}
        style={{ opacity: brand, transform: `translateY(${18 * (1 - brand)}px)` }}
      />
      <h2 style={{ opacity: title, transform: `translateY(${34 * (1 - title)}px)` }}>{headline}</h2>
      <p style={{ opacity: title }}>{subtext}</p>
      <div
        className="cta-button"
        style={{
          opacity: button,
          transform: `scale(${button * pulse * hold})`,
        }}
      >
        <span>{cta}</span>
        <b aria-hidden="true">→</b>
      </div>
      <span className="cta-url" style={{ opacity: easeOut(frame, 24, 14) }}>
        {url}
      </span>
      <small>Free plan available · No payment required</small>
    </div>
  );
}
