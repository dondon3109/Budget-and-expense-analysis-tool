import {
  FAMILY_ALERT_DEFAULTS,
  isCurrency,
  type FamilyAlertSettings,
  type TransactionListItem,
} from "@zoption/shared";

import { familyLeftMinor } from "./db/remittances";
import { createFamilyNotifier, noticeAmount, type FamilyNotifier } from "./family-notifier";
import type { Bindings } from "./types";

/** Philippine time has no daylight saving, so a fixed offset gives the local date. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * The owner's thresholds and the alerts they drive: a large family expense (owner), money left
 * dropping below the floor (everyone), and the owner's daily digest. Members turn each category
 * off in their own push preferences.
 */
export interface FamilyAlerts {
  settings(env: Bindings, tenantId: string): Promise<FamilyAlertSettings>;
  saveSettings(
    env: Bindings,
    tenantId: string,
    settings: FamilyAlertSettings,
  ): Promise<FamilyAlertSettings>;
  /** Runs after someone adds a family expense; never throws. */
  afterExpense(
    env: Bindings,
    tenantId: string,
    userId: string,
    item: TransactionListItem,
  ): Promise<void>;
  /** One digest per family with entries dated yesterday (Manila), sent to its owner. */
  sendDailyDigests(env: Bindings, now: Date): Promise<number>;
}

export function createFamilyAlerts(
  notifier: FamilyNotifier = createFamilyNotifier(),
): FamilyAlerts {
  const alerts: FamilyAlerts = {
    async settings(env, tenantId) {
      const row = await env.DB.prepare(
        `SELECT spending_alert_minor AS spendingAlertMinor, low_balance_minor AS lowBalanceMinor
         FROM family_alert_settings WHERE tenant_id = ?`,
      )
        .bind(tenantId)
        .first<FamilyAlertSettings>();
      return row ?? { ...FAMILY_ALERT_DEFAULTS };
    },

    async saveSettings(env, tenantId, settings) {
      await env.DB.prepare(
        `INSERT INTO family_alert_settings (tenant_id, spending_alert_minor, low_balance_minor)
         VALUES (?, ?, ?)
         ON CONFLICT (tenant_id) DO UPDATE SET
           spending_alert_minor = excluded.spending_alert_minor,
           low_balance_minor = excluded.low_balance_minor,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
        .bind(tenantId, settings.spendingAlertMinor, settings.lowBalanceMinor)
        .run();
      return settings;
    },

    async afterExpense(env, tenantId, userId, item) {
      if (item.kind !== "expense") return;
      try {
        const { spendingAlertMinor, lowBalanceMinor } = await alerts.settings(env, tenantId);
        const spent = Math.abs(item.amountMinor);
        if (spendingAlertMinor !== null && spent >= spendingAlertMinor) {
          await notifier.notify(env, {
            familyTenantId: tenantId,
            category: "family_spending",
            title: "Family spending",
            body: `${noticeAmount(spent, item.currency)} for ${item.description}.`,
            exceptUserId: userId,
            ownerOnly: true,
          });
        }
        if (lowBalanceMinor === null) return;
        // Only the expense that crosses the floor alerts, not every one after it.
        const left = await familyLeftMinor(env, tenantId, item.currency);
        if (left < lowBalanceMinor && left + spent >= lowBalanceMinor) {
          await notifier.notify(env, {
            familyTenantId: tenantId,
            category: "low_balance",
            title: "Family money is running low",
            body: `${noticeAmount(left, item.currency)} left after ${item.description}.`,
          });
        }
      } catch (error) {
        console.log(
          JSON.stringify({
            message: "Family expense alert failed",
            errorCode: error instanceof Error ? error.name : "unknown_error",
          }),
        );
      }
    },

    async sendDailyDigests(env, now) {
      const yesterday = new Date(now.getTime() + MANILA_OFFSET_MS - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      // Transfers count once, by their sending leg; a closing family gets no digest.
      const { results } = await env.DB.prepare(
        `SELECT t.tenant_id AS tenantId, f.name, f.currency, COUNT(*) AS entries,
                COALESCE(-SUM(CASE WHEN t.kind = 'expense' AND t.currency = f.currency
                                   THEN t.amount_minor END), 0) AS spentMinor
         FROM transactions t
         JOIN tenants f ON f.id = t.tenant_id AND f.kind = 'family'
         WHERE t.date = ? AND (t.kind != 'transfer' OR t.amount_minor < 0)
           AND NOT EXISTS (SELECT 1 FROM family_closures c WHERE c.tenant_id = t.tenant_id)
         GROUP BY t.tenant_id`,
      )
        .bind(yesterday)
        .all<{
          tenantId: string;
          name: string;
          currency: string;
          entries: number;
          spentMinor: number;
        }>();
      for (const family of results) {
        const currency = isCurrency(family.currency) ? family.currency : "PHP";
        const left = await familyLeftMinor(env, family.tenantId, currency);
        await notifier.notify(env, {
          familyTenantId: family.tenantId,
          category: "family_digest",
          title: `Yesterday in ${family.name}`,
          body: `${noticeAmount(family.spentMinor, currency)} spent across ${family.entries} ${
            family.entries === 1 ? "entry" : "entries"
          }. ${noticeAmount(left, currency)} left.`,
          ownerOnly: true,
        });
      }
      return results.length;
    },
  };
  return alerts;
}

/** The default instance for the scheduled handler. */
export const familyAlerts = createFamilyAlerts();
