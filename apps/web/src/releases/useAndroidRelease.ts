import { useEffect, useState } from "react";

import { ANDROID_RELEASE, type AndroidRelease } from "./androidRelease";
import {
  ANDROID_LATEST_URL,
  parseRemoteAndroidRelease,
} from "./androidReleaseMetadata";

export interface AndroidReleaseSource {
  release: AndroidRelease;
  status: "remote" | "fallback";
}

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Loads the authoritative Android release metadata from R2. Starts on the
 * trusted build-time snapshot and upgrades to the remote object only when it
 * passes the strict untrusted-input validation; every failure (network,
 * malformed JSON, invalid shape, wrong host, bad checksum) keeps the
 * fallback so the page never renders unverified data and never crashes.
 */
export function useAndroidRelease(): AndroidReleaseSource {
  const [source, setSource] = useState<AndroidReleaseSource>({
    release: ANDROID_RELEASE,
    status: "fallback",
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
        if (!response.ok) return;
        const release = parseRemoteAndroidRelease(await response.json());
        if (release) {
          setSource({ release, status: "remote" });
        }
      } catch {
        // Timeout, network failure, non-JSON body, or invalid metadata:
        // keep the trusted fallback snapshot.
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
