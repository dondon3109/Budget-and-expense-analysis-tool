import type { ParsedAndroidRelease } from "./android-release-metadata";
import type { ApkVerifyFailureReason } from "./apk-verify";
import type { InstalledAndroidApp } from "./update-policy";

export function formatApkSize(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(1)} MB`;
}

export function formatDownloadProgress(bytesWritten: number, totalBytes: number): string {
  const total = totalBytes > 0 ? totalBytes : 0;
  if (total <= 0) {
    return `Downloading ${formatApkSize(bytesWritten)}…`;
  }
  return `Downloading ${formatApkSize(bytesWritten)} of ${formatApkSize(total)}…`;
}

/**
 * Normalizes release notes from arbitrary inputs (array of items, bulleted markdown,
 * newline-delimited lists, or single paragraphs containing multiple sentences) into a
 * clean list of individual change descriptions.
 */
export function normalizeReleaseNotes(notes: readonly string[]): string[] {
  const result: string[] = [];

  for (const rawNote of notes) {
    if (typeof rawNote !== "string") continue;

    // Split by newlines first
    const lines = rawNote.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Remove leading bullet or list markers (•, -, *, +, 1., 1), etc.)
      const stripped = trimmed
        .replace(/^[\u2022\u2023\u25E6\u2043\u2219•\-*+]\s*/u, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim();

      if (!stripped) continue;

      // If a single note contains multiple sentences in a single paragraph,
      // split them so each sentence / change becomes its own list item.
      const sentences = splitSentenceParagraph(stripped);
      for (const sentence of sentences) {
        const item = sentence
          .replace(/^[\u2022\u2023\u25E6\u2043\u2219•\-*+]\s*/u, "")
          .replace(/^\d+[.)]\s*/, "")
          .trim();
        if (item) {
          result.push(item);
        }
      }
    }
  }

  return result;
}

function splitSentenceParagraph(text: string): string[] {
  // If short and has no sentence boundaries, keep intact
  if (text.length < 80 || !/[.!?]\s+[A-Z]/.test(text)) {
    return [text];
  }

  const sentences: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; i++) {
    current += text[i];
    const char = text[i];
      if (char === "." || char === "!" || char === "?") {
        // Look ahead for space + capital letter
        const afterSpace = text[i + 2];
        if (
          i + 2 < text.length &&
          text[i + 1] === " " &&
          afterSpace !== undefined &&
          /[A-Z]/.test(afterSpace)
        ) {
        const words = current.trim().split(/\s+/);
        const lastWord = (words[words.length - 1] ?? "").toLowerCase();
        // Ignore common abbreviations
        if (
          lastWord === "e.g." ||
          lastWord === "i.e." ||
          lastWord === "vs." ||
          lastWord === "mr." ||
          lastWord === "ms." ||
          lastWord === "dr." ||
          lastWord === "etc." ||
          lastWord === "v." ||
          lastWord === "ver."
        ) {
          continue;
        }
        sentences.push(current.trim());
        current = "";
        i++; // skip the space
      }
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.length > 0 ? sentences : [text];
}

export function updateAvailableMessage(
  installed: InstalledAndroidApp,
  latest: ParsedAndroidRelease,
): string {
  const notes = normalizeReleaseNotes(latest.notes);
  const bulletNotes =
    notes.length > 0
      ? `\n\n${notes.map((note) => `• ${note}`).join("\n")}`
      : "";
  return `You have ${installed.versionName}. Version ${latest.versionName} is ${formatApkSize(latest.size)}.${bulletNotes}`;
}

export function reinstallRequiredMessage(latest: ParsedAndroidRelease): string {
  return [
    `Version ${latest.versionName} cannot replace this installed copy in place.`,
    "Uninstall Zoption Beta, then download the latest official APK from the install page.",
    "Your Zoption account and synced records stay on the server.",
  ].join(" ");
}

export function verificationFailureMessage(reason: ApkVerifyFailureReason): string {
  switch (reason) {
    case "checksum-mismatch":
    case "size-mismatch":
    case "package-mismatch":
    case "version-mismatch":
    case "downgrade":
    case "signer-mismatch":
    case "multiple-signers":
    case "missing-signer":
      return "The update file could not be verified. The download was discarded.";
  }
}

export function checkFailureMessage(
  reason: "network" | "invalid-metadata" | "downgrade" | "untrusted-signer" | "unsupported",
): string {
  if (reason === "unsupported") {
    return "In-app updates are available in the official Android Beta.";
  }
  return "Unable to check for updates";
}
