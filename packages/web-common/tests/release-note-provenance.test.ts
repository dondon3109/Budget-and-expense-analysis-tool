import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { releaseHistory } from "../src/releases/currentRelease";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Every semantic-release tag, so a note can be checked against what actually shipped. */
function taggedVersions(): Set<string> {
  const tags = execFileSync("git", ["-C", REPO_ROOT, "tag", "--list", "v*"], { encoding: "utf8" });
  return new Set(
    tags
      .split("\n")
      .map((tag) => tag.trim().replace(/^v/, ""))
      .filter((version) => /^\d+\.\d+\.\d+$/.test(version)),
  );
}

/** The day a tag was created, in the same "Month D, YYYY" form the notes use. */
function releasedOn(version: string): string | null {
  const iso = execFileSync(
    "git",
    ["-C", REPO_ROOT, "log", "-1", "--format=%ad", "--date=short", `v${version}`],
    { encoding: "utf8" },
  ).trim();
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`;
}

describe("release note provenance", () => {
  it("names a version that was actually released", () => {
    const tagged = taggedVersions();
    const unknown = releaseHistory
      .slice(1)
      .map((entry) => entry.version)
      .filter((version) => !tagged.has(version));

    expect(
      unknown,
      "These release notes name versions with no matching git tag. A tag is only fetched with " +
        "`git fetch --tags`; if the version really did ship, tag it, otherwise correct the label.",
    ).toEqual([]);
  });

  it("dates every historical entry to the day its version shipped", () => {
    const mismatched: string[] = [];

    for (const entry of releaseHistory.slice(1)) {
      const shipped = releasedOn(entry.version);
      if (shipped === null) continue;
      if (entry.releasedOn !== shipped) {
        mismatched.push(`${entry.version}: notes say ${entry.releasedOn}, tag says ${shipped}`);
      }
    }

    expect(
      mismatched,
      "A patch note entry drifted from the release that carried it. Set releasedOn to the tag's date.",
    ).toEqual([]);
  });

  it("lists versions newest first", () => {
    const seen = releaseHistory.slice(1).map((entry) => entry.version);
    const sorted = [...seen].sort((a, b) => {
      const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
      const [bMajor, bMinor, bPatch] = b.split(".").map(Number);
      return (
        (bMajor ?? 0) - (aMajor ?? 0) ||
        (bMinor ?? 0) - (aMinor ?? 0) ||
        (bPatch ?? 0) - (aPatch ?? 0)
      );
    });

    expect(seen, "Release history is read newest first; keep the array in that order.").toEqual(
      sorted,
    );
  });
});
