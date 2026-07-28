import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getConsentGatePreferences,
  registerOptionalIntegration,
  resetConsentGateForTests,
  subscribeToConsentGate,
  updateConsentGate,
} from "../src/consent/consentGate";

afterEach(() => {
  resetConsentGateForTests();
  vi.restoreAllMocks();
});

describe("consent gate", () => {
  it("blocks optional integrations before explicit consent", () => {
    const loader = vi.fn();

    registerOptionalIntegration("analytics", loader);

    expect(loader).not.toHaveBeenCalled();
    expect(getConsentGatePreferences()).toEqual({ analytics: false, marketing: false });
  });

  it("starts only the category that was granted", async () => {
    const analyticsLoader = vi.fn();
    const marketingLoader = vi.fn();
    registerOptionalIntegration("analytics", analyticsLoader);
    registerOptionalIntegration("marketing", marketingLoader);

    updateConsentGate({ analytics: true, marketing: false });
    await vi.waitFor(() => expect(analyticsLoader).toHaveBeenCalledOnce());

    expect(marketingLoader).not.toHaveBeenCalled();
  });

  it("cleans up an active integration when consent is revoked", async () => {
    const cleanup = vi.fn();
    const loader = vi.fn().mockReturnValue(cleanup);
    registerOptionalIntegration("analytics", loader);

    updateConsentGate({ analytics: true, marketing: false });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    updateConsentGate({ analytics: false, marketing: false });
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
  });

  it("cleans up a loader that resolves after consent is revoked", async () => {
    let resolveLoader: ((cleanup: () => void) => void) | undefined;
    const cleanup = vi.fn();
    const loader = vi.fn(
      () =>
        new Promise<() => void>((resolve) => {
          resolveLoader = resolve;
        }),
    );
    registerOptionalIntegration("analytics", loader);

    updateConsentGate({ analytics: true, marketing: false });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    updateConsentGate({ analytics: false, marketing: false });
    resolveLoader?.(cleanup);

    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
  });

  it("notifies subscribers with the latest optional preferences", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToConsentGate(listener);

    updateConsentGate({ analytics: false, marketing: true });

    expect(listener).toHaveBeenCalledWith({ analytics: false, marketing: true });
    unsubscribe();
  });
});
