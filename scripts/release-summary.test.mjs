import { describe, expect, it } from "vitest";

import { isBotAuthor, ownedPaths, parseCodeowners, pullRequestNumber } from "./release-summary.mjs";

const matchers = parseCodeowners(`
# a comment
/.github/ @owner
/db/ @owner
/apps/api/wrangler*.jsonc @owner
/apps/api/src/auth.ts @owner # trailing comment
AGENTS.md @owner
/apps/api/src/unowned/
`);

describe("ownedPaths", () => {
  it("matches directories, globs, files, and unanchored names", () => {
    const paths = [
      ".github/workflows/ci.yml",
      "db/migrations/0073_x.sql",
      "apps/api/wrangler.deploy.jsonc",
      "apps/api/src/auth.ts",
      "apps/web/AGENTS.md",
      "AGENTS.md",
    ];
    expect(ownedPaths(matchers, paths)).toEqual(paths);
  });

  it("leaves everything else, including near misses and ownerless patterns, unowned", () => {
    expect(
      ownedPaths(matchers, [
        "package.json",
        "pnpm-lock.yaml",
        "apps/api/src/auth.test.ts",
        "apps/api/src/authx.ts",
        "apps/api/wrangler/readme.md",
        "docs/db/notes.md",
        "apps/api/src/unowned/file.ts",
      ]),
    ).toEqual([]);
  });
});

describe("commit helpers", () => {
  it("recognises Dependabot and GitHub App authors", () => {
    expect(
      isBotAuthor("dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"),
    ).toBe(true);
    expect(
      isBotAuthor("github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com"),
    ).toBe(true);
    expect(isBotAuthor("Don", "donestrera3109@gmail.com")).toBe(false);
  });

  it("reads the pull request number from a squash subject", () => {
    expect(pullRequestNumber("style: design refresh (#219)")).toBe("219");
    expect(pullRequestNumber("fix: no number")).toBeNull();
  });
});
