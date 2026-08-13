import { Composition } from "remotion";

import { FeatureHighlight } from "./compositions/FeatureHighlight";
import { ProblemToSolution } from "./compositions/ProblemToSolution";
import { ProductShowcase } from "./compositions/ProductShowcase";
import {
  featureHighlightConfig,
  problemSolutionConfig,
  productShowcaseConfig,
} from "./config/adData";
import { VIDEO } from "./config/types";

/*
 * THESIS: Money becomes understandable when scattered records resolve into one monthly picture.
 * OWN-WORLD: Warm paper, deep forest ink, sage motion fields, editorial headlines, precise app UI.
 * STORY: Name the friction, demonstrate Zoption working, then offer a low-friction free start.
 * FIRST VIEWPORT: One large hook inside social-safe bounds; brand remains recognizable at a glance.
 * FORM: Three fast, sound-off vertical narratives built from the established Zoption visual system.
 */
export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Zoption-Feature-Highlight"
        component={FeatureHighlight}
        width={VIDEO.width}
        height={VIDEO.height}
        fps={VIDEO.fps}
        durationInFrames={featureHighlightConfig.durationSeconds * VIDEO.fps}
        defaultProps={{ config: featureHighlightConfig }}
      />
      <Composition
        id="Zoption-Problem-To-Solution"
        component={ProblemToSolution}
        width={VIDEO.width}
        height={VIDEO.height}
        fps={VIDEO.fps}
        durationInFrames={problemSolutionConfig.durationSeconds * VIDEO.fps}
        defaultProps={{ config: problemSolutionConfig }}
      />
      <Composition
        id="Zoption-Product-Showcase"
        component={ProductShowcase}
        width={VIDEO.width}
        height={VIDEO.height}
        fps={VIDEO.fps}
        durationInFrames={productShowcaseConfig.durationSeconds * VIDEO.fps}
        defaultProps={{ config: productShowcaseConfig }}
      />
    </>
  );
}
