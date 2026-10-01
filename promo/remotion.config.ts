import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
// Software GL so three.js renders on machines without a GPU (CI, cloud containers).
Config.setChromiumOpenGlRenderer("swangle");
if (process.env.CHROME_PATH) Config.setBrowserExecutable(process.env.CHROME_PATH);
