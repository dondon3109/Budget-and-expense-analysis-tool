// Platform admin AI provider configuration and credentials.

import { z } from "zod";

import { providerServices } from "../types";

export const providerServiceSchema = z.enum(providerServices);

export const providerConfigSchema = z
  .object({
    id: z.string().uuid(),
    service: providerServiceSchema,
    provider: z.string().min(1).max(80),
    model: z.string().min(1).max(200),
    displayName: z.string().trim().min(2).max(40),
    credentialId: z.string().uuid().nullable(),
    enabled: z.boolean(),
    priority: z.number().int().min(1).max(100),
    isActive: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    updatedBy: z.string().uuid().nullable(),
  })
  .strict();

export const providerCredentialSchema = z
  .object({
    id: z.string().uuid(),
    provider: z.string().min(1).max(80),
    name: z.string().trim().min(2).max(40),
    apiKeyLast4: z.string().length(4),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    updatedBy: z.string().uuid().nullable(),
  })
  .strict();

export const providerCredentialWithUsageSchema = providerCredentialSchema.extend({
  usedBy: z.array(
    z
      .object({
        configId: z.string().uuid(),
        service: providerServiceSchema,
        provider: z.string().min(1).max(80),
        model: z.string().min(1).max(200),
        displayName: z.string().trim().min(2).max(40),
        isActive: z.boolean(),
      })
      .strict(),
  ),
});

export const providerConfigAuditsResponseSchema = z.array(
  z
    .object({
      id: z.string().uuid(),
      configId: z.string().uuid().nullable(),
      service: providerServiceSchema,
      action: z.enum(["create", "update", "activate", "deactivate", "delete", "reorder"]),
      oldValue: providerConfigSchema.nullable(),
      newValue: providerConfigSchema.nullable(),
      changedBy: z.string().uuid(),
      createdAt: z.iso.datetime(),
    })
    .strict(),
);

export const providerConfigCreateSchema = z
  .object({
    service: providerServiceSchema,
    provider: z.string().min(1).max(80),
    model: z.string().min(1).max(200),
    displayName: z.string().trim().min(2).max(40).optional(),
    credentialId: z.string().uuid().nullable().optional(),
    enabled: z.boolean().optional().default(true),
    priority: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const providerConfigUpdateSchema = z
  .object({
    provider: z.string().min(1).max(80).optional(),
    model: z.string().min(1).max(200).optional(),
    displayName: z.string().trim().min(2).max(40).optional(),
    credentialId: z.string().uuid().nullable().optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export const providerCredentialCreateSchema = z
  .object({
    provider: z.string().min(1).max(80),
    name: z.string().trim().min(2).max(40),
    secret: z.string().trim().min(8).max(8192),
  })
  .strict();

export const providerCredentialUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    secret: z.string().trim().min(8).max(8192).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export const providerConfigReorderSchema = z
  .object({
    service: providerServiceSchema,
    orderedIds: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict()
  .refine((value) => new Set(value.orderedIds).size === value.orderedIds.length, {
    path: ["orderedIds"],
    message: "Each config may appear only once.",
  });

export type ProviderConfigCreateInput = z.infer<typeof providerConfigCreateSchema>;
export type ProviderConfigUpdateInput = z.infer<typeof providerConfigUpdateSchema>;
export type ProviderConfigReorderInput = z.infer<typeof providerConfigReorderSchema>;
export type ProviderCredentialCreateInput = z.infer<typeof providerCredentialCreateSchema>;
export type ProviderCredentialUpdateInput = z.infer<typeof providerCredentialUpdateSchema>;

/**
 * Preview a vendor's live model list with a not-yet-saved key. The secret is
 * used for one listing call and never stored.
 */
export const providerModelsPreviewSchema = z
  .object({
    provider: z.string().min(1).max(80),
    secret: z.string().trim().min(8).max(8192),
  })
  .strict();

export type ProviderModelsPreviewInput = z.infer<typeof providerModelsPreviewSchema>;

export const providerModelsResponseSchema = z
  .object({
    provider: z.string().min(1).max(80),
    models: z.array(z.string().min(1).max(200)).max(300),
  })
  .strict();

export type ProviderModelsResponse = z.infer<typeof providerModelsResponseSchema>;
