const webUrl = requiredUrl("WEB_URL");
const apiUrl = requiredUrl("API_URL");
const origin = new URL(webUrl).origin;

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value.replace(/\/$/, "");
}

async function expectResponse(label, url, init, validate) {
  const response = await fetch(url, init);
  await validate(response);
  console.log(`✓ ${label}`);
}

const apiHeaders = { Origin: origin };

await expectResponse("landing page", webUrl, undefined, async (response) => {
  if (!response.ok) throw new Error(`Landing page failed with HTTP ${response.status}.`);
  const html = await response.text();
  if (!html.includes("Clarity")) throw new Error("Landing page did not contain the app title.");
});

await expectResponse(
  "API health and D1 readiness",
  `${apiUrl}/health`,
  undefined,
  async (response) => {
    if (!response.ok) throw new Error(`Health check failed with HTTP ${response.status}.`);
    const body = await response.json();
    if (body.status !== "ok") throw new Error("Health response was not ready.");
  },
);

await expectResponse(
  "retired public dashboard",
  `${apiUrl}/api/demo/dashboard?from=2026-07-01&to=2026-07-31`,
  { headers: apiHeaders },
  async (response) => {
    if (response.status !== 404) {
      throw new Error(`Retired public dashboard returned HTTP ${response.status} instead of 404.`);
    }
  },
);

await expectResponse(
  "private API rejects anonymous access",
  `${apiUrl}/api/app/dashboard?from=2026-07-01&to=2026-07-31`,
  { headers: apiHeaders },
  async (response) => {
    if (response.status !== 401) {
      throw new Error(`Private API returned HTTP ${response.status} instead of 401.`);
    }
    const body = await response.json();
    if (body.error !== "authentication_required") {
      throw new Error("Private API did not return the expected authentication error.");
    }
  },
);

await expectResponse(
  "authenticated CORS preflight",
  `${apiUrl}/api/app/transactions`,
  {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  },
  async (response) => {
    if (response.status !== 204) throw new Error(`Preflight failed with HTTP ${response.status}.`);
    const allowed = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
    if (!allowed.includes("authorization") || !allowed.includes("content-type")) {
      throw new Error("Preflight did not allow authenticated JSON requests.");
    }
  },
);

console.log("Production smoke checks passed without changing financial records.");
