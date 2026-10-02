/**
 * Tells Bing and other IndexNow engines which public URLs to recrawl. Reads the live sitemap so the
 * list always matches what is deployed. The key is public by design: IndexNow verifies it by
 * fetching `apps/site/public/<key>.txt` from the host.
 */
import { pathToFileURL } from "node:url";

export const INDEXNOW_KEY = "f5c64240721195163af5a0371f83e9dc";
export const SITE_ORIGIN = "https://zoption.site";
const ENDPOINT = "https://api.indexnow.org/indexnow";

export function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
}

export function indexNowPayload(urls) {
  return {
    host: new URL(SITE_ORIGIN).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
}

async function main() {
  const sitemap = await fetch(`${SITE_ORIGIN}/sitemap.xml`);
  if (!sitemap.ok) throw new Error(`sitemap.xml returned ${sitemap.status}.`);
  const urls = sitemapUrls(await sitemap.text());
  if (urls.length === 0) throw new Error("sitemap.xml lists no URLs.");

  const keyFile = await fetch(`${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`);
  if ((await keyFile.text()).trim() !== INDEXNOW_KEY) {
    throw new Error("The IndexNow key file is not served from the site.");
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowPayload(urls)),
  });
  // 200 accepted, 202 accepted pending key validation.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow returned ${response.status}: ${await response.text()}`);
  }
  console.log(`IndexNow accepted ${urls.length} URLs (${response.status}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
