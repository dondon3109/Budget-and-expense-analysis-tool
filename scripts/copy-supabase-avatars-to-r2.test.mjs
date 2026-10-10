import { describe, expect, it, vi } from "vitest";

import { isServableAvatarPath, listSourcePaths, r2KeyFor } from "./copy-supabase-avatars-to-r2.mjs";

describe("copy-supabase-avatars-to-r2", () => {
  it("walks user folders and returns every object path", async () => {
    const listings = {
      "": [
        { name: "user-1", id: null },
        { name: "stray.png", id: "o0" },
      ],
      "user-1/": [
        { name: "a.jpg", id: "o1" },
        { name: "b.webp", id: "o2" },
      ],
    };
    const fetcher = vi.fn(async (_url, init) => {
      const { prefix } = JSON.parse(init.body);
      return new Response(JSON.stringify(listings[prefix]));
    });

    const paths = await listSourcePaths(fetcher, "https://example.supabase.co", "service-key");

    expect(paths).toEqual(["user-1/a.jpg", "user-1/b.webp", "stray.png"]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/list/avatars",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("copies only paths the Worker serves, under its R2 key", () => {
    expect(isServableAvatarPath("user-1/11111111-1111-4111-8111-111111111111.jpg")).toBe(true);
    expect(isServableAvatarPath("stray.png")).toBe(false);
    expect(isServableAvatarPath("user-1/nested/a.jpg")).toBe(false);
    expect(isServableAvatarPath("user-1/a.gif")).toBe(false);
    expect(r2KeyFor("user-1/a.jpg")).toBe("avatars/user-1/a.jpg");
  });
});
