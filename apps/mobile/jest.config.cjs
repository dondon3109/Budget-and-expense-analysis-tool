const path = require("path");

let uuidCjs;
try {
  const uuidPkg = require.resolve("uuid/package.json", {
    paths: [require.resolve("@expo/config-plugins")],
  });
  uuidCjs = path.join(path.dirname(uuidPkg), "dist/cjs/index.js");
} catch {
  // fallback if not resolvable
}

module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    ...(uuidCjs ? { "^uuid$": uuidCjs } : {}),
    "^react$": "<rootDir>/node_modules/react",
    "^react/(.*)$": "<rootDir>/node_modules/react/$1",
  },
  testMatch: [
    "<rootDir>/src/**/*.test.ts",
    "<rootDir>/src/**/*.test.tsx",
    "<rootDir>/plugins/**/*.test.js",
  ],
};
