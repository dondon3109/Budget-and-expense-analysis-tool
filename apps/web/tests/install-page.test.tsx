// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { InstallPage } from "../src/pages/InstallPage";
import { ANDROID_RELEASE } from "../src/releases/androidRelease";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function setNavigatorValue(name: string, value: unknown) {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

function renderInstallPage() {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter>
          <InstallPage />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: light)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  setNavigatorValue(
    "userAgent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0.0.0 Safari/537.36",
  );
  setNavigatorValue("clipboard", { writeText: vi.fn().mockResolvedValue(undefined) });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "userAgent");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Android APK download page", () => {
  it("publishes the exact official artifact facts and honest distribution boundaries", async () => {
    renderInstallPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Download Zoption for Android." }),
    ).toBeInTheDocument();
    const primaryDownload = screen.getByRole("link", { name: "Download Android APK" });
    expect(primaryDownload).toHaveAttribute("href", ANDROID_RELEASE.downloadPath);
    expect(primaryDownload).toHaveAttribute("download", ANDROID_RELEASE.filename);
    expect(screen.getByText(ANDROID_RELEASE.sizeLabel)).toBeInTheDocument();
    expect(screen.getByText(ANDROID_RELEASE.releaseDateLabel)).toBeInTheDocument();
    expect(screen.getByText(ANDROID_RELEASE.sha256)).toBeInTheDocument();
    expect(screen.getByText(/not through Google Play/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Already installed\? This update restores the system status bar/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Do not disable Play Protect/i)).toBeInTheDocument();
    expect(screen.getByText(/online-first by design/i)).toBeInTheDocument();
    expect(screen.getAllByText(/same Zoption account/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Read the privacy policy" })).toHaveAttribute(
      "href",
      "/privacy-policy",
    );

    await waitFor(() =>
      expect(screen.getByText(/This APK runs only on Android/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Install directly from Google Chrome/i)).not.toBeInTheDocument();
  });

  it("shows Android-specific next-step guidance without automatically downloading", async () => {
    setNavigatorValue(
      "userAgent",
      "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
    );
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByText(/Android detected. Download the APK/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("link", { name: /Download/i })).not.toHaveLength(0);
  });

  it("copies the immutable SHA-256 checksum on request", async () => {
    renderInstallPage();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(ANDROID_RELEASE.sha256),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Checksum copied to the clipboard.");
  });

  it("provides a selectable-text fallback when clipboard access fails", async () => {
    setNavigatorValue("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    renderInstallPage();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Select the checksum text instead/i),
    );
  });
});
