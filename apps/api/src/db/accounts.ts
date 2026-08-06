import type {
  AccountInput,
  AccountInterestUpdate,
  AccountRecord,
  AccountUpdate,
  Currency,
} from "@zoption/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, transactions } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface AccountRepository {
  list(env: Bindings, tenantId: string): Promise<AccountRecord[]>;
  create?(env: Bindings, tenantId: string, input: AccountInput): Promise<AccountRecord>;
  update?(
    env: Bindings,
    tenantId: string,
    accountId: string,
    input: AccountUpdate,
  ): Promise<AccountRecord>;
  remove?(env: Bindings, tenantId: string, accountId: string): Promise<void>;
  setBalance?(
    env: Bindings,
    tenantId: string,
    accountId: string,
    input: { balanceMinor: number | null; balanceAsOf: string | null },
  ): Promise<AccountRecord>;
  updateInterest?(
    env: Bindings,
    tenantId: string,
    accountId: string,
    input: AccountInterestUpdate,
  ): Promise<AccountRecord>;
}

const accountSelection = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  currency: accounts.currency,
  archived: accounts.archived,
  systemKey: accounts.systemKey,
  interestEnabled: accounts.interestEnabled,
  annualRateBasisPoints: accounts.annualRateBasisPoints,
  interestFrequency: accounts.interestFrequency,
  interestPayDay: accounts.interestPayDay,
  balancePhpMinor: sql<number>`COALESCE(SUM(CASE
    WHEN (${transactions.kind} != 'transfer' OR ${transactions.transferGroupId} IS NOT NULL)
      AND ${transactions.currency} = 'PHP'
    THEN ${transactions.amountMinor}
    ELSE 0
  END), 0)`,
  balanceUsdMinor: sql<number>`COALESCE(SUM(CASE
    WHEN (${transactions.kind} != 'transfer' OR ${transactions.transferGroupId} IS NOT NULL)
      AND ${transactions.currency} = 'USD'
    THEN ${transactions.amountMinor}
    ELSE 0
  END), 0)`,
};

function normalize(
  row: typeof accountSelection extends never ? never : Record<string, unknown>,
): AccountRecord {
  const balancesByCurrency: Record<Currency, number> = {
    PHP: Number(row.balancePhpMinor ?? 0),
    USD: Number(row.balanceUsdMinor ?? 0),
  };
  const currency = row.currency as Currency;
  const interestEnabled = Boolean(row.interestEnabled);
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as AccountRecord["type"],
    currency,
    archived: row.archived as boolean,
    system: Boolean(row.systemKey),
    balanceMinor: balancesByCurrency[currency],
    balancesByCurrency,
    interest: interestEnabled
      ? {
          enabled: true,
          annualRateBasisPoints: (row.annualRateBasisPoints as number | null) ?? null,
          frequency: (row.interestFrequency as AccountRecord["interest"] &
            NonNullable<AccountRecord["interest"]>["frequency"]) ?? null,
          payDay: (row.interestPayDay as number | null) ?? null,
        }
      : { enabled: false, annualRateBasisPoints: null, frequency: null, payDay: null },
  };
}

async function findAccount(
  env: Bindings,
  tenantId: string,
  accountId: string,
): Promise<AccountRecord | null> {
  const db = drizzle(env.DB);
  const [row] = await db
    .select(accountSelection)
    .from(accounts)
    .leftJoin(
      transactions,
      and(eq(transactions.accountId, accounts.id), eq(transactions.tenantId, tenantId)),
    )
    .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)))
    .groupBy(accounts.id)
    .limit(1);
  return row ? normalize(row) : null;
}

async function ensureUniqueName(
  env: Bindings,
  tenantId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await drizzle(env.DB)
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.tenantId, tenantId),
        sql`lower(${accounts.name}) = lower(${name})`,
        ...(excludeId ? [sql`${accounts.id} != ${excludeId}`] : []),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new HttpError(409, "account_name_conflict", "An account with that name already exists.");
  }
}

export const accountRepository: AccountRepository = {
  async list(env, tenantId) {
    const rows = await drizzle(env.DB)
      .select(accountSelection)
      .from(accounts)
      .leftJoin(
        transactions,
        and(eq(transactions.accountId, accounts.id), eq(transactions.tenantId, tenantId)),
      )
      .where(eq(accounts.tenantId, tenantId))
      .groupBy(accounts.id)
      .orderBy(asc(accounts.archived), asc(accounts.name));
    return rows.map(normalize);
  },

  async create(env, tenantId, input) {
    await ensureUniqueName(env, tenantId, input.name);
    const id = crypto.randomUUID();
    await drizzle(env.DB).insert(accounts).values({
      id,
      tenantId,
      name: input.name,
      type: input.type,
      currency: "PHP",
    });
    const created = await findAccount(env, tenantId, id);
    if (!created) throw new Error("Created account could not be read back.");
    return created;
  },

  async update(env, tenantId, accountId, input) {
    const existing = await findAccount(env, tenantId, accountId);
    if (!existing) throw new HttpError(404, "account_not_found", "The account was not found.");
    if (existing.system && input.name !== existing.name) {
      throw new HttpError(409, "system_account_protected", "Permanent accounts cannot be renamed.");
    }
    await ensureUniqueName(env, tenantId, input.name, accountId);
    await drizzle(env.DB)
      .update(accounts)
      .set({
        name: input.name,
        ...(input.type !== undefined && { type: input.type }),
        updatedAt: sql`(datetime('now'))`,
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)));
    const updated = await findAccount(env, tenantId, accountId);
    if (!updated) throw new Error("Updated account could not be read back.");
    return updated;
  },

  async remove(env, tenantId, accountId) {
    const existing = await findAccount(env, tenantId, accountId);
    if (!existing) throw new HttpError(404, "account_not_found", "The account was not found.");
    if (existing.system) {
      throw new HttpError(409, "system_account_protected", "Permanent accounts cannot be removed.");
    }
    await drizzle(env.DB)
      .update(accounts)
      .set({ archived: true, updatedAt: sql`(datetime('now'))` })
      .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)));
  },

  async updateInterest(env, tenantId, accountId, input) {
    const existing = await findAccount(env, tenantId, accountId);
    if (!existing) throw new HttpError(404, "account_not_found", "The account was not found.");
    if (existing.type !== "savings") {
      throw new HttpError(400, "interest_not_for_account_type", "Only savings accounts earn interest.");
    }
    const set: Record<string, unknown> = {
      interestEnabled: input.enabled,
      updatedAt: sql`(datetime('now'))`,
    };
    if (input.enabled) {
      set.annualRateBasisPoints = input.annualRateBasisPoints;
      set.interestFrequency = input.frequency;
      set.interestPayDay = input.frequency === "daily" ? null : input.payDay;
    } else {
      set.annualRateBasisPoints = null;
      set.interestFrequency = null;
      set.interestPayDay = null;
    }
    await drizzle(env.DB)
      .update(accounts)
      .set(set)
      .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)));
    const updated = await findAccount(env, tenantId, accountId);
    if (!updated) throw new Error("Updated account could not be read back.");
    return updated;
  },
};
