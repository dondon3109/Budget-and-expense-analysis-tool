const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Expo's default leaves inlineRequires off, which evaluates every module
// reachable from the entry before the first frame draws. Inlining moves each
// require to its point of use, so a cold start only evaluates what the first
// screen touches. A bare side-effect import stays eager only when the file
// has no named import of the same module; Metro merges the two and inlines
// the result. See the inlineRequires note in AGENTS.md.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

module.exports = withNativeWind(config, { input: "./src/styles/global.css" });
