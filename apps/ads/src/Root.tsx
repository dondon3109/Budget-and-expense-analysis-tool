import { Composition } from "remotion";

import { FeatureHighlight } from "./compositions/FeatureHighlight";
import { CombinedStory } from "./compositions/CombinedStory";
import { ProblemToSolution } from "./compositions/ProblemToSolution";
import { ProductShowcase } from "./compositions/ProductShowcase";
import {
  featureHighlightConfig,
  combinedStoryConfig,
  problemSolutionConfig,
  productShowcaseConfig,
} from "./config/adData";
import { VIDEO } from "./config/types";

/*
 * THESIS: Money becomes understandable when scattered records resolve into one monthly picture.
 * OWN-WORLD: Warm paper, deep forest ink, sage motion fields, editorial headlines, precise app UI.
 * STORY: Gather records, reveal the month, ask by text or voice, then offer a free start.
 * FIRST VIEWPORT: One large hook inside social-safe bounds; brand remains recognizable at a glance.
 * FORM: Three short ads plus one 60-second product story in the established Zoption visual system.
 */
export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Zoption-Complete-Story-60s"
        component={CombinedStory}
        width={VIDEO.width}
        height={VIDEO.height}
        fps={VIDEO.fps}
        durationInFrames={combinedStoryConfig.durationSeconds * VIDEO.fps}
        defaultProps={{ config: combinedStoryConfig }}
      />
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
