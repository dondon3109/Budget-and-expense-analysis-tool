import { describe, expect, it, vi } from "vitest";

import type { PlatformAdminService } from "../src/platform-admin";
import {
  AUTHORIZATION,
  TENANT_ID,
  customerReviewFixture,
  publicCustomerReviewFixture,
  createCustomerReviewStore,
  createAppWithFakes,
  privateHeaders,
} from "./helpers/app-fakes";

describe("API foundation", () => {
  it("lists only repository-approved public customer reviews without authentication", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createAppWithFakes({ customerReviews });
    const response = await app.request("/api/reviews");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
    await expect(response.json()).resolves.toEqual({
      items: [publicCustomerReviewFixture],
    });
    expect(customerReviews.listPublic).toHaveBeenCalledWith(undefined, 6);
  });

  it("keeps unexpected repository details out of request logs", async () => {
    const sensitiveDetail = "sensitive-repository-detail";
    const customerReviews = createCustomerReviewStore();
    customerReviews.listPublic = vi.fn(async () => {
      throw new Error(sensitiveDetail);
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const app = createAppWithFakes({ customerReviews });
      const response = await app.request("/api/reviews");

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "internal_server_error" });
      expect(errorSpy).toHaveBeenCalledWith(
        JSON.stringify({
          message: "Request failed",
          category: "unexpected_error",
          method: "GET",
        }),
      );
      expect(errorSpy.mock.calls.flat().join(" ")).not.toContain(sensitiveDetail);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("protects review moderation with platform-admin authorization", async () => {
    const customerReviews = createCustomerReviewStore();
    const requireAdmin = vi.fn().mockResolvedValue(undefined);
    const app = createAppWithFakes({
      customerReviews,
      platformAdminService: { requireAdmin } as unknown as PlatformAdminService,
    });
    const response = await app.request("/api/app/admin/reviews", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledWith(undefined, "user-1");
    expect(customerReviews.getAdminDashboard).toHaveBeenCalledWith(undefined, {
      page: 1,
      pageSize: 50,
    });
  });

  it("lets a platform admin publish reviews and set a distinct six-item lineup", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createAppWithFakes({
      customerReviews,
      platformAdminService: {
        requireAdmin: vi.fn().mockResolvedValue(undefined),
      } as unknown as PlatformAdminService,
    });
    const publishResponse = await app.request(
      `/api/app/admin/reviews/${customerReviewFixture.id}`,
      {
        method: "PATCH",
        headers: privateHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "published" }),
      },
    );
    const lineupResponse = await app.request("/api/app/admin/reviews/lineup", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reviewIds: [customerReviewFixture.id] }),
    });

    expect(publishResponse.status).toBe(200);
    expect(lineupResponse.status).toBe(200);
    expect(customerReviews.updateModeration).toHaveBeenCalledWith(
      undefined,
      customerReviewFixture.id,
      "published",
    );
    expect(customerReviews.setLineup).toHaveBeenCalledWith(undefined, [customerReviewFixture.id]);
  });

  it("lets an authenticated customer publish one validated review for their tenant", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createAppWithFakes({ customerReviews });
    const response = await app.request("/api/app/reviews/me", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        displayName: "Don",
        rating: 5,
        review: "Zoption gives me a much clearer view of my monthly spending.",
        publishConsent: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(customerReviews.upsert).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      "user-1",
      expect.objectContaining({ rating: 5, publishConsent: true }),
    );
  });

  it("rejects a customer review without explicit public consent", async () => {
    const customerReviews = createCustomerReviewStore();
    const app = createAppWithFakes({ customerReviews });
    const response = await app.request("/api/app/reviews/me", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        displayName: "Don",
        rating: 5,
        review: "Zoption gives me a much clearer view of my monthly spending.",
        publishConsent: false,
      }),
    });

    expect(response.status).toBe(400);
    expect(customerReviews.upsert).not.toHaveBeenCalled();
  });
});
