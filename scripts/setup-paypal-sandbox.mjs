import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const PAYPAL_SANDBOX_API_URL = "https://api-m.sandbox.paypal.com";
const PREVIEW_WEBHOOK_URL =
  "https://budget-expense-api-preview.dondon3109.workers.dev/api/billing/paypal/webhook";
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
  {
    key: "monthlyPlanId",
    name: "Zoption Pro Monthly",
    intervalUnit: "MONTH",
    fixedPrice: "149",
  },
  {
    key: "annualPlanId",
    name: "Zoption Pro Annual",
    intervalUnit: "YEAR",
    fixedPrice: "1299",
  },
];
const WEBHOOK_EVENT_TYPES = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
];

class SandboxSetupError extends Error {
  constructor(operation, status) {
    super(operation);
    this.operation = operation;
    this.status = status;
  }
}

function requiredValue(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new SandboxSetupError(`missing ${name}`);
  return value;
}

function validatedWebhookUrl(env) {
  const value = requiredValue(env, "PAYPAL_WEBHOOK_URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SandboxSetupError("validating PAYPAL_WEBHOOK_URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.href !== PREVIEW_WEBHOOK_URL
  ) {
    throw new SandboxSetupError("validating PAYPAL_WEBHOOK_URL");
  }
  return url.href;
}

function record(value, operation) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SandboxSetupError(operation);
  }
  return value;
}

function string(value, name, operation) {
  const field = value[name];
  if (typeof field !== "string" || !field) throw new SandboxSetupError(operation);
  return field;
}

function positiveInteger(value, operation) {
  if (!Number.isInteger(value) || value < 0) throw new SandboxSetupError(operation);
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

function sandboxUrl(pathOrUrl, operation) {
  let url;
  try {
    url = new URL(pathOrUrl, PAYPAL_SANDBOX_API_URL);
  } catch {
    throw new SandboxSetupError(operation);
  }
  if (url.origin !== PAYPAL_SANDBOX_API_URL) throw new SandboxSetupError(operation);
  return url.href;
}

async function requestJson(fetchImpl, operation, pathOrUrl, init) {
  let response;
  try {
    response = await fetchImpl(sandboxUrl(pathOrUrl, operation), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SandboxSetupError(operation);
  }

  if (!response.ok) throw new SandboxSetupError(operation, response.status);

  try {
    return await response.json();
  } catch {
    throw new SandboxSetupError(operation);
  }
}

function bearerHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
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
      await requestJson(
        fetchImpl,
        operation,
        `${path}${separator}page_size=20&page=${page}&total_required=true`,
        { headers: bearerHeaders(accessTokenValue) },
      ),
      operation,
    );
    const collection = payload[collectionName];
    if (!Array.isArray(collection)) throw new SandboxSetupError(operation);
    items.push(...collection);

    const totalPages = positiveInteger(payload.total_pages, operation);
    if (page >= totalPages) return items;
    if (page >= 1_000) throw new SandboxSetupError(operation);
    page += 1;
  }
}

