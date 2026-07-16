import type { AccountRecord } from "@budget/shared";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts } from "../../../../db/schema";
import type { Bindings } from "../types";
import { DEMO_TENANT_ID } from "./scope";

export interface AccountRepository {
  list(env: Bindings, tenantId?: string): Promise<AccountRecord[]>;
}

export const accountRepository: AccountRepository = {
  async list(env, tenantId = DEMO_TENANT_ID) {
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
