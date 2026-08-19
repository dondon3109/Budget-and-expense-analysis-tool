import { useEffect, useState } from "react";

import { ANDROID_RELEASE, type AndroidRelease } from "./androidRelease";
import {
  ANDROID_LATEST_URL,
  parseRemoteAndroidRelease,
} from "./androidReleaseMetadata";

export type AndroidReleaseStatus = "loading" | "remote" | "unavailable";

export interface AndroidReleaseSource {
  release: AndroidRelease | null;
  status: AndroidReleaseStatus;
}

const FETCH_TIMEOUT_MS = 8_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

/**
 * Loads the authoritative Android release metadata from R2. The page only
 * ever renders metadata that passed the strict untrusted-input validation;
 * while the request is in flight the status is "loading", and every failure
 * (network, timeout, malformed JSON, invalid shape, wrong host, bad
 * checksum) ends in "unavailable" so the UI shows a safe download-
 * unavailable state instead of any fallback artifact link.
 *
 * Start from the last shipped snapshot so the official R2 APK stays
 * downloadable if the live latest.json request is blocked. A successful
 * remote parse replaces the snapshot. Unmount/StrictMode aborts are
 * ignored so they cannot clear a working card.
 */
export function useAndroidRelease(): AndroidReleaseSource {
  const [source, setSource] = useState<AndroidReleaseSource>({
    release: ANDROID_RELEASE,
    status: "remote",
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    void (async () => {
      try {
        const response = await fetch(ANDROID_LATEST_URL, {
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!response.ok) return;
        const release = parseRemoteAndroidRelease(await response.json());
        if (cancelled || !release) return;
        setSource({ release, status: "remote" });
      } catch (error) {
        if (cancelled || isAbortError(error)) {
          return;
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return source;
}
