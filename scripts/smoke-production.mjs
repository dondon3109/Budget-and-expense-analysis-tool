const webUrl = requiredUrl("WEB_URL");
const apiUrl = requiredUrl("API_URL");
const from = process.env.SMOKE_FROM ?? "2026-07-01";
const to = process.env.SMOKE_TO ?? "2026-07-31";
const origin = new URL(webUrl).origin;

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value.replace(/\/$/, "");
}

async function expectResponse(label, url, init, validate) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  await validate(response);
  console.log(`✓ ${label}`);
}

const apiHeaders = { Origin: origin };

await expectResponse("landing page", webUrl, undefined, async (response) => {
  const html = await response.text();
  if (!html.includes("Clarity")) throw new Error("Landing page did not contain the app title.");
});

await expectResponse(
  "API health and D1 readiness",
  `${apiUrl}/health`,
  undefined,
  async (response) => {
    const body = await response.json();
    if (body.status !== "ok") throw new Error("Health response was not ready.");
  },
);

await expectResponse(
  "dashboard data",
  `${apiUrl}/api/dashboard?from=${from}&to=${to}`,
  { headers: apiHeaders },
  async (response) => {
    const body = await response.json();
    if (body.currency !== "PHP" || !body.metrics) {
      throw new Error("Dashboard response did not match the expected contract.");
    }
    if (response.headers.get("access-control-allow-origin") !== origin) {
      throw new Error("Dashboard CORS response did not allow the deployed web origin.");
    }
  },
);

await expectResponse(
  "filtered CSV export",
  `${apiUrl}/api/exports/transactions.csv?from=${from}&to=${to}&sortBy=date&sortDirection=asc`,
  { headers: apiHeaders },
  async (response) => {
    const csv = await response.text();
    if (!response.headers.get("content-type")?.includes("text/csv")) {
      throw new Error("Export did not return CSV content.");
    }
    if (!csv.startsWith("Date,Description,Amount,Currency,Type,Category,Account,Notes")) {
      throw new Error("Export header did not match the documented format.");
    }
  },
);

await expectResponse(
  "read-only import preview",
  `${apiUrl}/api/imports/preview`,
  {
    method: "POST",
    headers: { ...apiHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: "production-smoke.csv",
      csvText:
        "Date,Description,Amount,Currency,Type,Category\n2026-07-01,Smoke check,-1.00,USD,expense,Unknown",
      mapping: {
        date: "Date",
        description: "Description",
        amount: "Amount",
        currency: "Currency",
        kind: "Type",
        category: "Category",
      },
    }),
  },
  async (response) => {
    const body = await response.json();
    if (body.acceptedCount !== 0 || body.rejectedCount !== 1) {
      throw new Error("Import preview did not reject the intentionally invalid row.");
    }
  },
);

console.log("Production smoke checks passed without changing financial records.");
