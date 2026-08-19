// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { InstallPage } from "../src/pages/InstallPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

const REMOTE_APK_SHA256 = "2e68b78cda241796023e039069865e164a9839c15036c696308ca9b61f28cc67";
const REMOTE_CERT_SHA256 =
  "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D";
const REMOTE_DOWNLOAD_URL = "https://downloads.zoption.site/zoption-beta-0.2.0.apk";

function remoteMetadata(overrides: Record<string, unknown> = {}) {
  return {
    version: "0.2.0",
    versionCode: 20202,
    downloadUrl: REMOTE_DOWNLOAD_URL,
    sha256: REMOTE_APK_SHA256,
    certificateSha256: REMOTE_CERT_SHA256,
    size: 66067723,
    releasedAt: "2026-08-18",
    minimumAndroidVersion: "Android 7.0 or newer (API 24+)",
    reinstallRequired: false,
    notes: ["Remote note: the metadata came from R2."],
    ...overrides,
  };
}

function stubFetchJson(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

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
  // Default: the R2 metadata endpoint is unreachable. The page must show the
  // safe download-unavailable state and never offer a fallback artifact.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failure")));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "userAgent");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Android APK download page", () => {
  it("publishes the exact official artifact facts and honest distribution boundaries", async () => {
    stubFetchJson(remoteMetadata());
    renderInstallPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Download Zoption Beta for Android." }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        REMOTE_DOWNLOAD_URL,
      ),
    );
    expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
      "download",
      "zoption-beta-0.2.0.apk",
    );
    expect(screen.getByText("0.2.0")).toBeInTheDocument();
    expect(screen.getByText("66,067,723 bytes (63.01 MiB)")).toBeInTheDocument();
    expect(screen.getByText("August 18, 2026")).toBeInTheDocument();
    expect(screen.getByText(REMOTE_APK_SHA256)).toBeInTheDocument();
    expect(screen.getByText(REMOTE_CERT_SHA256)).toBeInTheDocument();
    expect(screen.getByText(/not distributed through Google Play/i)).toBeInTheDocument();
    expect(
      screen.getByText(/This build can check for updates inside the app/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Do not disable Play Protect/i)).toBeInTheDocument();
    expect(screen.getByText(/offline-first with a connected sync/i)).toBeInTheDocument();
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
    stubFetchJson(remoteMetadata());
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
    stubFetchJson(remoteMetadata());
    renderInstallPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(REMOTE_APK_SHA256),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Checksum copied to the clipboard.");
  });

  it("provides a selectable-text fallback when clipboard access fails", async () => {
    stubFetchJson(remoteMetadata());
    setNavigatorValue("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    renderInstallPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Select the checksum text instead/i),
    );
  });
});

describe("R2 remote release metadata", () => {
  it("renders validated remote metadata once latest.json loads", async () => {
    stubFetchJson(remoteMetadata());
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        REMOTE_DOWNLOAD_URL,
      ),
    );
    expect(screen.getByText("0.2.0")).toBeInTheDocument();
  });

  it("shows a loading state before the metadata settles and offers no download", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<never>(() => undefined)));
    renderInstallPage();

    expect(screen.getByText(/Loading the latest Beta download/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download Android APK" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download APK" })).not.toBeInTheDocument();
  });

  it.each([
    [
      "the metadata request fails",
      () => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down"))),
    ],
    ["the remote shape is malformed", () => stubFetchJson({ version: 42 })],
    [
      "the download host is wrong",
      () => stubFetchJson(remoteMetadata({ downloadUrl: "https://zoption.site/zoption-beta-0.2.0.apk" })),
    ],
    ["the APK checksum is invalid", () => stubFetchJson(remoteMetadata({ sha256: "deadbeef" }))],
    [
      "the certificate fingerprint is invalid",
      () => stubFetchJson(remoteMetadata({ certificateSha256: "GG:00:00" })),
    ],
  ])(
    "shows the temporary-unavailable state with no download link when %s",
    async (_label, arrange) => {
      arrange();
      renderInstallPage();

      await waitFor(() =>
        expect(
          screen.getByText(/Android Beta download temporarily unavailable/i),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByRole("link", { name: "Download Android APK" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Download APK" })).not.toBeInTheDocument();
    },
  );
});
