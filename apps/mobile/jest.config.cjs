module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^react$": "<rootDir>/node_modules/react",
    "^react/(.*)$": "<rootDir>/node_modules/react/$1",
  },
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
};
