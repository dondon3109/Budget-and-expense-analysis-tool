import { CURRENT_RECEIPT_CONSENT_VERSION } from "@zoption/shared";

import type { Bindings } from "../types";

export interface ReceiptConsentRecord {
  consentedAt: string | null;
  consentVersion: number;
}

export interface ReceiptRepository {
  getConsent(env: Bindings, tenantId: string): Promise<ReceiptConsentRecord>;
  grantConsent(env: Bindings, tenantId: string): Promise<ReceiptConsentRecord>;
}

export const receiptRepository: ReceiptRepository = {
  async getConsent(env, tenantId) {
    const row = await env.DB.prepare(
      "SELECT consented_at, consent_version FROM receipt_preferences WHERE tenant_id = ?",
    )
      .bind(tenantId)
      .first<{ consented_at: string | null; consent_version: number }>();
    return {
      consentedAt: row?.consented_at ?? null,
      consentVersion: row?.consent_version ?? 0,
    };
  },

  async grantConsent(env, tenantId) {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO receipt_preferences (tenant_id, consented_at, consent_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         consented_at = excluded.consented_at,
         consent_version = excluded.consent_version,
         updated_at = excluded.updated_at`,
    )
      .bind(tenantId, now, CURRENT_RECEIPT_CONSENT_VERSION, now, now)
      .run();
    return { consentedAt: now, consentVersion: CURRENT_RECEIPT_CONSENT_VERSION };
  },
};
