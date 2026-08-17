import { useEffect, useState } from "react";

import type { AndroidRelease } from "./androidRelease";
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

/**
 * Loads the authoritative Android release metadata from R2. The page only
 * ever renders metadata that passed the strict untrusted-input validation;
 * while the request is in flight the status is "loading", and every failure
 * (network, timeout, malformed JSON, invalid shape, wrong host, bad
 * checksum) ends in "unavailable" so the UI shows a safe download-
 * unavailable state instead of any fallback artifact link.
 */
export function useAndroidRelease(): AndroidReleaseSource {
  const [source, setSource] = useState<AndroidReleaseSource>({
    release: null,
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    void (async () => {
      try {
        const response = await fetch(ANDROID_LATEST_URL, {
          headers: { accept: "application/json" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          setSource({ release: null, status: "unavailable" });
          return;
        }
        const release = parseRemoteAndroidRelease(await response.json());
        setSource(
          release
            ? { release, status: "remote" }
            : { release: null, status: "unavailable" },
        );
      } catch {
        // Timeout, network failure, or non-JSON body: show the safe
        // download-unavailable state. No fallback artifact is offered.
        setSource({ release: null, status: "unavailable" });
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return source;
}
