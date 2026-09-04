import { devApiUrlFromHostUri, isSupabaseConfigured, parsePublicConfig } from "./public-config";

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

  it("derives the dev API URL from the Expo host so phones skip localhost", () => {
    expect(devApiUrlFromHostUri("192.168.1.5:8081")).toBe("http://192.168.1.5:8787");
    expect(devApiUrlFromHostUri("exp://192.168.0.2:19000")).toBe("http://192.168.0.2:8787");
    expect(devApiUrlFromHostUri("my-laptop.local:8081")).toBe("http://my-laptop.local:8787");
    expect(devApiUrlFromHostUri("localhost:8081")).toBe("http://localhost:8787");
  });

  it("returns undefined for a missing host so callers keep the localhost fallback", () => {
    expect(devApiUrlFromHostUri(undefined)).toBeUndefined();
    expect(devApiUrlFromHostUri("  ")).toBeUndefined();
  });
});
