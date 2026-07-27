import type { AccountBalanceUpdate, AccountRecord } from "@zoption/shared";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface AccountRepository {
  list(env: Bindings, tenantId: string): Promise<AccountRecord[]>;
  setBalance(
    env: Bindings,
    tenantId: string,
    accountId: string,
    input: AccountBalanceUpdate,
  ): Promise<AccountRecord>;
}

export const accountRepository: AccountRepository = {
  async list(env, tenantId) {
    const rows = await drizzle(env.DB)
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        currency: accounts.currency,
        balanceMinor: accounts.balanceMinor,
        balanceAsOf: accounts.balanceAsOf,
        archived: accounts.archived,
      })
      .from(accounts)
      .where(eq(accounts.tenantId, tenantId))
      .orderBy(asc(accounts.archived), asc(accounts.name));
    return rows.map((row) => ({ ...row, currency: "PHP" as const }));
  },

  async setBalance(env, tenantId, accountId, input) {
    const [row] = await drizzle(env.DB)
      .update(accounts)
      .set({
        balanceMinor: input.balanceMinor,
        balanceAsOf: input.balanceAsOf,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)))
      .returning({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        currency: accounts.currency,
        balanceMinor: accounts.balanceMinor,
        balanceAsOf: accounts.balanceAsOf,
        archived: accounts.archived,
      });

    if (!row) throw new HttpError(404, "account_not_found", "The account was not found.");
    return { ...row, currency: "PHP" };
  },
};