async function productDetails(fetchImpl, accessTokenValue, productId) {
  return record(
    await requestJson(
      fetchImpl,
      "reading an existing product",
      `/v1/catalogs/products/${encodeURIComponent(productId)}`,
      { headers: bearerHeaders(accessTokenValue) },
    ),
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

async function reconcileProduct(fetchImpl, accessTokenValue, randomUuid, apply) {
  const products = await listPages(
    fetchImpl,
    accessTokenValue,
    "/v1/catalogs/products",
    "products",
    "listing products",
  );
  const candidates = products.filter(
    (item) => record(item, "listing products").name === PRODUCT.name,
  );

  if (candidates.length > 0) {
    const details = await Promise.all(
      candidates.map(async (candidate) => {
        const product = record(candidate, "listing products");
        return productDetails(
          fetchImpl,
          accessTokenValue,
          string(product, "id", "listing products"),
        );
      }),
    );
    if (details.length !== 1 || !isExpectedProduct(details[0])) {
      throw new SandboxSetupError("reconciling an existing product");
    }
    return {
      id: string(details[0], "id", "reconciling an existing product"),
      action: "reuse",
    };
  }

  if (!apply) return { id: null, action: "create" };

  const payload = record(
    await requestJson(fetchImpl, "creating the product", "/v1/catalogs/products", {
      method: "POST",
      headers: {
        ...bearerHeaders(accessTokenValue),
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "PayPal-Request-Id": `zoption-sandbox-product-${randomUuid()}`,
      },
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
        pricing_scheme: {
          fixed_price: { value: plan.fixedPrice, currency_code: "PHP" },
        },
      },
    ],
    payment_preferences: PAYMENT_PREFERENCES,
  };
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

async function planDetails(fetchImpl, accessTokenValue, planId) {
  return record(
    await requestJson(
      fetchImpl,
      "reading an existing plan",
      `/v1/billing/plans/${encodeURIComponent(planId)}`,
      { headers: bearerHeaders(accessTokenValue) },
    ),
    "reading an existing plan",
  );
}

async function reconcilePlan(fetchImpl, accessTokenValue, productId, expected, randomUuid, apply) {
  const plans = await listPages(
    fetchImpl,
    accessTokenValue,
    `/v1/billing/plans?product_id=${encodeURIComponent(productId)}`,
    "plans",
    "listing plans",
  );
  const candidates = plans.filter((item) => record(item, "listing plans").name === expected.name);

  if (candidates.length > 0) {
    if (candidates.length !== 1) throw new SandboxSetupError("reconciling an existing plan");
    const candidate = record(candidates[0], "listing plans");
    const details = await planDetails(
      fetchImpl,
      accessTokenValue,
      string(candidate, "id", "listing plans"),
    );
    if (!isExpectedPlan(details, productId, expected)) {
      throw new SandboxSetupError("reconciling an existing plan");
    }
    return { id: string(details, "id", "reconciling an existing plan"), action: "reuse" };
  }

  if (!apply) return { id: null, action: "create" };

  const payload = record(
    await requestJson(fetchImpl, "creating a plan", "/v1/billing/plans", {
      method: "POST",
      headers: {
        ...bearerHeaders(accessTokenValue),
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "PayPal-Request-Id": `zoption-sandbox-plan-${randomUuid()}`,
      },
      body: JSON.stringify(planBody(productId, expected)),
    }),
    "creating a plan",
  );
  return { id: string(payload, "id", "creating a plan"), action: "create" };
}

function webhookEventTypes(webhook) {
  if (!Array.isArray(webhook.event_types)) {
    throw new SandboxSetupError("reconciling the Preview webhook");
  }
  return webhook.event_types
    .map((event) =>
      string(
        record(event, "reconciling the Preview webhook"),
        "name",
        "reconciling the Preview webhook",
      ),
    )
    .sort();
}

function hasExpectedWebhookEvents(webhook) {
  return (
    JSON.stringify(webhookEventTypes(webhook)) === JSON.stringify([...WEBHOOK_EVENT_TYPES].sort())
  );
}

async function listWebhooks(fetchImpl, accessTokenValue) {
  const operation = "listing webhooks";
  const webhooks = [];
  let nextUrl = "/v1/notifications/webhooks";
  let pages = 0;

  while (nextUrl) {
    const payload = record(
      await requestJson(fetchImpl, operation, nextUrl, {
        headers: bearerHeaders(accessTokenValue),
      }),
      operation,
    );
    if (!Array.isArray(payload.webhooks)) throw new SandboxSetupError(operation);
    webhooks.push(...payload.webhooks);
    pages += 1;
    if (pages >= 1_000) throw new SandboxSetupError(operation);

    const next = Array.isArray(payload.links)
      ? payload.links.find((link) => record(link, operation).rel === "next")
      : undefined;
    nextUrl = next ? string(record(next, operation), "href", operation) : null;
  }

  return webhooks;
}

async function reconcileWebhook(fetchImpl, accessTokenValue, webhookUrl, randomUuid, apply) {
  const webhooks = await listWebhooks(fetchImpl, accessTokenValue);
  const candidates = webhooks.filter((item) => record(item, "listing webhooks").url === webhookUrl);

  if (candidates.length > 1) {
    throw new SandboxSetupError("reconciling the Preview webhook");
  }
  if (candidates.length === 1) {
    const webhook = record(candidates[0], "reconciling the Preview webhook");
    if (!hasExpectedWebhookEvents(webhook)) {
      throw new SandboxSetupError("reconciling the Preview webhook");
    }
    return {
      id: string(webhook, "id", "reconciling the Preview webhook"),
      action: "reuse",
    };
  }

  if (!apply) return { id: null, action: "create" };

  const payload = record(
    await requestJson(fetchImpl, "creating the Preview webhook", "/v1/notifications/webhooks", {
      method: "POST",
      headers: {
        ...bearerHeaders(accessTokenValue),
        "Content-Type": "application/json",
        "PayPal-Request-Id": `zoption-sandbox-webhook-${randomUuid()}`,
      },
      body: JSON.stringify({
        url: webhookUrl,
        event_types: WEBHOOK_EVENT_TYPES.map((name) => ({ name })),
      }),
    }),
    "creating the Preview webhook",
  );
  return { id: string(payload, "id", "creating the Preview webhook"), action: "create" };
}

export async function setupPayPalSandbox({
  env = process.env,
  fetchImpl = fetch,
  randomUuid = randomUUID,
  apply = false,
} = {}) {
  const clientId = requiredValue(env, "PAYPAL_CLIENT_ID");
  const clientSecret = requiredValue(env, "PAYPAL_CLIENT_SECRET");
  const webhookUrl = validatedWebhookUrl(env);
  const accessTokenValue = await accessToken(fetchImpl, clientId, clientSecret);
  const product = await reconcileProduct(fetchImpl, accessTokenValue, randomUuid, apply);

  const planResults = {};
  if (product.id) {
    for (const plan of PLANS) {
      planResults[plan.key] = await reconcilePlan(
        fetchImpl,
        accessTokenValue,
        product.id,
        plan,
        randomUuid,
        apply,
      );
    }
  } else {
    for (const plan of PLANS) planResults[plan.key] = { id: null, action: "create" };
  }

  const webhook = await reconcileWebhook(
    fetchImpl,
    accessTokenValue,
    webhookUrl,
    randomUuid,
    apply,
  );

  return {
    mode: apply ? "apply" : "preflight",
    productId: product.id,
    monthlyPlanId: planResults.monthlyPlanId.id,
    annualPlanId: planResults.annualPlanId.id,
    webhookId: webhook.id,
    actions: {
      product: product.action,
      monthlyPlan: planResults.monthlyPlanId.action,
      annualPlan: planResults.annualPlanId.action,
      webhook: webhook.action,
    },
  };
}

export function formatSetupResult(result) {
  const lines = [
    `Mode: ${result.mode}`,
    `Product: ${result.actions.product}`,
    `Monthly plan: ${result.actions.monthlyPlan}`,
    `Annual plan: ${result.actions.annualPlan}`,
    `Preview webhook: ${result.actions.webhook}`,
  ];
  if (result.productId) lines.push(`Product ID: ${result.productId}`);
  if (result.monthlyPlanId) lines.push(`Monthly plan ID: ${result.monthlyPlanId}`);
  if (result.annualPlanId) lines.push(`Annual plan ID: ${result.annualPlanId}`);
  return lines.join("\n");
}

export function machineSetupResult(result) {
  return JSON.stringify({
    mode: result.mode,
    product_id: result.productId,
    monthly_plan_id: result.monthlyPlanId,
    annual_plan_id: result.annualPlanId,
    webhook_id: result.webhookId,
    actions: result.actions,
  });
}

function cliOptions(argv) {
  const supported = new Set(["--apply", "--json"]);
  const unknown = argv.filter((argument) => !supported.has(argument));
  if (unknown.length > 0) throw new SandboxSetupError("reading command-line options");
  return { apply: argv.includes("--apply"), json: argv.includes("--json") };
}

async function run() {
  try {
    const options = cliOptions(process.argv.slice(2));
    const result = await setupPayPalSandbox({ apply: options.apply });
    console.log(options.json ? machineSetupResult(result) : formatSetupResult(result));
  } catch (error) {
    if (error instanceof SandboxSetupError) {
      const status = typeof error.status === "number" ? ` (HTTP ${error.status})` : "";
      console.error(`PayPal Sandbox setup failed while ${error.operation}${status}.`);
    } else {
      console.error("PayPal Sandbox setup failed.");
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await run();
}
