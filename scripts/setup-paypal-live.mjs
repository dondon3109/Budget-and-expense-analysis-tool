import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const LIVE_API_URL = "https://api-m.paypal.com";
const REQUEST_TIMEOUT_MS = 15_000;
const PRODUCT = {
  name: "Zoption Pro",
  type: "SERVICE",
  category: "SOFTWARE",
  description: "Zoption Pro subscription",
};
const PAYMENT_PREFERENCES = {
  auto_bill_outstanding: true,
  payment_failure_threshold: 3,
  setup_fee: { currency_code: "PHP", value: "0" },
  setup_fee_failure_action: "CANCEL",
};
const PLANS = [
  { key: "monthlyPlanId", name: "Zoption Pro Monthly", intervalUnit: "MONTH", fixedPrice: "149" },
  { key: "annualPlanId", name: "Zoption Pro Annual", intervalUnit: "YEAR", fixedPrice: "1299" },
];
const WEBHOOK_EVENT_TYPES = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
];

class LiveSetupError extends Error {
  constructor(operation, status) {
    super(operation);
    this.operation = operation;
    this.status = status;
  }
}

function requiredValue(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new LiveSetupError(`missing ${name}`);
  return value;
}

function record(value, operation) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LiveSetupError(operation);
  }
  return value;
}

function string(value, name, operation) {
  const field = value[name];
  if (typeof field !== "string" || !field) throw new LiveSetupError(operation);
  return field;
}

function positiveInteger(value, operation) {
  if (!Number.isInteger(value) || value < 0) throw new LiveSetupError(operation);
  return value;
}

function normalizedAmount(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

function sameAmount(actual, expected) {
  const normalizedActual = normalizedAmount(actual);
  return normalizedActual !== null && normalizedActual === normalizedAmount(expected);
}

function apiUrl(pathOrUrl, operation) {
  let url;
  try {
    url = new URL(pathOrUrl, LIVE_API_URL);
  } catch {
    throw new LiveSetupError(operation);
  }
  if (url.origin !== LIVE_API_URL) throw new LiveSetupError(operation);
  return url.href;
}

async function requestJson(fetchImpl, operation, pathOrUrl, init) {
  let response;
  try {
    response = await fetchImpl(apiUrl(pathOrUrl, operation), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new LiveSetupError(`${operation} (fetch: ${error?.message})`);
  }
  if (!response.ok) throw new LiveSetupError(operation, response.status);
  try {
    return await response.json();
  } catch {
    throw new LiveSetupError(operation);
  }
}

function bearerHeaders(accessTokenValue) {
  return { Authorization: `Bearer ${accessTokenValue}`, Accept: "application/json" };
}

async function accessToken(fetchImpl, clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const payload = record(
    await requestJson(fetchImpl, "requesting an OAuth token", "/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }),
    "requesting an OAuth token",
  );
  return string(payload, "access_token", "requesting an OAuth token");
}

async function listPages(fetchImpl, accessTokenValue, path, collectionName, operation) {
  const items = [];
  let page = 1;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = record(
      await requestJson(fetchImpl, operation, `${path}${separator}page_size=20&page=${page}&total_required=true`, {
        headers: bearerHeaders(accessTokenValue),
      }),
      operation,
    );
    const collection = payload[collectionName];
    if (!Array.isArray(collection)) throw new LiveSetupError(operation);
    items.push(...collection);
    const totalPages = positiveInteger(payload.total_pages, operation);
    if (page >= totalPages) return items;
    if (page >= 1_000) throw new LiveSetupError(operation);
    page += 1;
  }
}

async function productDetails(fetchImpl, accessTokenValue, productId) {
  return record(
    await requestJson(fetchImpl, "reading an existing product", `/v1/catalogs/products/${encodeURIComponent(productId)}`, {
      headers: bearerHeaders(accessTokenValue),
    }),
    "reading an existing product",
  );
}

function isExpectedProduct(product) {
  return (
    product.name === PRODUCT.name &&
    product.type === PRODUCT.type &&
    product.category === PRODUCT.category &&
    product.description === PRODUCT.description
  );
}

async function reconcileProduct(fetchImpl, accessTokenValue, apply) {
  const products = await listPages(fetchImpl, accessTokenValue, "/v1/catalogs/products", "products", "listing products");
  const candidates = products.filter((item) => record(item, "listing products").name === PRODUCT.name);
  if (candidates.length > 0) {
    const details = await Promise.all(
      candidates.map(async (candidate) =>
        productDetails(fetchImpl, accessTokenValue, string(record(candidate, "listing products"), "id", "listing products")),
      ),
    );
    if (details.length !== 1 || !isExpectedProduct(details[0])) {
      throw new LiveSetupError("reconciling an existing product");
    }
    return { id: string(details[0], "id", "reconciling an existing product"), action: "reuse" };
  }
  if (!apply) return { id: null, action: "create" };
  const payload = record(
    await requestJson(fetchImpl, "creating the product", "/v1/catalogs/products", {
      method: "POST",
      headers: { ...bearerHeaders(accessTokenValue), "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": `zoption-live-product-${randomUUID()}` },
      body: JSON.stringify(PRODUCT),
    }),
    "creating the product",
  );
  return { id: string(payload, "id", "creating the product"), action: "create" };
}

function planBody(productId, plan) {
  return {
    product_id: productId,
    name: plan.name,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: plan.intervalUnit, interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: plan.fixedPrice, currency_code: "PHP" } },
      },
    ],
    payment_preferences: PAYMENT_PREFERENCES,
  };
}

