import { isSupabaseConfigured, parsePublicConfig } from "./public-config";

describe("public config", () => {
  it("falls back to the production API when no URL is provided", () => {
    const config = parsePublicConfig(undefined, undefined, undefined);
    expect(config.apiUrl).toBe("https://api.zoption.site");
    expect(isSupabaseConfigured).toBe(false);
  });

  it("treats blank Supabase values as absent", () => {
    const config = parsePublicConfig("https://api.zoption.site", "  ", "");
    expect(config.supabaseUrl).toBeUndefined();
    expect(config.supabasePublishableKey).toBeUndefined();
  });

  it("accepts a configured Supabase pair", () => {
    const config = parsePublicConfig(
      "https://api.zoption.site",
      "https://example.supabase.co",
      "sb_publishable_abcdefghijklmnopqrstuvwxyz",
    );
    expect(config.supabaseUrl).toBe("https://example.supabase.co");
    expect(config.supabasePublishableKey).toMatch(/^sb_publishable_/);
  });
});
