/**
 * Runs after `astro build`. It writes `dist/_headers` (security headers, the
 * CSP with a hash for every inline script Astro emitted, and cache rules),
 * drops the sitemap from non-production builds, then checks the output: every
 * page the llms.txt list names exists with a matching canonical, and pages
 * without an island ship no module script besides the shared one.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  createSiteContentSecurityPolicy,
  resolveSiteDeploymentConfig,
} from "../deployment-config.ts";

const dist = resolve(import.meta.dirname, "..", "dist");
const config = resolveSiteDeploymentConfig(process.env);

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return htmlFiles(path);
      return entry.name.endsWith(".html") ? [path] : [];
    }),
  );
  return files.flat();
}

// Executable inline scripts only; JSON-LD and other data blocks never run, so the CSP ignores them.
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const DATA_BLOCK = /\btype="(application\/ld\+json|speculationrules)"/;

function inlineScripts(html) {
  return [...html.matchAll(INLINE_SCRIPT)]
    .filter(([, attributes]) => !DATA_BLOCK.test(attributes))
    .map(([, , body]) => body);
}

function scriptHash(body) {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

function headersFile(policy) {
  const global = [
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy: same-origin",
    "Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "X-Frame-Options: DENY",
    `Content-Security-Policy: ${policy}`,
    // Same-origin link prefetch on hover; the rules file is external because the CSP allows no inline JSON.
    'Speculation-Rules: "/speculationrules.json"',
    ...(config.indexingEnabled ? [] : ["X-Robots-Tag: noindex, nofollow"]),
  ];
  // Pages already sends `public, max-age=0, must-revalidate` for HTML and purges on
  // deploy, so only non-HTML paths set Cache-Control; two matching rules would join values.
  const rules = [
    ["/*", global],
    ["/_astro/*", ["Cache-Control: public, max-age=31536000, immutable"]],
    ["/brand/*", ["Cache-Control: public, max-age=86400"]],
    ["/og/*", ["Cache-Control: public, max-age=86400"]],
    ["/sitemap.xml", ["Cache-Control: public, max-age=3600"]],
    ["/robots.txt", ["Cache-Control: public, max-age=3600"]],
    [
      "/llms.txt",
      ["Content-Type: text/plain; charset=utf-8", "Cache-Control: public, max-age=3600"],
    ],
    [
      "/llms-full.txt",
      ["Content-Type: text/plain; charset=utf-8", "Cache-Control: public, max-age=3600"],
    ],
    [
      "/speculationrules.json",
      ["Content-Type: application/speculationrules+json", "Cache-Control: public, max-age=3600"],
    ],
    ["/release.json", ["Content-Type: application/json; charset=utf-8", "Cache-Control: no-store"]],
    ["/service-worker.js", ["Cache-Control: no-cache"]],
  ];
  return `${rules.map(([path, lines]) => `${path}\n${lines.map((line) => `  ${line}`).join("\n")}`).join("\n\n")}\n`;
}

function canonicalOf(html) {
  return /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
}

async function main() {
  const failures = [];
  const pages = new Map();
  for (const file of await htmlFiles(dist))
    pages.set(relative(dist, file), await readFile(file, "utf8"));

  const hashes = new Set();
  for (const html of pages.values())
    for (const body of inlineScripts(html)) hashes.add(scriptHash(body));
  const policy = createSiteContentSecurityPolicy(config).replace(
    "script-src 'self'",
    ["script-src 'self'", ...[...hashes].sort()].join(" "),
  );
  await writeFile(join(dist, "_headers"), headersFile(policy));

  if (!config.indexingEnabled) await rm(join(dist, "sitemap.xml"), { force: true });

  // Every page llms.txt lists must exist and declare itself canonical.
  const llms = await readFile(join(dist, "llms.txt"), "utf8");
  const listed = [...llms.matchAll(/\]\((https:\/\/zoption\.site[^)]*)\)/g)].map(([, url]) => url);
  if (listed.length === 0) failures.push("llms.txt lists no pages.");
  for (const url of listed) {
    const path = new URL(url).pathname;
    const file = path === "/" ? "index.html" : `${path.slice(1)}.html`;
    const html = pages.get(file);
    if (!html) failures.push(`${url} is listed in llms.txt but ${file} was not built.`);
    else if (canonicalOf(html) !== url)
      failures.push(`${file} canonical is ${canonicalOf(html)}, not ${url}.`);
    else if (!config.indexingEnabled && !html.includes('content="noindex,nofollow"')) {
      failures.push(`${file} is indexable in a ${config.deployEnvironment} build.`);
    }
  }

  if (config.indexingEnabled) {
    const sitemap = await readFile(join(dist, "sitemap.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
    const normalized = listed.map((url) => url.replace(/\/$/, ""));
    if (locs.join("\n") !== normalized.join("\n")) {
      failures.push("sitemap.xml and llms.txt do not list the same pages in the same order.");
    }
  }

  // A page with no island runs only the shared site script; framework code there is a regression.
  for (const [file, html] of pages) {
    if (html.includes("<astro-island")) continue;
    const modules = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(
      ([, src]) => src,
    );
    if (modules.length > 1)
      failures.push(`${file} loads ${modules.length} module scripts without an island.`);
  }

  if (failures.length > 0) {
    throw new Error(`Site build verification failed:\n- ${failures.join("\n- ")}`);
  }
  console.log(
    `finalize-build: ${pages.size} pages, ${listed.length} listed routes, ${hashes.size} inline script hash(es), ${config.deployEnvironment}.`,
  );
}

await main();
