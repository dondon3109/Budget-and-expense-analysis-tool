import type {
  CustomerReview,
  CustomerReviewAdminDashboard,
  CustomerReviewInput,
  CustomerReviewModerationStatus,
  CustomerReviewState,
  PublicCustomerReview,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

const LANDING_REVIEW_LIMIT = 6;

export interface CustomerReviewAdminQuery {
  page: number;
  pageSize: number;
  status?: CustomerReviewModerationStatus;
  rating?: number;
  search?: string;
}

interface CustomerReviewRow {
  id: string;
  displayName: string;
  rating: number;
  review: string;
  published: number;
  moderationStatus: CustomerReviewModerationStatus;
  featuredOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerReviewRepository {
  listPublic(env: Bindings, limit: number): Promise<PublicCustomerReview[]>;
  getState(env: Bindings, tenantId: string): Promise<CustomerReviewState>;
  upsert(
    env: Bindings,
    tenantId: string,
    userId: string,
    input: CustomerReviewInput,
  ): Promise<CustomerReview>;
  remove(env: Bindings, tenantId: string): Promise<void>;
  getAdminDashboard(
    env: Bindings,
    query?: CustomerReviewAdminQuery,
  ): Promise<CustomerReviewAdminDashboard>;
  updateModeration(
    env: Bindings,
    id: string,
    status: Exclude<CustomerReviewModerationStatus, "pending">,
  ): Promise<CustomerReviewAdminDashboard>;
  setLineup(env: Bindings, reviewIds: string[]): Promise<CustomerReviewAdminDashboard>;
}

function toPublicReview(row: CustomerReviewRow): PublicCustomerReview {
  if (row.featuredOrder === null) {
    throw new Error("A public customer review must have a landing-page order.");
  }
  return {
    id: row.id,
    displayName: row.displayName,
    rating: row.rating,
    review: row.review,
    featuredOrder: row.featuredOrder,
    updatedAt: row.updatedAt,
  };
}

function toCustomerReview(row: CustomerReviewRow): CustomerReview {
  return {
    id: row.id,
    displayName: row.displayName,
    rating: row.rating,
    review: row.review,
    publishConsent: Boolean(row.published),
    moderationStatus: row.moderationStatus,
    featuredOrder: row.featuredOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const selectColumns = `id, display_name AS displayName, rating, review, published,
  moderation_status AS moderationStatus, featured_order AS featuredOrder,
  created_at AS createdAt, updated_at AS updatedAt`;

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

async function adminDashboard(
  env: Bindings,
  query: CustomerReviewAdminQuery = { page: 1, pageSize: 50 },
): Promise<CustomerReviewAdminDashboard> {
  const conditions = ["published = 1"];
  const bindings: unknown[] = [];
  if (query.status) {
    conditions.push("moderation_status = ?");
    bindings.push(query.status);
  }
  if (query.rating) {
    conditions.push("rating = ?");
    bindings.push(query.rating);
  }
  if (query.search) {
    conditions.push("(display_name LIKE ? ESCAPE '\\' OR review LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeLike(query.search)}%`;
    bindings.push(pattern, pattern);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const totalFilteredRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM customer_reviews ${where}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();
  const totalFiltered = totalFilteredRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const rows = await env.DB.prepare(
    `SELECT ${selectColumns}
     FROM customer_reviews
     ${where}
     ORDER BY created_at DESC, id
     LIMIT ? OFFSET ?`,
  )
    .bind(...bindings, query.pageSize, (page - 1) * query.pageSize)
    .all<CustomerReviewRow>();
  const lineupRows = await env.DB.prepare(
    `SELECT ${selectColumns}
     FROM customer_reviews
     WHERE published = 1 AND moderation_status = 'published' AND featured_order IS NOT NULL
     ORDER BY featured_order`,
  ).all<CustomerReviewRow>();
  const summaryRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN moderation_status = 'published' THEN 1 ELSE 0 END) AS publishedCount,
            SUM(CASE WHEN moderation_status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
            SUM(CASE WHEN featured_order IS NOT NULL THEN 1 ELSE 0 END) AS featured
     FROM customer_reviews
     WHERE published = 1`,
  ).first<{
    total: number;
    pending: number | null;
    publishedCount: number | null;
    hidden: number | null;
    featured: number | null;
  }>();
  const items = rows.results.map(toCustomerReview);
  const lineup = lineupRows.results.map(toCustomerReview);
  return {
    items,
    lineup,
    summary: {
      total: summaryRow?.total ?? 0,
      pending: summaryRow?.pending ?? 0,
      published: summaryRow?.publishedCount ?? 0,
      hidden: summaryRow?.hidden ?? 0,
      featured: summaryRow?.featured ?? 0,
    },
    page,
    pageSize: query.pageSize,
    totalFiltered,
    totalPages,
  };
}

export const customerReviewRepository: CustomerReviewRepository = {
  async listPublic(env, limit) {
    const rows = await env.DB.prepare(
      `SELECT ${selectColumns}
       FROM customer_reviews
       WHERE published = 1
         AND moderation_status = 'published'
         AND featured_order IS NOT NULL
       ORDER BY featured_order
       LIMIT ?`,
    )
      .bind(Math.min(limit, LANDING_REVIEW_LIMIT))
      .all<CustomerReviewRow>();
    return rows.results.map(toPublicReview);
  },

  async getState(env, tenantId) {
    const row = await env.DB.prepare(
      `SELECT ${selectColumns} FROM customer_reviews WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<CustomerReviewRow>();
    if (row) return { review: toCustomerReview(row), promptEligible: false };

    const activity = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM transactions WHERE tenant_id = ?) AS transactionCount,
         COALESCE(julianday('now') - julianday(created_at), 0) AS accountAgeDays
       FROM tenants
       WHERE id = ?`,
    )
      .bind(tenantId, tenantId)
      .first<{ transactionCount: number; accountAgeDays: number }>();

    return {
      review: null,
      promptEligible: Boolean(
        activity && (activity.transactionCount >= 3 || activity.accountAgeDays >= 7),
      ),
    };
  },

  async upsert(env, tenantId, userId, input) {
    await env.DB.prepare(
      `INSERT INTO customer_reviews
         (id, tenant_id, reviewer_user_id, display_name, rating, review, published,
          moderation_status, featured_order)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', NULL)
       ON CONFLICT(tenant_id) DO UPDATE SET
         reviewer_user_id = excluded.reviewer_user_id,
         display_name = excluded.display_name,
         rating = excluded.rating,
         review = excluded.review,
         published = 1,
         moderation_status = 'pending',
         featured_order = NULL,
         updated_at = datetime('now')`,
    )
      .bind(crypto.randomUUID(), tenantId, userId, input.displayName, input.rating, input.review)
      .run();

    const saved = await env.DB.prepare(
      `SELECT ${selectColumns} FROM customer_reviews WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<CustomerReviewRow>();
    if (!saved) throw new Error("The customer review could not be stored.");
    return toCustomerReview(saved);
  },

  async remove(env, tenantId) {
    await env.DB.prepare("DELETE FROM customer_reviews WHERE tenant_id = ?").bind(tenantId).run();
  },

  getAdminDashboard: adminDashboard,

  async updateModeration(env, id, status) {
    const result = await env.DB.prepare(
      `UPDATE customer_reviews
       SET moderation_status = ?,
           featured_order = CASE WHEN ? = 'published' THEN featured_order ELSE NULL END,
           updated_at = datetime('now')
       WHERE id = ? AND published = 1`,
    )
      .bind(status, status, id)
      .run();
    if (!result.meta.changes) {
      throw new HttpError(404, "customer_review_not_found", "Customer review not found.");
    }
    return adminDashboard(env);
  },

  async setLineup(env, reviewIds) {
    if (reviewIds.length > LANDING_REVIEW_LIMIT) {
      throw new HttpError(
        400,
        "invalid_customer_review_lineup",
        "Choose no more than six landing-page reviews.",
      );
    }

    if (reviewIds.length > 0) {
      const placeholders = reviewIds.map(() => "?").join(", ");
      const selected = await env.DB.prepare(
        `SELECT ${selectColumns}
         FROM customer_reviews
         WHERE id IN (${placeholders})`,
      )
        .bind(...reviewIds)
        .all<CustomerReviewRow>();
      const eligibleIds = new Set(
        selected.results
          .filter((row) => row.published === 1 && row.moderationStatus === "published")
          .map((row) => row.id),
      );
      if (reviewIds.some((id) => !eligibleIds.has(id))) {
        throw new HttpError(
          409,
          "customer_review_not_publishable",
          "Publish every selected review before adding it to the landing page.",
        );
      }
    }

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE customer_reviews SET featured_order = NULL WHERE featured_order IS NOT NULL",
      ),
      ...reviewIds.map((id, index) =>
        env.DB.prepare(
          `UPDATE customer_reviews
           SET featured_order = ?, updated_at = datetime('now')
           WHERE id = ? AND published = 1 AND moderation_status = 'published'`,
        ).bind(index + 1, id),
      ),
    ]);

    return adminDashboard(env);
  },
};
