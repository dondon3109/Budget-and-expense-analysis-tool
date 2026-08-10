/// <reference types="node" />

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

interface CachePolicyModule {
  PRECACHE_URLS: readonly string[];
  isCacheableResponse(response: Response): boolean;
  isSafePublicNavigation(request: Request, appOrigin: string): boolean;
  isSensitiveRequest(request: Request, appOrigin: string): boolean;
  isStaticAssetRequest(request: Request, appOrigin: string): boolean;
}

const publicDirectory = new URL("../public/", import.meta.url);

async function loadCachePolicy(): Promise<CachePolicyModule> {
  const path = new URL("pwa/cache-policy.js", publicDirectory);
  return (await import(pathToFileURL(path.pathname).href)) as CachePolicyModule;
}

function request(url: string, options: Partial<Request> = {}): Request {
  return {
    method: "GET",
    mode: "cors",
    headers: new Headers(),
    url,
    ...options,
  } as Request;
}

describe("PWA foundation", () => {
  it("publishes a complete manifest with branded any and maskable icons", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("manifest.webmanifest", publicDirectory), "utf8"),
    ) as {
      id?: string;
      name?: string;
      short_name?: string;
      description?: string;
      start_url?: string;
      scope?: string;
      display?: string;
      theme_color?: string;
      background_color?: string;
      categories?: string[];
      prefer_related_applications?: boolean;
      icons?: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    expect(manifest).toMatchObject({
      id: "/",
      name: "Zoption",
      short_name: "Zoption",
      start_url: "/app",
      scope: "/",
      display: "standalone",
      prefer_related_applications: false,
    });
    expect(manifest.description).toMatch(/private budgeting workspace/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.categories).toEqual(expect.arrayContaining(["finance", "productivity"]));
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "192x192", purpose: "maskable" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );

    for (const icon of manifest.icons ?? []) {
      await expect(readFile(new URL(icon.src.slice(1), publicDirectory))).resolves.not.toHaveLength(
        0,
      );
    }
  });

  it("references the manifest and service-worker registration without privileged data", async () => {
    const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const registration = await readFile(
      new URL("../src/pwa/registerServiceWorker.ts", import.meta.url),
      "utf8",
    );

    expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(index).toContain('name="theme-color"');
    expect(registration).toContain('register("/service-worker.js"');
    expect(registration).toContain('type: "module"');
    expect(registration).not.toMatch(/service[_-]?role|private[_-]?key/i);
  });

  it("keeps sensitive traffic network-only and limits caches to explicit paths", async () => {
    const policy = await loadCachePolicy();
    const origin = "https://zoption.site";

    for (const sensitive of [
      request(`${origin}/api/app/transactions`),
      request(`${origin}/app/budgets`, { mode: "navigate" }),
      request(`${origin}/auth/callback?code=secret`, { mode: "navigate" }),
      request(`${origin}/login`, { mode: "navigate" }),
      request(`${origin}/api/app/imports/commit`, { method: "POST" }),
      request("https://project.supabase.co/auth/v1/token"),
      request("https://www.google-analytics.com/g/collect"),
    ]) {
      expect(policy.isSensitiveRequest(sensitive, origin)).toBe(true);
      expect(policy.isStaticAssetRequest(sensitive, origin)).toBe(false);
      expect(policy.isSafePublicNavigation(sensitive, origin)).toBe(false);
    }

    expect(policy.isStaticAssetRequest(request(`${origin}/assets/index.abc123.js`), origin)).toBe(
      true,
    );
    expect(
      policy.isStaticAssetRequest(request(`${origin}/brand/zoption-mark-512.png`), origin),
    ).toBe(true);
    expect(policy.isStaticAssetRequest(request(`${origin}/user-avatar.png`), origin)).toBe(false);
    expect(
      policy.isSafePublicNavigation(request(`${origin}/install`, { mode: "navigate" }), origin),
    ).toBe(true);
    expect(
      policy.isSafePublicNavigation(
        request(`${origin}/?code=secret`, { mode: "navigate" }),
        origin,
      ),
    ).toBe(false);
    expect(policy.PRECACHE_URLS).not.toEqual(expect.arrayContaining(["/app", "/api"]));
  });

  it("refuses private, no-store, wildcard-vary, failed, and opaque responses", async () => {
    const policy = await loadCachePolicy();
    expect(policy.isCacheableResponse(new Response("ok"))).toBe(true);
    expect(
      policy.isCacheableResponse(
        new Response("private", { headers: { "Cache-Control": "private" } }),
      ),
    ).toBe(false);
    expect(
      policy.isCacheableResponse(
        new Response("no store", { headers: { "Cache-Control": "no-store" } }),
      ),
    ).toBe(false);
    expect(policy.isCacheableResponse(new Response("vary", { headers: { Vary: "*" } }))).toBe(
      false,
    );
    expect(policy.isCacheableResponse(new Response("error", { status: 500 }))).toBe(false);
    expect(
      policy.isCacheableResponse({ ok: true, type: "opaque", headers: new Headers() } as Response),
    ).toBe(false);
  });

  it("uses a conservative worker lifecycle without forced activation or reload", async () => {
    const worker = await readFile(new URL("service-worker.js", publicDirectory), "utf8");
    expect(worker).toContain('self.addEventListener("install"');
    expect(worker).toContain('self.addEventListener("fetch"');
    expect(worker).toContain("isSensitiveRequest(request, appOrigin)");
    expect(worker).not.toContain("skipWaiting");
    expect(worker).toContain("clients.claim");
    expect(worker).not.toMatch(/location\.reload/);
  });
});
