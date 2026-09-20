const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Expo's default leaves inlineRequires off, which evaluates every module
// reachable from the entry before the first frame draws. Inlining moves each
// require to its point of use, so a cold start only evaluates what the first
// screen touches. Side-effect imports (react-native-gesture-handler, the
// NativeWind stylesheet, the module-scope TaskManager.defineTask) stay eager
// because they have no binding to inline.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

module.exports = withNativeWind(config, { input: "./src/styles/global.css" });
