import type { AccountRecord } from "@zoption/shared";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts } from "../../../../db/schema";
import type { Bindings } from "../types";

export interface AccountRepository {
  list(env: Bindings, tenantId: string): Promise<AccountRecord[]>;
}

export const accountRepository: AccountRepository = {
  async list(env, tenantId) {
    return drizzle(env.DB)
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        archived: accounts.archived,
      })
      .from(accounts)
      .where(eq(accounts.tenantId, tenantId))
      .orderBy(asc(accounts.archived), asc(accounts.name));
  },
};
