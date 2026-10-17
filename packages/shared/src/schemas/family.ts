// Family workspaces: creating one, inviting people, roles, leaving, and transfer.

import { z } from "zod";

import { workspaceRoles } from "./membership";

/** Seats include the owner and every unexpired pending invitation. */
export const FAMILY_SEAT_LIMIT = 6;
/** A seat freed by someone leaving or being removed stays unusable for this long. */
export const FAMILY_SEAT_COOLDOWN_DAYS = 30;
/** A person can join a different family at most once in this window. */
export const FAMILY_JOIN_COOLDOWN_DAYS = 90;
/** Seats freed in a rolling year; once reached, the family cannot invite anyone new. */
export const FAMILY_SWAP_LIMIT_PER_YEAR = 5;
/** Families a person can belong to, including the one they own. */
export const FAMILY_MEMBERSHIP_LIMIT = 3;
export const FAMILY_INVITATION_DAYS = 14;

/** The roles an owner can give; ownership moves only through a transfer. */
export const familyMemberRoles = ["member", "viewer"] as const;

const familyNameSchema = z.string().trim().min(1).max(60);
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const timestampSchema = z.string().min(1);

/**
 * Clients send this only after showing the seat-rules notice (creating a family, accepting an
 * invitation, removing a member), so a client that skips the notice cannot complete the action.
 */
const seatRulesAccepted = z.literal(true);

export const familyCreateSchema = z.object({ name: familyNameSchema, seatRulesAccepted }).strict();
export const familySeatRulesSchema = z.object({ seatRulesAccepted }).strict();
export const familyInviteSchema = z
  .object({ email: emailSchema, role: z.enum(familyMemberRoles) })
  .strict();
export const familyRoleUpdateSchema = z.object({ role: z.enum(familyMemberRoles) }).strict();
export const familyTransferSchema = z.object({ userId: z.string().min(1) }).strict();

export const familyMemberSchema = z
  .object({
    userId: z.string(),
    /** The verified email, or null when the person has not confirmed one. */
    email: z.string().nullable(),
    role: z.enum(workspaceRoles),
    joinedAt: timestampSchema,
  })
  .strict();

export const familyPendingInvitationSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    role: z.enum(familyMemberRoles),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict();

export const familyDetailSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    role: z.enum(workspaceRoles),
    members: z.array(familyMemberSchema),
    invitations: z.array(familyPendingInvitationSchema),
    seats: z
      .object({
        limit: z.number().int(),
        /** Members plus unexpired invitations. */
        used: z.number().int(),
        /** Freed seats still inside the cooldown. */
        cooling: z.number().int(),
      })
      .strict(),
    swaps: z.object({ limit: z.number().int(), used: z.number().int() }).strict(),
  })
  .strict();

/** An invitation addressed to the signed-in person's verified email. */
export const familyInvitationSchema = z
  .object({
    id: z.string(),
    familyId: z.string(),
    familyName: z.string(),
    role: z.enum(familyMemberRoles),
    invitedBy: z.string().nullable(),
    expiresAt: timestampSchema,
  })
  .strict();

export const familyInvitationListSchema = z
  .object({ invitations: z.array(familyInvitationSchema) })
  .strict();

export type FamilyMemberRole = (typeof familyMemberRoles)[number];
export type FamilyCreateInput = z.infer<typeof familyCreateSchema>;
export type FamilyInviteInput = z.infer<typeof familyInviteSchema>;
export type FamilyMember = z.infer<typeof familyMemberSchema>;
export type FamilyPendingInvitation = z.infer<typeof familyPendingInvitationSchema>;
export type FamilyDetail = z.infer<typeof familyDetailSchema>;
export type FamilyInvitation = z.infer<typeof familyInvitationSchema>;
export type FamilyInvitationList = z.infer<typeof familyInvitationListSchema>;
