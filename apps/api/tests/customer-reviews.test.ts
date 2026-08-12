import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { customerReviewRepository } from "../src/db/customer-reviews";
import type { Bindings } from "../src/types";

const databases: DatabaseSync[] = [];

function d1For(database: DatabaseSync): D1Database {
  function prepare(sql: string): D1PreparedStatement {
    let bindings: SQLInputValue[] = [];
    const statement = {
      bind(...values: unknown[]) {
        bindings = values as SQLInputValue[];
        return statement;
      },
      async first<T>() {
        return (database.prepare(sql).get(...bindings) as T | undefined) ?? null;
      },
      async all<T>() {
        return {
          success: true as const,
          meta: {},
          results: database.prepare(sql).all(...bindings) as T[],
        };
      },
      async run() {
        const result = database.prepare(sql).run(...bindings);
        return {
          success: true as const,
          meta: { changes: Number(result.changes) },
          results: [],
        };
      },
    };
    return statement as unknown as D1PreparedStatement;
  }

  return {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
}

function migration(name: string): string {
  return readFileSync(
    new URL(`../../../db/migrations/${name}`, import.meta.url),
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");
}

function environment() {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON; CREATE TABLE tenants (id text PRIMARY KEY NOT NULL);");
  database.exec(migration("0031_customer_reviews.sql"));
  database.prepare("INSERT INTO tenants (id) VALUES (?), (?)").run("user:one", "user:two");
  database
    .prepare(
      `INSERT INTO customer_reviews
        (id, tenant_id, reviewer_user_id, display_name, rating, review, published, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      "00000000-0000-4000-8000-000000000001",
      "user:one",
      "one",
      "Alex",
      5,
      "Zoption keeps my spending plan clear and easy to follow.",
      "2026-08-10 00:00:00",
    );
  database.exec(migration("0032_customer_review_moderation.sql"));
  return { env: { DB: d1For(database) } satisfies Bindings, database };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("customer review moderation persistence", () => {
  it("backfills consented reviews into a stable landing lineup", async () => {
    const { env } = environment();

    await expect(customerReviewRepository.listPublic(env, 6)).resolves.toEqual([
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000001",
        displayName: "Alex",
        featuredOrder: 1,
      }),
    ]);
    await expect(customerReviewRepository.getAdminDashboard(env)).resolves.toMatchObject({
      summary: { total: 1, pending: 0, published: 1, hidden: 0, featured: 1 },
      lineup: [{ id: "00000000-0000-4000-8000-000000000001", featuredOrder: 1 }],
    });
  });

  it("requires admin publication before lineup placement and removes hidden reviews", async () => {
    const { env } = environment();
    const submitted = await customerReviewRepository.upsert(env, "user:two", "two", {
      displayName: "Morgan",
      rating: 4,
      review: "The monthly view helps me understand where my money is going.",
      publishConsent: true,
    });

    expect(submitted).toMatchObject({
      moderationStatus: "pending",
      featuredOrder: null,
      publishConsent: true,
    });
    await expect(customerReviewRepository.setLineup(env, [submitted.id])).rejects.toMatchObject({
      code: "customer_review_not_publishable",
    });

    await customerReviewRepository.updateModeration(env, submitted.id, "published");
    const placed = await customerReviewRepository.setLineup(env, [submitted.id]);
    expect(placed.lineup).toEqual([
      expect.objectContaining({ id: submitted.id, featuredOrder: 1 }),
    ]);
    await expect(customerReviewRepository.listPublic(env, 6)).resolves.toEqual([
      expect.objectContaining({ id: submitted.id, featuredOrder: 1 }),
    ]);

    const hidden = await customerReviewRepository.updateModeration(env, submitted.id, "hidden");
    expect(hidden.lineup).toEqual([]);
    await expect(customerReviewRepository.listPublic(env, 6)).resolves.toEqual([]);
  });

  it("returns replaced wording to moderation and removes its former placement", async () => {
    const { env } = environment();
    const id = "00000000-0000-4000-8000-000000000001";
    await customerReviewRepository.upsert(env, "user:one", "one", {
      displayName: "Alex",
      rating: 4,
      review: "I changed my review, so the updated wording should be checked again.",
      publishConsent: true,
    });

    const dashboard = await customerReviewRepository.getAdminDashboard(env);
    expect(dashboard.items.find((review) => review.id === id)).toMatchObject({
      moderationStatus: "pending",
      featuredOrder: null,
    });
    expect(dashboard.lineup).toEqual([]);
  });

  it("paginates and filters the complete admin review inbox on the server", async () => {
    const { env } = environment();
    await customerReviewRepository.upsert(env, "user:two", "two", {
      displayName: "Morgan",
      rating: 4,
      review: "The monthly view helps me understand where my money is going.",
      publishConsent: true,
    });

    const firstPage = await customerReviewRepository.getAdminDashboard(env, {
      page: 1,
      pageSize: 1,
    });
    expect(firstPage).toMatchObject({
      page: 1,
      pageSize: 1,
      totalFiltered: 2,
      totalPages: 2,
    });
    expect(firstPage.items).toHaveLength(1);

    const filtered = await customerReviewRepository.getAdminDashboard(env, {
      page: 1,
      pageSize: 50,
      status: "pending",
      rating: 4,
      search: "Morgan",
    });
    expect(filtered).toMatchObject({ totalFiltered: 1, totalPages: 1 });
    expect(filtered.items).toEqual([
      expect.objectContaining({ displayName: "Morgan", moderationStatus: "pending", rating: 4 }),
    ]);
  });
});