async function planDetails(fetchImpl, accessTokenValue, planId) {
  return record(
    await requestJson(fetchImpl, "reading an existing plan", `/v1/billing/plans/${encodeURIComponent(planId)}`, {
      headers: bearerHeaders(accessTokenValue),
    }),
    "reading an existing plan",
  );
}

function isExpectedPlan(plan, productId, expected) {
  const cycle = Array.isArray(plan.billing_cycles) ? plan.billing_cycles[0] : undefined;
  const frequency = record(cycle?.frequency, "reconciling an existing plan");
  const pricingScheme = record(cycle?.pricing_scheme, "reconciling an existing plan");
  const fixedPrice = record(pricingScheme.fixed_price, "reconciling an existing plan");
  const preferences = record(plan.payment_preferences, "reconciling an existing plan");
  const setupFee = record(preferences.setup_fee, "reconciling an existing plan");
  return (
    plan.product_id === productId &&
    plan.name === expected.name &&
    plan.status === "ACTIVE" &&
    Array.isArray(plan.billing_cycles) &&
    plan.billing_cycles.length === 1 &&
    cycle?.tenure_type === "REGULAR" &&
    cycle.sequence === 1 &&
    cycle.total_cycles === 0 &&
    frequency.interval_unit === expected.intervalUnit &&
    frequency.interval_count === 1 &&
    fixedPrice.currency_code === "PHP" &&
    sameAmount(fixedPrice.value, expected.fixedPrice) &&
    preferences.auto_bill_outstanding === true &&
    preferences.payment_failure_threshold === 3 &&
    setupFee.currency_code === "PHP" &&
    sameAmount(setupFee.value, "0") &&
    preferences.setup_fee_failure_action === "CANCEL"
  );
}

async function reconcilePlan(fetchImpl, accessTokenValue, productId, expected, apply) {
  const plans = await listPages(fetchImpl, accessTokenValue, "/v1/billing/plans", "plans", "listing plans");
  const candidates = plans.filter((item) => record(item, "listing plans").name === expected.name);
  if (candidates.length > 0) {
    if (candidates.length !== 1) throw new LiveSetupError("reconciling an existing plan");
    const candidate = record(candidates[0], "listing plans");
    const details = await planDetails(fetchImpl, accessTokenValue, string(candidate, "id", "listing plans"));
    if (!isExpectedPlan(details, productId, expected)) throw new LiveSetupError("reconciling an existing plan");
    return { id: string(details, "id", "reconciling an existing plan"), action: "reuse" };
  }
  if (!apply) return { id: null, action: "create" };
  const payload = record(
    await requestJson(fetchImpl, "creating a plan", "/v1/billing/plans", {
      method: "POST",
      headers: { ...bearerHeaders(accessTokenValue), "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": `zoption-live-plan-${randomUUID()}` },
      body: JSON.stringify(planBody(productId, expected)),
    }),
    "creating a plan",
  );
  return { id: string(payload, "id", "creating a plan"), action: "create" };
}

function webhookEventTypes(webhook) {
  if (!Array.isArray(webhook.event_types)) throw new LiveSetupError("reconciling a webhook");
  return webhook.event_types.map((event) => string(record(event, "reconciling a webhook"), "name", "reconciling a webhook")).sort();
}

function hasExpectedWebhookEvents(webhook) {
  return JSON.stringify(webhookEventTypes(webhook)) === JSON.stringify([...WEBHOOK_EVENT_TYPES].sort());
}

