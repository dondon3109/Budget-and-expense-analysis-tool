// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { registerZoptionServiceWorker } from "../src/pwa/registerServiceWorker";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("service-worker registration", () => {
  it("registers the module worker after load with update caching disabled", async () => {
    const register = vi.fn().mockResolvedValue({});
    const listeners = new Map<string, EventListener>();
    const eventTarget = {
      addEventListener: vi.fn((type: string, listener: EventListener) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    } as unknown as Window;

    const cleanup = registerZoptionServiceWorker({
      enabled: true,
      container: { register } as unknown as ServiceWorkerContainer,
      eventTarget,
      readyState: "loading",
    });

    expect(register).not.toHaveBeenCalled();
    listeners.get("load")?.(new Event("load"));
    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("/service-worker.js", {
      scope: "/",
      type: "module",
      updateViaCache: "none",
    });

    cleanup();
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith("load", expect.any(Function));
  });

  it("does not register outside an enabled production path", () => {
    const register = vi.fn();
    registerZoptionServiceWorker({
      enabled: false,
      container: { register } as unknown as ServiceWorkerContainer,
      readyState: "complete",
    });
    expect(register).not.toHaveBeenCalled();
  });
});
