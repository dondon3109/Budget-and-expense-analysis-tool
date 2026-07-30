import { afterEach, describe, expect, it, vi } from "vitest";

import { createCustomerPortalSession } from "../src/billing/paddle";
import { HttpError } from "../src/errors";
import type { Bindings } from "../src/types";

function bindings(overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: {} as D1Database,
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_API_KEY: "pdl_sdbx_test_key",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Paddle customer portal sessions", () => {
  it("creates a fresh sandbox portal session for the server-owned customer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            urls: {
              general: {
                overview: "https://sandbox-customer-portal.paddle.com/session/example",
              },
            },
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createCustomerPortalSession(bindings(), "ctm_customer", ["sub_monthly"]),
    ).resolves.toBe("https://sandbox-customer-portal.paddle.com/session/example");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sandbox-api.paddle.com/customers/ctm_customer/portal-sessions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer pdl_sdbx_test_key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscription_ids: ["sub_monthly"] }),
      }),
    );
  });

  it("rejects a non-Paddle URL returned by the provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { urls: { general: { overview: "https://example.com/phish" } } },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(createCustomerPortalSession(bindings(), "ctm_customer", [])).rejects.toMatchObject(
      {
        status: 502,
        code: "billing_provider_error",
      },
    );
  });

  it("does not expose Paddle API errors to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { detail: "private provider detail" } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(createCustomerPortalSession(bindings(), "ctm_customer", [])).rejects.toEqual(
      new HttpError(502, "billing_provider_error", "The billing portal could not be opened."),
    );
  });

  it("requires explicit environment and API-key configuration", async () => {
    await expect(
      createCustomerPortalSession(bindings({ PADDLE_ENVIRONMENT: undefined }), "ctm_customer", []),
    ).rejects.toMatchObject({ status: 503, code: "billing_not_configured" });
    await expect(
      createCustomerPortalSession(bindings({ PADDLE_API_KEY: undefined }), "ctm_customer", []),
    ).rejects.toMatchObject({ status: 503, code: "billing_not_configured" });
  });
});
