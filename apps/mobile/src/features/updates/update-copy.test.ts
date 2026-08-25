import {
  formatApkSize,
  formatDownloadProgress,
  normalizeReleaseNotes,
  reinstallRequiredMessage,
  updateAvailableMessage,
  verificationFailureMessage,
  checkFailureMessage,
} from "./update-copy";
import { installedApp, parsedRelease } from "./test-fixtures";

describe("update-copy", () => {
  describe("formatApkSize", () => {
    it("formats bytes into MiB with one decimal place", () => {
      expect(formatApkSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatApkSize(136.1 * 1024 * 1024)).toBe("136.1 MB");
    });
  });

  describe("formatDownloadProgress", () => {
    it("formats progress with total bytes", () => {
      expect(formatDownloadProgress(10 * 1024 * 1024, 100 * 1024 * 1024)).toBe(
        "Downloading 10.0 MB of 100.0 MB…",
      );
    });

    it("handles zero or unknown total bytes", () => {
      expect(formatDownloadProgress(5 * 1024 * 1024, 0)).toBe("Downloading 5.0 MB…");
    });
  });

  describe("normalizeReleaseNotes", () => {
    it("returns empty array for empty notes", () => {
      expect(normalizeReleaseNotes([])).toEqual([]);
      expect(normalizeReleaseNotes(["", "   "])).toEqual([]);
    });

    it("normalizes an array of separate bullet strings", () => {
      const input = [
        "• Added quick actions",
        "- Fixed budget calculation",
        "* Enhanced performance",
      ];
      expect(normalizeReleaseNotes(input)).toEqual([
        "Added quick actions",
        "Fixed budget calculation",
        "Enhanced performance",
      ]);
    });

    it("normalizes multi-line text into individual items", () => {
      const input = ["1. First change\n2. Second change\n• Third change"];
      expect(normalizeReleaseNotes(input)).toEqual([
        "First change",
        "Second change",
        "Third change",
      ]);
    });

    it("splits a single paragraph of multiple sentences into a list of changes", () => {
      const paragraph = [
        "Added a quick action bar to the mobile home dashboard for 1-tap transaction entry, receipt scanning, category budget reviews, and AI assistant queries. Added a recent activity card to the mobile home screen displaying the latest transactions with quick editor navigation. Added a structured 3-step onboarding guide to the mobile home screen for new workspaces. Added capability badges, interactive workspace preview, and value pillars to the mobile welcome landing screen. Redesigned the mobile home balance card with a monthly net momentum indicator and per-account breakdown. Updated the mobile home month summary to a 2x2 grid layout with semantic icon badges and high-contrast tone styling.",
      ];
      const result = normalizeReleaseNotes(paragraph);
      expect(result).toHaveLength(6);
      expect(result[0]).toBe(
        "Added a quick action bar to the mobile home dashboard for 1-tap transaction entry, receipt scanning, category budget reviews, and AI assistant queries.",
      );
      expect(result[1]).toBe(
        "Added a recent activity card to the mobile home screen displaying the latest transactions with quick editor navigation.",
      );
      expect(result[2]).toBe(
        "Added a structured 3-step onboarding guide to the mobile home screen for new workspaces.",
      );
      expect(result[3]).toBe(
        "Added capability badges, interactive workspace preview, and value pillars to the mobile welcome landing screen.",
      );
      expect(result[4]).toBe(
        "Redesigned the mobile home balance card with a monthly net momentum indicator and per-account breakdown.",
      );
      expect(result[5]).toBe(
        "Updated the mobile home month summary to a 2x2 grid layout with semantic icon badges and high-contrast tone styling.",
      );
    });

    it("does not incorrectly split sentences on decimal numbers or abbreviations", () => {
      const input = [
        "Improved support for Android 7.0 (API 24+) devices. Version 0.2.14 is now 136.1 MB.",
      ];
      const result = normalizeReleaseNotes(input);
      expect(result).toEqual([
        "Improved support for Android 7.0 (API 24+) devices.",
        "Version 0.2.14 is now 136.1 MB.",
      ]);
    });
  });

  describe("updateAvailableMessage", () => {
    it("formats update message with bullet points", () => {
      const installed = installedApp({ versionName: "0.2.12-beta" });
      const latest = parsedRelease({
        versionName: "0.2.14-beta",
        size: 136.1 * 1024 * 1024,
        notes: ["Added quick actions", "Fixed balance bug"],
      });
      const message = updateAvailableMessage(installed, latest);
      expect(message).toContain("You have 0.2.12-beta. Version 0.2.14-beta is 136.1 MB.");
      expect(message).toContain("• Added quick actions\n• Fixed balance bug");
    });
  });

  describe("reinstallRequiredMessage", () => {
    it("formats message clearly", () => {
      const latest = parsedRelease({ versionName: "0.3.0-beta" });
      const msg = reinstallRequiredMessage(latest);
      expect(msg).toContain("Version 0.3.0-beta cannot replace this installed copy in place.");
    });
  });

  describe("verificationFailureMessage & checkFailureMessage", () => {
    it("returns appropriate error messages", () => {
      expect(verificationFailureMessage("checksum-mismatch")).toContain(
        "could not be verified",
      );
      expect(checkFailureMessage("unsupported")).toBe(
        "In-app updates are available in the official Android Beta.",
      );
      expect(checkFailureMessage("network")).toBe("Unable to check for updates");
    });
  });
});
