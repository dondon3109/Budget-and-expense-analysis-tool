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
 * The request is a simple CORS GET: no custom headers and no cache mode
 * that browsers promote into Cache-Control/Pragma, so it does not depend
 * on an R2 preflight. Unmount/StrictMode aborts are ignored so they cannot
 * overwrite a later successful load.
 */
export function useAndroidRelease(): AndroidReleaseSource {
  const [source, setSource] = useState<AndroidReleaseSource>({
    release: null,
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    void (async () => {
      try {
        const response = await fetch(ANDROID_LATEST_URL, {
          signal: controller.signal,
        });
        if (cancelled) return;
        if (!response.ok) {
          setSource({ release: null, status: "unavailable" });
          return;
        }
        const release = parseRemoteAndroidRelease(await response.json());
        if (cancelled) return;
        setSource(
          release
            ? { release, status: "remote" }
            : { release: null, status: "unavailable" },
        );
      } catch (error) {
        if (cancelled || (isAbortError(error) && !timedOut)) {
          return;
        }
        setSource({ release: null, status: "unavailable" });
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
