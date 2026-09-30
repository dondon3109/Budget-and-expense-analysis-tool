import { describe, expect, it } from "vitest";

import { aiReferrer } from "../src/client/analytics";
import { onRequest } from "../functions/ingest/[[path]]";

describe("aiReferrer", () => {
  it("names the answer engine that sent a visit, including its subdomains", () => {
    expect(aiReferrer("https://chatgpt.com/c/abc")).toBe("chatgpt");
    expect(aiReferrer("https://www.perplexity.ai/search?q=budget")).toBe("perplexity");
    expect(aiReferrer("https://claude.ai/chat/1")).toBe("claude");
    expect(aiReferrer("https://gemini.google.com/app")).toBe("gemini");
  });

  it("leaves search engines, lookalike hosts, and empty referrers unclassified", () => {
    expect(aiReferrer("https://www.google.com/")).toBeUndefined();
    expect(aiReferrer("https://notchatgpt.com/")).toBeUndefined();
    expect(aiReferrer("")).toBeUndefined();
  });
});

describe("/ingest proxy", () => {
  it("refuses anything but a POST to a PostHog capture endpoint", async () => {
    for (const request of [
      new Request("https://zoption.site/ingest/e/"),
      new Request("https://zoption.site/ingest/decide/", { method: "POST" }),
      new Request("https://zoption.site/ingest/../api", { method: "POST" }),
    ]) {
      expect((await onRequest({ request })).status).toBe(404);
    }
  });

  it("forwards a capture to PostHog without the visitor's cookies, address, or page URL", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: new Headers(init.headers) });
      return new Response("ok");
    }) as typeof fetch;
    try {
      const response = await onRequest({
        request: new Request("https://zoption.site/ingest/i/v0/e/?ver=1", {
          method: "POST",
          body: "{}",
          headers: {
            cookie: "a=b",
            "cf-connecting-ip": "203.0.113.9",
            "x-forwarded-for": "1.2.3.4",
            referer: "https://zoption.site/import?ref=private",
            "content-type": "application/json",
          },
        }),
      });
      expect(response.status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/i/v0/e/?ver=1");
    for (const name of ["cookie", "cf-connecting-ip", "x-forwarded-for", "referer"]) {
      expect(calls[0]?.headers.has(name)).toBe(false);
    }
    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
  });
});
