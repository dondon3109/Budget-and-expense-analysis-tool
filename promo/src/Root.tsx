import { Composition } from "remotion";
import { Promo } from "./Promo";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./timing";

export const Root = () => (
  <Composition id="ZoptionPromo" component={Promo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
);
