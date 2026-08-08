import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import {
  ApiReadinessError,
  checkApiReadiness,
  validateRequiredApiBindings,
} from "../src/readiness";
import type { Bindings } from "../src/types";

const publishableKey = "sb_publishable_public-test-key";

function bindings(overrides: Partial<Bindings> = {}): Bindings {
  const first = vi.fn().mockResolvedValue({ ready: 1 });
  return {
    DB: {
      prepare: vi.fn(() => ({ first }) as unknown as D1PreparedStatement),
    } as unknown as D1Database,
    ALLOWED_ORIGINS: "https://zoption.site,https://www.zoption.site",
    SUPABASE_URL: "https://project-ref.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API readiness bindings", () => {
  it("validates core deployment bindings before checking D1", async () => {
    const env = bindings();
    await expect(checkApiReadiness(env)).resolves.toBeUndefined();
    expect(env.DB.prepare).toHaveBeenCalledWith("SELECT 1");
  });

  it.each([
    ["ALLOWED_ORIGINS", undefined],
    ["SUPABASE_URL", undefined],
    ["SUPABASE_PUBLISHABLE_KEY", undefined],
    ["SUPABASE_URL", "http://project-ref.supabase.co"],
    ["SUPABASE_PUBLISHABLE_KEY", "sb_secret_backend-only"],
  ] as const)("rejects an unavailable or invalid %s binding", (name, value) => {
    expect(() => validateRequiredApiBindings(bindings({ [name]: value }))).toThrow(
      ApiReadinessError,
    );
  });

  it("allows loopback HTTP origins only for local development", () => {
    expect(() =>
      validateRequiredApiBindings(
        bindings({
          ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
          SUPABASE_URL: "http://127.0.0.1:54321",
        }),
      ),
    ).not.toThrow();
  });

  it("accepts a Worker-native decoded legacy anon key and rejects service-role JWTs", () => {
    const encodedRole = (role: string) =>
      btoa(JSON.stringify({ role })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    expect(() =>
      validateRequiredApiBindings(
        bindings({ SUPABASE_PUBLISHABLE_KEY: `header.${encodedRole("anon")}.signature` }),
      ),
    ).not.toThrow();
    expect(() =>
      validateRequiredApiBindings(
        bindings({ SUPABASE_PUBLISHABLE_KEY: `header.${encodedRole("service_role")}.signature` }),
      ),
    ).toThrow(ApiReadinessError);
  });

  it("returns a sanitized unavailable response without exposing readiness errors", async () => {
    const secret = "sensitive-provider-value";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApp({
      readinessCheck: vi.fn().mockRejectedValue(new Error(secret)),
    });

    const response = await app.request("/health");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      service: "budget-expense-api",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
  });
});
