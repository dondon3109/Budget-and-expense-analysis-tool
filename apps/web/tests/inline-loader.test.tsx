// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reduceMotion: false }));

vi.mock("../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionState.reduceMotion,
}));

import { InlineLoader } from "../src/components/layout/InlineLoader";

/** jsdom rewrites import.meta.url to an http URL, so resolve from the workspace. */
function readWorkspaceFile(relativePath: string): string {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), "apps/web", relativePath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  throw new Error(`Could not locate ${relativePath} from ${process.cwd()}`);
}

const inlineLoaderCss = readWorkspaceFile("src/components/layout/InlineLoader.css");
const fullPageCss = readWorkspaceFile("src/components/layout/FullPageLoadingStatus.css");
const ledgerLoaderCss = readWorkspaceFile("src/components/layout/LedgerLoader.css");

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Bodies of every rule whose selector list contains the exact selector. */
function ruleBodies(css: string, selector: string): string[] {
  return Array.from(stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((match) => (match[1] ?? "").split(",").some((part) => part.trim() === selector))
    .map((match) => match[2] ?? "");
}

describe("InlineLoader", () => {
  beforeEach(() => {
    motionState.reduceMotion = false;
  });

  afterEach(cleanup);

  it("renders with default label", () => {
    render(<InlineLoader />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<InlineLoader label="Preparing your financial plan" />);

    expect(screen.getByText("Preparing your financial plan…")).toBeInTheDocument();
  });

  it("marks its animation static for reduced-motion preferences", () => {
    motionState.reduceMotion = true;
    render(<InlineLoader label="Fetching transactions" />);

    const loader = screen.getByRole("status").querySelector(".ledger-loader");
    expect(loader).toHaveAttribute("data-size", "small");
    expect(loader).toHaveAttribute("data-reduced-motion");
    expect(screen.getByText("Fetching transactions…")).toBeInTheDocument();
  });
});

describe("loading surface craft floor", () => {
  it("never pulses the loader label text", () => {
    const source = stripComments(inlineLoaderCss);
    expect(source).not.toContain("inline-pulse-text");

    const bodies = ruleBodies(inlineLoaderCss, ".inline-loader-label");
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toMatch(/animation\s*:/);
      expect(body).not.toMatch(/opacity\s*:/);
    }
  });

  it("keeps every loading surface flat instead of gradient-washed", () => {
    for (const css of [inlineLoaderCss, fullPageCss, ledgerLoaderCss]) {
      expect(stripComments(css)).not.toMatch(/gradient\(/);
    }
  });

  it("uses no bounce easing on the loading surfaces", () => {
    for (const css of [fullPageCss, ledgerLoaderCss]) {
      expect(stripComments(css)).not.toContain("cubic-bezier(0.34, 1.56, 0.64, 1)");
    }
  });

  it("sweeps the ledger with transform only, so it never triggers layout", () => {
    const sweep = stripComments(ledgerLoaderCss).match(
      /@keyframes ledger-sweep\s*\{([\s\S]*?)\n\}/,
    );
    expect(sweep?.[1]).toBeDefined();
    const properties = Array.from((sweep?.[1] ?? "").matchAll(/([a-z-]+)\s*:/g), (m) => m[1]);
    expect(new Set(properties)).toEqual(new Set(["transform"]));
  });
});
