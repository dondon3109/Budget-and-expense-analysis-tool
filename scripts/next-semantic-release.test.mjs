import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { semanticReleaseOutputs, writeSemanticReleaseOutputs } from "./next-semantic-release.mjs";

describe("semantic-release workflow outputs", () => {
  it("skips deployment when no release is needed", async () => {
    expect(semanticReleaseOutputs(false)).toEqual({ releaseNeeded: false });
  });

  it("exposes the established semantic-release result", async () => {
    expect(semanticReleaseOutputs({ nextRelease: { type: "minor", version: "2.3.0" } })).toEqual({
      releaseNeeded: true,
      type: "minor",
      version: "2.3.0",
    });
  });

  it("writes GitHub Actions outputs without release notes", async () => {
    const outputPath = join(tmpdir(), `zoption-release-output-${randomUUID()}`);
    await writeFile(outputPath, "");
    await writeSemanticReleaseOutputs(
      { nextRelease: { type: "patch", version: "2.2.2" } },
      outputPath,
    );
    await expect(readFile(outputPath, "utf8")).resolves.toBe(
      "release_needed=true\ntype=patch\nversion=2.2.2\n",
    );
  });
});