async function listWebhooks(fetchImpl, accessTokenValue) {
  const webhooks = [];
  let nextUrl = "/v1/notifications/webhooks";
  let pages = 0;
  while (nextUrl) {
    const payload = record(await requestJson(fetchImpl, "listing webhooks", nextUrl, { headers: bearerHeaders(accessTokenValue) }), "listing webhooks");
    if (!Array.isArray(payload.webhooks)) throw new LiveSetupError("listing webhooks");
    webhooks.push(...payload.webhooks);
    pages += 1;
    if (pages >= 1_000) throw new LiveSetupError("listing webhooks");
    const next = Array.isArray(payload.links) ? payload.links.find((link) => record(link, "listing webhooks").rel === "next") : undefined;
    nextUrl = next ? string(record(next, "listing webhooks"), "href", "listing webhooks") : null;
  }
  return webhooks;
}

async function reconcileWebhook(fetchImpl, accessTokenValue, webhookUrl, apply) {
  const webhooks = await listWebhooks(fetchImpl, accessTokenValue);
  const candidates = webhooks.filter((item) => record(item, "listing webhooks").url === webhookUrl);
  if (candidates.length > 1) throw new LiveSetupError("reconciling a webhook");
  if (candidates.length === 1) {
    const webhook = record(candidates[0], "reconciling a webhook");
    if (!hasExpectedWebhookEvents(webhook)) throw new LiveSetupError("reconciling a webhook");
    return { id: string(webhook, "id", "reconciling a webhook"), action: "reuse" };
  }
  if (!apply) return { id: null, action: "create" };
  const payload = record(
    await requestJson(fetchImpl, "creating a webhook", "/v1/notifications/webhooks", {
      method: "POST",
      headers: { ...bearerHeaders(accessTokenValue), "Content-Type": "application/json", "PayPal-Request-Id": `zoption-live-webhook-${randomUUID()}` },
      body: JSON.stringify({ url: webhookUrl, event_types: WEBHOOK_EVENT_TYPES.map((name) => ({ name })) }),
    }),
    "creating a webhook",
  );
  return { id: string(payload, "id", "creating a webhook"), action: "create" };
}

export async function setupPayPalLive({ env = process.env, fetchImpl = fetch, apply = false, webhookUrls = [] } = {}) {
  const clientId = requiredValue(env, "PAYPAL_CLIENT_ID");
  const clientSecret = requiredValue(env, "PAYPAL_CLIENT_SECRET");
  const accessTokenValue = await accessToken(fetchImpl, clientId, clientSecret);
  const product = await reconcileProduct(fetchImpl, accessTokenValue, apply);
  const planResults = {};
  if (product.id) {
    for (const plan of PLANS) {
      planResults[plan.key] = await reconcilePlan(fetchImpl, accessTokenValue, product.id, plan, apply);
    }
  } else {
    for (const plan of PLANS) planResults[plan.key] = { id: null, action: "create" };
  }
  const webhookResults = {};
  for (const url of webhookUrls) {
    webhookResults[url] = await reconcileWebhook(fetchImpl, accessTokenValue, url, apply);
  }
  return {
    mode: apply ? "apply" : "preflight",
    productId: product.id,
    monthlyPlanId: planResults.monthlyPlanId.id,
    annualPlanId: planResults.annualPlanId.id,
    webhooks: Object.fromEntries(
      Object.entries(webhookResults).map(([url, result]) => [url, { id: result.id, action: result.action }]),
    ),
    actions: {
      product: product.action,
      monthlyPlan: planResults.monthlyPlanId.action,
      annualPlan: planResults.annualPlanId.action,
      ...Object.fromEntries(Object.entries(webhookResults).map(([url, result]) => [`webhook:${url}`, result.action])),
    },
  };
}

function cliOptions(argv) {
  const webhookUrls = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--webhook") {
      const value = argv[i + 1];
      if (!value) throw new LiveSetupError("reading command-line options");
      webhookUrls.push(value);
      i += 1;
    } else if (argv[i] === "--apply" || argv[i] === "--json") {
      // recognized
    } else {
      throw new LiveSetupError("reading command-line options");
    }
  }
  return { apply: argv.includes("--apply"), json: argv.includes("--json"), webhookUrls };
}

async function run() {
  try {
    const options = cliOptions(process.argv.slice(2));
    const result = await setupPayPalLive({ apply: options.apply, webhookUrls: options.webhookUrls });
    const output = JSON.stringify(result, null, options.json ? 2 : 0);
    console.log(output);
  } catch (error) {
    if (error instanceof LiveSetupError) {
      const status = typeof error.status === "number" ? ` (HTTP ${error.status})` : "";
      console.error(`PayPal LIVE setup failed while ${error.operation}${status}.`);
    } else {
      console.error("PayPal LIVE setup failed.");
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await run();
}
