import { useEffect, useState } from "react";

import { ANDROID_RELEASE, type AndroidRelease } from "@zoption/web-common/android-release";
import {
  ANDROID_LATEST_URL,
  parseRemoteAndroidRelease,
} from "@zoption/web-common/android-release-metadata";

const FETCH_TIMEOUT_MS = 8_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

/**
 * The Android release to offer: the last shipped snapshot, replaced by R2's
 * latest.json once it passes the strict untrusted-input validation. Every
 * failure (network, timeout, malformed JSON, invalid shape, wrong host, bad
 * checksum) keeps the snapshot, so the official R2 APK stays downloadable and
 * no fallback artifact link is ever offered.
 */
export function useAndroidRelease(): AndroidRelease {
  const [release, setRelease] = useState<AndroidRelease>(ANDROID_RELEASE);

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
        const remote = parseRemoteAndroidRelease(await response.json());
        if (cancelled || !remote) return;
        setRelease(remote);
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

  return release;
}
