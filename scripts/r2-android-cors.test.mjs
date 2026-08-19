import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const policy = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "r2-android-cors.json"), "utf8"),
);

describe("R2 Android CORS policy", () => {
  it("allows only the production Pages origins and GET/HEAD", () => {
    expect(policy.rules).toHaveLength(1);
    const rule = policy.rules[0];
    expect(rule.allowed.origins).toEqual(["https://zoption.site", "https://www.zoption.site"]);
    expect(rule.allowed.origins.every((origin) => !origin.includes("*"))).toBe(true);
    expect(rule.allowed.methods).toEqual(["GET", "HEAD"]);
    expect(rule.allowed.headers).toEqual(["Content-Type", "Accept", "Cache-Control", "Pragma"]);
    expect(rule.exposeHeaders).toEqual(["Content-Length", "ETag"]);
  });
});
