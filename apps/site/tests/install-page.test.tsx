// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InstallPage } from "../src/views/InstallPage";

afterEach(() => {
  cleanup();
});

describe("InstallPage", () => {
  it("says the Android app is coming to Google Play and sends visitors to the web app", () => {
    const { container } = render(<InstallPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: /coming to Google Play/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use Zoption on the web" })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/app$/),
    );
  });

  it("offers no APK download", () => {
    const { container } = render(<InstallPage />);

    expect(container.querySelector("a[download]")).toBeNull();
    expect(container.querySelector('a[href*=".apk"]')).toBeNull();
    expect(container.textContent).not.toMatch(/APK|sideload|unknown apps/i);
  });
});
