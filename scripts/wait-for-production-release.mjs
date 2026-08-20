import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { fetchFrontendScriptGraph } from "./deployment-smoke-helpers.mjs";

export function matchesDeploymentMarker(marker, expectedVersion) {
  return typeof marker === "object" && marker !== null && marker.appVersion === expectedVersion;
}

async function main() {
  const webUrl = process.env.WEB_URL?.trim().replace(/\/$/, "");
  const expectedVersion = process.env.EXPECTED_RELEASE_VERSION?.trim();
  if (!webUrl || !expectedVersion) {
    throw new Error("WEB_URL and EXPECTED_RELEASE_VERSION are required.");
  }

  const markerUrl = `${webUrl}/release.json`;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(markerUrl, { cache: "no-store" });
      if (response.ok && matchesDeploymentMarker(await response.json(), expectedVersion)) {
        const homeResponse = await fetch(`${webUrl}/?release_probe=${attempt}`, {
          cache: "no-store",
        });
        if (!homeResponse.ok) {
          throw new Error(`Production landing page failed with HTTP ${homeResponse.status}.`);
        }
        await fetchFrontendScriptGraph(await homeResponse.text(), webUrl);
        console.log(`Production Pages is serving v${expectedVersion}.`);
        return;
      }
    } catch (error) {
      if (attempt === 30) throw error;
    }
    if (attempt < 30) await delay(5_000);
  }
  throw new Error(`Production Pages did not serve v${expectedVersion} within 150 seconds.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
