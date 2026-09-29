// Workspace-wide settings shared by every client.

import { z } from "zod";

import { currencies } from "../types";

/**
 * The workspace currency labels every amount that does not carry its own (budgets, goals,
 * debts, plans, dashboard totals), is the base other currencies convert into for cashflow
 * trends, and is the default for new accounts. Changing it never rewrites a stored amount.
 */
export const workspaceSettingsSchema = z.object({ currency: z.enum(currencies) }).strict();

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export const workspaceSettingsUpdateSchema = workspaceSettingsSchema;

export type WorkspaceSettingsUpdate = z.infer<typeof workspaceSettingsUpdateSchema>;
