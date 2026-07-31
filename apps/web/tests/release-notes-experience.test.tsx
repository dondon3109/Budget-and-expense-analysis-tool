// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ loading: false, user: { id: "user-1" } }),
}));
vi.mock("../src/consent/CookieConsentProvider", () => ({
  useCookieConsent: () => ({ hasDecision: true }),
}));
vi.mock("../src/theme/ThemeProvider", () => ({
  useTheme: () => ({ hasThemePreference: true }),
}));

import { ReleaseNotesExperience } from "../src/components/releases/ReleaseNotesExperience";

function renderExperience(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ReleaseNotesExperience />
    </MemoryRouter>,
  );
}

describe("ReleaseNotesExperience", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    document.body.style.overflow = "";
  });

  it("defers release notes while post-auth checkout is active", () => {
    renderExperience("/app?proCheckout=open");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows release notes when no checkout intent is active", () => {
    renderExperience("/app");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
