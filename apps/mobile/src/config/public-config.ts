import { z } from "zod";

const publicConfigSchema = z
  .object({
    apiUrl: z.string().url(),
    supabaseUrl: z.string().url().optional(),
    supabasePublishableKey: z.string().min(20).optional(),
  })
  .strict();

export type PublicConfig = z.infer<typeof publicConfigSchema>;

export function readPublicConfig(
  source: Record<string, string | undefined> = process.env,
): PublicConfig {
  return publicConfigSchema.parse({
    apiUrl: source.EXPO_PUBLIC_API_URL ?? "https://api.zoption.site",
    supabaseUrl: source.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export const publicConfig = readPublicConfig();
