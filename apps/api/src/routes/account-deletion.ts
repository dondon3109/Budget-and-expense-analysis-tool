import { accountDeletionRequestSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { AccountDeletionService } from "../account-deletion";
import { HttpError } from "../errors";
import { enqueueJob } from "../jobs";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

export function createAccountDeletionRoutes(service: AccountDeletionService) {
  const routes = new Hono<AppEnvironment>();

  routes.delete("/", async (context) => {
    const parsed = accountDeletionRequestSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Confirm account deletion and enter your current password.",
      );
    }

    const status = await service.deleteAccount({
      env: context.env,
      user: context.get("authUser"),
      accessToken: context.get("accessToken"),
      password: parsed.data.password,
    });
    if (status === "cleanup_pending") {
      await enqueueJob(context.env, {
        type: "account-deletion",
        userId: context.get("authUser").id,
      });
    }
    return context.json({ status }, status === "deleted" ? 200 : 202);
  });

  return routes;
}
