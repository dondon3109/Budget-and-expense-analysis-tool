#!/usr/bin/env node
/**
 * Seeds a local D1 workspace with realistic financial data so the authenticated
 * screens can be reviewed with real content instead of empty states.
 *
 * Usage (from the repo root):
 *   node scripts/seed-local-workspace.mjs --user <supabase-user-uuid>
 *   node scripts/seed-local-workspace.mjs --user <uuid> --months 6
 *   node scripts/seed-local-workspace.mjs --user <uuid> --reset
 *
 * The API bootstraps a tenant, its three system accounts and its ten starter
 * categories on the first authenticated request (apps/api/src/db/tenants.ts,
 * tenantResolver.resolve -> tenantBootstrapRepository.bootstrap). This script
 * mirrors those exact ids, so it is safe to run either before or after that first
 * request: every write is INSERT OR IGNORE against a deterministic id.
 *
 * Everything it creates is prefixed with 'seed:' so --reset removes only what this
 * script made and never touches data you created by hand.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSignedAmount, parseAmountToMinor } from "../packages/shared/src/money.ts";

const API_DIR = new URL("../apps/api/", import.meta.url).pathname;
const SEED_PREFIX = "seed:";

// Mirrors apps/api/src/db/tenants.ts. Keep in step with that file.
const SYSTEM_ACCOUNTS = [
  { suffix: "default", name: "Cash", type: "cash", systemKey: "account:cash" },
  { suffix: "bank", name: "Bank", type: "checking", systemKey: "account:bank" },
  { suffix: "gcash", name: "GCash", type: "other", systemKey: "account:gcash" },
];

const STARTER_CATEGORIES = [
  {
    key: "salary",
    name: "Salary",
    kind: "income",
    color: "#2a78d6",
    iconEmoji: "💼",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "housing",
    name: "Housing",
    kind: "expense",
    color: "#008300",
    iconEmoji: "🏠",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "food",
    name: "Food & dining",
    kind: "expense",
    color: "#e87ba4",
    iconEmoji: "🍔",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "transport",
    name: "Transport",
    kind: "expense",
    color: "#eda100",
    iconEmoji: "🚗",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "utilities",
    name: "Utilities",
    kind: "expense",
    color: "#1baf7a",
    iconEmoji: "💡",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "leisure",
    name: "Leisure",
    kind: "expense",
    color: "#eb6834",
    iconEmoji: "🎁",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "savings-transfer",
    name: "Savings transfer",
    kind: "transfer",
    color: "#4a3aa7",
    iconEmoji: "💰",
    systemKey: null,
    origin: "starter",
  },
  {
    key: "uncategorized-income",
    name: "Uncategorized",
    kind: "income",
    color: "#6b7280",
    iconEmoji: null,
    systemKey: "uncategorized:income",
    origin: "system",
  },
  {
    key: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#6b7280",
    iconEmoji: null,
    systemKey: "uncategorized:expense",
    origin: "system",
  },
  {
    key: "uncategorized-transfer",
    name: "Uncategorized",
    kind: "transfer",
    color: "#6b7280",
    iconEmoji: null,
    systemKey: "uncategorized:transfer",
    origin: "system",
  },
];

function parseArgs(argv) {
  const args = { user: undefined, months: 3, reset: false, db: "budget-expense-local" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--user") args.user = argv[++i];
    else if (arg === "--months") args.months = Number(argv[++i]);
    else if (arg === "--db") args.db = argv[++i];
    else if (arg === "--reset") args.reset = true;
  }
  if (!args.user) {
    console.error(
      "Missing --user <supabase-user-uuid>. Pass the UUID of the account you sign in with.",
    );
    process.exit(1);
  }
  if (!/^[0-9a-f-]{36}$/i.test(args.user)) {
    console.error(`--user must be a UUID, received "${args.user}".`);
    process.exit(1);
  }
  if (!Number.isInteger(args.months) || args.months < 1 || args.months > 24) {
    console.error("--months must be a whole number between 1 and 24.");
    process.exit(1);
  }
  return args;
}

const sqlString = (value) => (value === null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

function runSql(db, sql) {
  const dir = mkdtempSync(join(tmpdir(), "zoption-seed-"));
  const file = join(dir, "seed.sql");
  writeFileSync(file, sql, "utf8");
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", db, "--local", `--file=${file}`, "--yes"], {
      cwd: API_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function queryScalar(db, sql) {
  const dir = mkdtempSync(join(tmpdir(), "zoption-seed-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, sql, "utf8");
  try {
    const out = execFileSync(
      "npx",
      ["wrangler", "d1", "execute", db, "--local", `--file=${file}`, "--json"],
      { cwd: API_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const start = out.indexOf("[");
    const parsed = JSON.parse(out.slice(start));
    const rows = parsed[0]?.results ?? [];
    return rows[0] ? Object.values(rows[0])[0] : 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SEED_SUBSCRIPTIONS = [
  { id: "spotify", name: "Spotify Premium", amount: "149", day: 4, cycle: "monthly" },
  { id: "netflix", name: "Netflix Standard", amount: "549", day: 11, cycle: "monthly" },
  { id: "icloud", name: "iCloud+ 200GB", amount: "149", day: 22, cycle: "monthly" },
];

const iso = (date) => date.toISOString().slice(0, 10);
const monthStart = (date) => `${iso(date).slice(0, 7)}-01`;

function buildSql(userId, months) {
  const tenantId = `user:${userId}`;
  const accountId = (suffix) =>
    suffix === "default" ? `${tenantId}:account:default` : `${tenantId}:account:${suffix}`;
  const categoryId = (key) => `${tenantId}:category:${key}`;
  const seedId = (...parts) => `${SEED_PREFIX}${userId}:${parts.join(":")}`;

  const lines = [];
  const statement = (sql) => lines.push(`${sql};`);

  statement("PRAGMA foreign_keys = ON");

  // --- tenant + membership, mirroring the API bootstrap ---------------------
  statement(
    `INSERT OR IGNORE INTO tenants (id, kind, name) VALUES (${sqlString(tenantId)}, 'user', 'Personal budget')`,
  );
  statement(
    `INSERT OR IGNORE INTO user_tenants (user_id, tenant_id) VALUES (${sqlString(userId)}, ${sqlString(tenantId)})`,
  );

  for (const account of SYSTEM_ACCOUNTS) {
    statement(
      `INSERT OR IGNORE INTO accounts (id, tenant_id, name, type, currency, system_key) VALUES (` +
        `${sqlString(accountId(account.suffix))}, ${sqlString(tenantId)}, ${sqlString(account.name)}, ` +
        `${sqlString(account.type)}, 'PHP', ${sqlString(account.systemKey)})`,
    );
  }

  for (const category of STARTER_CATEGORIES) {
    statement(
      `INSERT OR IGNORE INTO categories (id, tenant_id, name, kind, color, icon_emoji, system_key, origin, required_plan) VALUES (` +
        `${sqlString(categoryId(category.key))}, ${sqlString(tenantId)}, ${sqlString(category.name)}, ` +
        `${sqlString(category.kind)}, ${sqlString(category.color)}, ${sqlString(category.iconEmoji)}, ` +
        `${sqlString(category.systemKey)}, ${sqlString(category.origin)}, 'free')`,
    );
  }

  // --- transactions across the trailing months -----------------------------
  let txn = 0;
  const addTransaction = ({ date, description, amount, kind, category, account, notes = null }) => {
    txn += 1;
    // Stored amounts are signed like the API's: income positive, expenses and outgoing
    // transfers negative.
    const magnitude = parseAmountToMinor(amount);
    const amountMinor = kind === "transfer" ? -magnitude : normalizeSignedAmount(magnitude, kind);
    statement(
      `INSERT OR IGNORE INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, notes, source_kind) VALUES (` +
        `${sqlString(seedId("txn", txn))}, ${sqlString(tenantId)}, ${sqlString(accountId(account))}, ` +
        `${sqlString(categoryId(category))}, ${sqlString(date)}, ${sqlString(description)}, ${amountMinor}, ` +
        `'PHP', ${sqlString(kind)}, ${sqlString(notes)}, 'manual')`,
    );
  };

  const today = new Date();
  for (let back = months - 1; back >= 0; back -= 1) {
    const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const isCurrentMonth = back === 0;
    const day = (d) => iso(new Date(Date.UTC(year, month, d)));

    // Income on the 15th and the last day of the month.
    addTransaction({
      date: day(15),
      description: "Salary — first half",
      amount: "22500",
      kind: "income",
      category: "salary",
      account: "bank",
    });
    if (!isCurrentMonth) {
      addTransaction({
        date: day(28),
        description: "Salary — second half",
        amount: "22500",
        kind: "income",
        category: "salary",
        account: "bank",
      });
    }

    addTransaction({
      date: day(1),
      description: "Rent",
      amount: "12000",
      kind: "expense",
      category: "housing",
      account: "bank",
    });
    addTransaction({
      date: day(5),
      description: "Robinsons Supermarket",
      amount: "3420.50",
      kind: "expense",
      category: "food",
      account: "gcash",
    });
    addTransaction({
      date: day(12),
      description: "SM Groceries",
      amount: "2180",
      kind: "expense",
      category: "food",
      account: "gcash",
      notes: "Weekly run",
    });
    addTransaction({
      date: day(19),
      description: "Jollibee",
      amount: "465",
      kind: "expense",
      category: "food",
      account: "default",
    });
    addTransaction({
      date: day(8),
      description: "Meralco",
      amount: "2840.75",
      kind: "expense",
      category: "utilities",
      account: "bank",
    });
    addTransaction({
      date: day(9),
      description: "PLDT Fiber",
      amount: "1699",
      kind: "expense",
      category: "utilities",
      account: "bank",
    });
    addTransaction({
      date: day(3),
      description: "Jeepney and MRT",
      amount: "320",
      kind: "expense",
      category: "transport",
      account: "default",
    });
    addTransaction({
      date: day(16),
      description: "Grab to BGC",
      amount: "585",
      kind: "expense",
      category: "transport",
      account: "gcash",
    });
    addTransaction({
      date: day(21),
      description: "Cinema",
      amount: "780",
      kind: "expense",
      category: "leisure",
      account: "gcash",
    });
    addTransaction({
      date: day(24),
      description: "Coffee with friends",
      amount: "640",
      kind: "expense",
      category: "leisure",
      account: "default",
    });

    if (!isCurrentMonth) {
      addTransaction({
        date: day(28),
        description: "Transfer to savings",
        amount: "5000",
        kind: "transfer",
        category: "savings-transfer",
        account: "bank",
      });
    }
  }

  // A deliberate large expense in the current month so the budget-over state is reachable.
  const thisMonth = monthStart(today);
  addTransaction({
    date: thisMonth,
    description: "Laptop repair",
    amount: "6800",
    kind: "expense",
    category: "food",
    account: "bank",
    notes: "Seeded to exercise an over-budget row",
  });

  // --- monthly budgets for the current month -------------------------------
  const budgets = [
    { key: "housing", limit: "13000" },
    { key: "food", limit: "9000" },
    { key: "transport", limit: "3000" },
    { key: "utilities", limit: "5000" },
    { key: "leisure", limit: "2500" },
  ];
  for (const budget of budgets) {
    statement(
      `INSERT OR IGNORE INTO budgets (id, tenant_id, category_id, month, limit_minor) VALUES (` +
        `${sqlString(seedId("budget", budget.key))}, ${sqlString(tenantId)}, ${sqlString(categoryId(budget.key))}, ` +
        `${sqlString(thisMonth)}, ${parseAmountToMinor(budget.limit)})`,
    );
  }

  // --- subscriptions --------------------------------------------------------
  const nextMonth = (dayOfMonth) => {
    const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, dayOfMonth));
    return iso(next);
  };
  // Mirrors subscriptionsRepository.create in apps/api/src/db/subscriptions.ts: every
  // subscription is inserted with its first linked charge in the very next statement. The
  // mobile sync triggers put both changes in the atomic group 'subscription:<id>', and a
  // pull rejects any such group that is not exactly one subscription plus one transaction.
  for (const sub of SEED_SUBSCRIPTIONS) {
    const subscriptionId = seedId("sub", sub.id);
    const billingDate = nextMonth(sub.day);
    statement(
      `INSERT OR IGNORE INTO subscriptions (id, tenant_id, category_id, name, amount_minor, currency, billing_cycle, next_billing_date, last_charged_date, status, account_id) VALUES (` +
        `${sqlString(subscriptionId)}, ${sqlString(tenantId)}, ${sqlString(categoryId("leisure"))}, ` +
        `${sqlString(sub.name)}, ${parseAmountToMinor(sub.amount)}, 'PHP', ${sqlString(sub.cycle)}, ${sqlString(billingDate)}, ${sqlString(billingDate)}, 'active', ` +
        `${sqlString(accountId("gcash"))})`,
    );
    statement(
      `INSERT OR IGNORE INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, source_kind, subscription_id) VALUES (` +
        `${sqlString(seedId("sub", sub.id, "charge"))}, ${sqlString(tenantId)}, ${sqlString(accountId("gcash"))}, ` +
        `${sqlString(categoryId("leisure"))}, ${sqlString(billingDate)}, ${sqlString(sub.name)}, ${normalizeSignedAmount(parseAmountToMinor(sub.amount), "expense")}, ` +
        `'PHP', 'expense', 'manual', ${sqlString(subscriptionId)})`,
    );
  }

  // --- goals and debt -------------------------------------------------------
  const goalTarget = iso(new Date(Date.UTC(today.getUTCFullYear() + 1, today.getUTCMonth(), 1)));
  statement(
    `INSERT OR IGNORE INTO financial_goals (id, tenant_id, name, target_amount_minor, current_amount_minor, target_date, status) VALUES (` +
      `${sqlString(seedId("goal", "emergency"))}, ${sqlString(tenantId)}, 'Emergency fund', ${parseAmountToMinor("150000")}, ${parseAmountToMinor("42000")}, ` +
      `${sqlString(goalTarget)}, 'active')`,
  );
  statement(
    `INSERT OR IGNORE INTO debts (id, tenant_id, name, type, balance_minor, apr_basis_points, minimum_payment_minor, balance_as_of, status) VALUES (` +
      `${sqlString(seedId("debt", "card"))}, ${sqlString(tenantId)}, 'BPI Credit Card', 'credit_card', ${parseAmountToMinor("28500")}, 2400, ${parseAmountToMinor("1500")}, ` +
      `${sqlString(iso(today))}, 'active')`,
  );

  // --- calendar events ------------------------------------------------------
  const events = [
    { id: "payday", title: "Payday", day: 15 },
    { id: "rent", title: "Rent due", day: 1 },
  ];
  for (const event of events) {
    const date = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), event.day)));
    statement(
      `INSERT OR IGNORE INTO calendar_events (id, tenant_id, title, date, notes) VALUES (` +
        `${sqlString(seedId("event", event.id))}, ${sqlString(tenantId)}, ${sqlString(event.title)}, ${sqlString(date)}, 'Seeded reminder')`,
    );
  }

  return lines.join("\n");
}

function buildResetSql(userId) {
  const tenantId = `user:${userId}`;
  const filter = `tenant_id = ${sqlString(tenantId)} AND id LIKE '${SEED_PREFIX}%'`;
  // Each subscription's linked charges are deleted in the statement right before it, so the
  // two deletes land next to each other as one valid 'subscription:<id>' sync group.
  const subscriptionDeletes = SEED_SUBSCRIPTIONS.flatMap((sub) => {
    const subscriptionId = sqlString(`${SEED_PREFIX}${userId}:sub:${sub.id}`);
    return [
      `DELETE FROM transactions WHERE tenant_id = ${sqlString(tenantId)} AND subscription_id = ${subscriptionId}`,
      `DELETE FROM subscriptions WHERE tenant_id = ${sqlString(tenantId)} AND id = ${subscriptionId}`,
    ];
  });
  return (
    [
      ...subscriptionDeletes,
      `DELETE FROM transactions WHERE ${filter}`,
      `DELETE FROM budgets WHERE ${filter}`,
      `DELETE FROM financial_goals WHERE ${filter}`,
      `DELETE FROM debts WHERE ${filter}`,
      `DELETE FROM calendar_events WHERE ${filter}`,
      `DELETE FROM categories WHERE ${filter}`,
      `DELETE FROM accounts WHERE ${filter}`,
    ].join(";\n") + ";"
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tenantId = `user:${args.user}`;

  if (args.reset) {
    runSql(args.db, buildResetSql(args.user));
    console.log(`Removed every 'seed:' row for ${tenantId} from ${args.db}.`);
    console.log("The workspace itself (tenant, accounts, categories) was left in place.");
    return;
  }

  runSql(args.db, buildSql(args.user, args.months));
  const count = queryScalar(
    args.db,
    `SELECT COUNT(*) FROM transactions WHERE tenant_id = ${sqlString(tenantId)} AND id LIKE '${SEED_PREFIX}%'`,
  );
  console.log(`Seeded ${args.db} for ${tenantId}.`);
  console.log(
    `  ${count} seeded transactions across the last ${args.months} month(s), plus budgets, ${SEED_SUBSCRIPTIONS.length} subscriptions, 1 goal, 1 debt and 2 calendar events.`,
  );
  console.log("  Re-running is safe: every insert is INSERT OR IGNORE on a deterministic id.");
  console.log(
    "  Undo with: node scripts/seed-local-workspace.mjs --user " + args.user + " --reset",
  );
}

main();
