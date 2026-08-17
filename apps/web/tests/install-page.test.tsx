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
  // Default: the R2 metadata endpoint is unreachable. The page must keep
  // rendering the trusted build-time fallback without crashing.
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
    renderInstallPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Download Zoption Beta for Android." }),
    ).toBeInTheDocument();
    const primaryDownload = screen.getByRole("link", { name: "Download Android APK" });
    expect(primaryDownload).toHaveAttribute("href", ANDROID_RELEASE.downloadPath);
    expect(primaryDownload).toHaveAttribute("download", ANDROID_RELEASE.filename);
    expect(screen.getByText(ANDROID_RELEASE.sizeLabel)).toBeInTheDocument();
    expect(screen.getByText(ANDROID_RELEASE.releaseDateLabel)).toBeInTheDocument();
    expect(screen.getByText(ANDROID_RELEASE.sha256)).toBeInTheDocument();
    expect(screen.getByText(/not distributed through Google Play/i)).toBeInTheDocument();
    expect(
      screen.getByText(/must be uninstalled before installing the beta/i),
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

const REMOTE_APK_SHA256 = "2e68b78cda241796023e039069865e164a9839c15036c696308ca9b61f28cc67";
const REMOTE_CERT_SHA256 =
  "F9:46:70:EB:94:11:F3:DA:68:3A:13:33:DD:7F:6C:69:58:B0:08:3C:CE:C4:7E:75:89:4C:38:DB:C6:A5:A5:8D";

function remoteMetadata(overrides: Record<string, unknown> = {}) {
  return {
    version: "0.2.0",
    versionCode: 20202,
    downloadUrl: "https://downloads.zoption.site/zoption-beta-0.2.0.apk",
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

describe("R2 remote release metadata", () => {
  it("renders validated remote metadata instead of the build-time snapshot", async () => {
    stubFetchJson(remoteMetadata());
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        "https://downloads.zoption.site/zoption-beta-0.2.0.apk",
      ),
    );
    expect(screen.getByText("0.2.0")).toBeInTheDocument();
    expect(screen.getByText(/Remote note: the metadata came from R2/)).toBeInTheDocument();
    expect(screen.getByText(/66,067,723 bytes/)).toBeInTheDocument();
  });

  it("keeps the build-time fallback when the remote shape is malformed", async () => {
    stubFetchJson({ version: 42 });
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        ANDROID_RELEASE.downloadPath,
      ),
    );
  });

  it("keeps the build-time fallback when the download host is wrong", async () => {
    stubFetchJson(
      remoteMetadata({
        downloadUrl: "https://zoption.site/zoption-beta-0.2.0.apk",
      }),
    );
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        ANDROID_RELEASE.downloadPath,
      ),
    );
  });

  it("keeps the build-time fallback when the APK checksum is invalid", async () => {
    stubFetchJson(remoteMetadata({ sha256: "deadbeef" }));
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        ANDROID_RELEASE.downloadPath,
      ),
    );
  });

  it("keeps the build-time fallback when the certificate fingerprint is invalid", async () => {
    stubFetchJson(remoteMetadata({ certificateSha256: "GG:00:00" }));
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        ANDROID_RELEASE.downloadPath,
      ),
    );
  });

  it("keeps the build-time fallback when the metadata request fails", async () => {
    // beforeEach already stubs a rejected fetch; re-assert the explicit case.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    renderInstallPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Download Android APK" })).toHaveAttribute(
        "href",
        ANDROID_RELEASE.downloadPath,
      ),
    );
    expect(screen.getByText(ANDROID_RELEASE.versionName)).toBeInTheDocument();
  });
});
