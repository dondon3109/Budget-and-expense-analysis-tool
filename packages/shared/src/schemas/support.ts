// Bug reports, customer reviews, and support chat.

import { z } from "zod";

import {
  bugReportCategories,
  bugReportFrequencies,
  bugReportPageContexts,
  bugReportStatuses,
  customerReviewModerationStatuses,
} from "../types";

const bugReportDetailSchema = z.string().trim().min(5).max(2_000);

export const bugReportDraftSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    category: z.enum(bugReportCategories),
    actualBehavior: bugReportDetailSchema,
    expectedBehavior: bugReportDetailSchema,
    stepsToReproduce: bugReportDetailSchema,
    frequency: z.enum(bugReportFrequencies),
  })
  .strict();

export type BugReportDraftInput = z.infer<typeof bugReportDraftSchema>;

export const bugReportDiagnosticsSchema = z
  .object({
    route: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/^\/[A-Za-z0-9/_-]*$/, "Include only the page path without a query or fragment."),
    releaseVersion: z.string().trim().min(1).max(40),
    viewportWidth: z.number().int().min(240).max(10_000),
    viewportHeight: z.number().int().min(240).max(10_000),
    displayMode: z.enum(["browser", "standalone"]),
    platform: z.enum(["android", "ios", "desktop", "other"]),
  })
  .strict();

export const bugReportCreateSchema = bugReportDraftSchema
  .extend({
    clientRequestId: z.string().uuid(),
    pageContext: z.enum(bugReportPageContexts),
    diagnostics: bugReportDiagnosticsSchema,
  })
  .strict();

export type BugReportCreateInput = z.infer<typeof bugReportCreateSchema>;

export const bugReportStatusUpdateSchema = z.object({ status: z.enum(bugReportStatuses) }).strict();

export type BugReportStatusUpdate = z.infer<typeof bugReportStatusUpdateSchema>;

export const customerReviewInputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(50),
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().min(20).max(600),
    publishConsent: z.literal(true),
  })
  .strict();

export type CustomerReviewInput = z.infer<typeof customerReviewInputSchema>;

export const customerReviewModerationUpdateSchema = z
  .object({ status: z.enum(customerReviewModerationStatuses).exclude(["pending"]) })
  .strict();

export type CustomerReviewModerationUpdate = z.infer<typeof customerReviewModerationUpdateSchema>;

export const customerReviewLineupUpdateSchema = z
  .object({ reviewIds: z.array(z.string().uuid()).max(6) })
  .strict()
  .refine((value) => new Set(value.reviewIds).size === value.reviewIds.length, {
    path: ["reviewIds"],
    message: "Choose each review only once.",
  });

export type CustomerReviewLineupUpdate = z.infer<typeof customerReviewLineupUpdateSchema>;

export const supportChatResponseSchema = z
  .object({
    message: z.string().max(20_000),
    bugReportDraft: bugReportDraftSchema.optional(),
  })
  .strict();

export const bugReportResponseSchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string().min(1).max(60),
    title: z.string().min(1).max(120),
    category: z.enum(bugReportCategories),
    actualBehavior: z.string().min(1).max(2_000),
    expectedBehavior: z.string().min(1).max(2_000),
    stepsToReproduce: z.string().min(1).max(2_000),
    frequency: z.enum(bugReportFrequencies),
    pageContext: z.enum(bugReportPageContexts),
    diagnostics: bugReportDiagnosticsSchema,
    status: z.enum(bugReportStatuses),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
