import { primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Exchange-rate tables, split out of schema.ts (re-exported there) to keep it under its ceiling.

/**
 * Units of `currency` one US dollar buys on `date`; any pair converts through USD. Supersedes
 * `fx_rates` (USD to PHP), which stays in D1 for an older Worker and is left out of the schema.
 */
export const fxUsdRates = sqliteTable(
  "fx_usd_rates",
  {
    date: text("date").notNull(),
    currency: text("currency").notNull(),
    unitsPerUsd: real("units_per_usd").notNull(),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.date, table.currency] })],
);
