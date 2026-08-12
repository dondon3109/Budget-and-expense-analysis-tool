import {
  customerReviewInputSchema,
  customerReviewLineupUpdateSchema,
  customerReviewModerationUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { CustomerReviewRepository } from "../db/customer-reviews";
import { HttpError } from "../errors";
import type { PlatformAdminService } from "../platform-admin";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createPublicCustomerReviewRoutes(reviews: CustomerReviewRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) => {
    context.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return context.json({ items: await reviews.listPublic(context.env, 6) });
  });

  return routes;
}

export function createAdminCustomerReviewRoutes(
  reviews: CustomerReviewRepository,
  platformAdmins: PlatformAdminService,
) {
  const routes = new Hono<AppEnvironment>();

  routes.use("*", async (context, next) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    await next();
  });

  routes.get("/", async (context) => {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        status: z.enum(["pending", "published", "hidden"]).optional(),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        search: z.string().trim().max(120).optional(),
      })
      .strict()
      .safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_customer_review_filter",
        "Choose valid review filters.",
        parsed.error.flatten(),
      );
    }
    return context.json(await reviews.getAdminDashboard(context.env, parsed.data));
  });

  routes.patch("/:id", async (context) => {
    const id = z.string().uuid().safeParse(context.req.param("id"));
    const input = customerReviewModerationUpdateSchema.safeParse(await readJson(context));
    if (!id.success) {
      throw new HttpError(404, "customer_review_not_found", "Customer review not found.");
    }
    if (!input.success) {
      throw new HttpError(
        400,
        "invalid_customer_review_status",
        "Choose whether to publish or hide this review.",
      );
    }
    return context.json(await reviews.updateModeration(context.env, id.data, input.data.status));
  });

  routes.put("/lineup", async (context) => {
    const input = customerReviewLineupUpdateSchema.safeParse(await readJson(context));
    if (!input.success) {
      throw new HttpError(
        400,
        "invalid_customer_review_lineup",
        "Choose up to six distinct reviews for the landing page.",
        input.error.flatten(),
      );
    }
    return context.json(await reviews.setLineup(context.env, input.data.reviewIds));
  });

  return routes;
}

export function createAuthenticatedCustomerReviewRoutes(reviews: CustomerReviewRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/me", async (context) =>
    context.json(await reviews.getState(context.env, context.get("tenant").tenantId)),
  );

  routes.put("/me", async (context) => {
    const parsed = customerReviewInputSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_customer_review",
        "Add a rating, a public name, and a review between 20 and 600 characters.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await reviews.upsert(
        context.env,
        context.get("tenant").tenantId,
        context.get("authUser").id,
        parsed.data,
      ),
    );
  });

  routes.delete("/me", async (context) => {
    await reviews.remove(context.env, context.get("tenant").tenantId);
    return context.body(null, 204);
  });

  return routes;
}
