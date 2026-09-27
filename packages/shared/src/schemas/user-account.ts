// Account deletion request and response.

import { z } from "zod";

export const accountDeletionRequestSchema = z
  .object({
    confirmation: z.literal("DELETE"),
    password: z.string().min(1).max(1_024),
  })
  .strict();

export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;

export const accountDeletionResponseSchema = z
  .object({ status: z.enum(["deleted", "cleanup_pending"]) })
  .strict();
