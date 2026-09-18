import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { auditSource } from "./a11y-source-audit.mjs";

/**
 * The scanner is a regression net for the app surfaces axe cannot reach yet, so it has to be
 * shown to fire. A scanner that silently stops matching is worse than none: it reads as "clean".
 * Each check below is pinned against a planted defect as well as a valid counterpart.
 */
function scanFixture(source) {
  const directory = mkdtempSync(join(tmpdir(), "zopt-a11y-"));
  try {
    writeFileSync(join(directory, "Fixture.tsx"), source, "utf8");
    return auditSource(directory).map((finding) => finding.check);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("a11y source audit", () => {
  it("finds no candidates in the real source tree", () => {
    expect(auditSource("apps/web/src")).toEqual([]);
  });

  it("flags an icon-only button and passes one with an aria-label", () => {
    expect(
      scanFixture(
        'export const A = () => <button type="button"><X aria-hidden="true" /></button>;',
      ),
    ).toEqual(["no-accessible-name"]);
    expect(
      scanFixture(
        'export const A = () => <button type="button" aria-label="Close"><X aria-hidden="true" /></button>;',
      ),
    ).toEqual([]);
  });

  it("counts a name nested inside a span", () => {
    // The first version of the scanner missed this and reported 33 false candidates on pages
    // axe had already cleared.
    expect(
      scanFixture(
        'export const A = () => <button type="button"><Mic aria-hidden="true" /><span>Voice Entry</span></button>;',
      ),
    ).toEqual([]);
  });

  it("stays quiet when a name comes from a variable it cannot resolve", () => {
    expect(
      scanFixture('export const A = ({ label }) => <button type="button">{label}</button>;'),
    ).toEqual([]);
  });

  it("flags an unlabelled control and passes a labelled or wrapped one", () => {
    expect(scanFixture('export const A = () => <input value="" onChange={() => {}} />;')).toEqual([
      "control-without-label",
    ]);
    expect(
      scanFixture(
        'export const A = () => <input aria-label="Search" value="" onChange={() => {}} />;',
      ),
    ).toEqual([]);
    expect(
      scanFixture(
        'export const A = () => <label>Name<input value="" onChange={() => {}} /></label>;',
      ),
    ).toEqual([]);
    expect(scanFixture('export const A = () => <input type="hidden" value="" />;')).toEqual([]);
  });

  it("flags focusable content inside an aria-hidden subtree", () => {
    expect(
      scanFixture(
        'export const A = () => <div aria-hidden="true"><button type="button">Hi</button></div>;',
      ),
    ).toEqual(["focusable-inside-aria-hidden"]);
    expect(
      scanFixture('export const A = () => <div aria-hidden="true"><span>Decorative</span></div>;'),
    ).toEqual([]);
  });

  it("flags a positive tabindex", () => {
    expect(scanFixture("export const A = () => <div tabIndex={2}>x</div>;")).toEqual([
      "positive-tabindex",
    ]);
    expect(scanFixture("export const A = () => <div tabIndex={-1}>x</div>;")).toEqual([]);
  });

  it("flags an image with no alt", () => {
    expect(scanFixture('export const A = () => <img src="/a.png" />;')).toEqual([
      "img-without-alt",
    ]);
    expect(scanFixture('export const A = () => <img src="/a.png" alt="" />;')).toEqual([]);
  });
});
