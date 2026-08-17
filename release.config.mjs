const conventionalCommits = {
  preset: "conventionalcommits",
  parserOpts: {
    noteKeywords: ["BREAKING CHANGE", "BREAKING CHANGES"],
  },
};

export default {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        ...conventionalCommits,
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "docs", release: false },
          { type: "test", release: false },
          { type: "chore", release: false },
          { type: "refactor", release: false },
          { type: "style", release: false },
          { type: "ci", release: false },
          { type: "build", release: false },
          { type: "perf", release: false },
          { type: "revert", release: false },
        ],
      },
    ],
    ["@semantic-release/release-notes-generator", conventionalCommits],
    [
      "@semantic-release/github",
      {
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
  ],
};
