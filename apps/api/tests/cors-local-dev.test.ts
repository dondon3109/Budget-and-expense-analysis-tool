import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import type { Bindings } from "../src/types";

function apiEnvironment(overrides: Record<string, unknown> = {}): Bindings {
  return { ALLOWED_ORIGINS: "https://zoption.site", ...overrides } as Bindings;
}

async function preflight(origin: string, env: Bindings): Promise<Response> {
  return await createApp().request(
    "/api/app/transactions",
    {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    },
    env,
  );
}

describe("local development CORS", () => {
  it("allows an exact loopback origin at any port", async () => {
    for (const origin of ["http://localhost:5199", "http://127.0.0.1:5199", "http://[::1]:5199"]) {
      const response = await preflight(origin, apiEnvironment());

      expect(response.status, origin).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  });

  it("rejects a registrable hostname that only begins with a private IP prefix", async () => {
    for (const origin of ["http://192.168.example.com", "http://10.example.com"]) {
      const response = await preflight(origin, apiEnvironment());

      expect(response.status, origin).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: "origin_not_allowed" });
    }
  });

  it("rejects a hostname that only begins with localhost", async () => {
    const response = await preflight("http://localhost-cdn.example.com", apiEnvironment());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "origin_not_allowed" });
  });

  it("rejects a loopback origin in production", async () => {
    const response = await preflight(
      "http://localhost:5199",
      apiEnvironment({ POSTHOG_AI_ENVIRONMENT: "production" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "origin_not_allowed" });
  });

  it("honours the configured allowlist and rejects everything else", async () => {
    const allowed = await preflight("https://zoption.site", apiEnvironment());
    expect(allowed.status).toBe(204);

    const rejected = await preflight("https://evil.example", apiEnvironment());
    expect(rejected.status).toBe(403);
  });
});
