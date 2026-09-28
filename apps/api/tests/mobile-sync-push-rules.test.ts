import type { MobileSyncPushOperation } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { revisionConflict } from "../src/db/mobile-sync/push/results";
import {
  subscriptionReferenceRejection,
  transactionReferenceRejection,
} from "../src/db/mobile-sync/push/rules";
import type { EntitySnapshot } from "../src/db/mobile-sync/push/snapshots";
import { HttpError } from "../src/errors";

const identity = {
  operationId: "00000000-0000-4000-8000-000000000001",
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
  entityId: "00000000-0000-4000-8000-000000000003",
  dependencyIds: [],
};

const deleteEvent = {
  ...identity,
  entityType: "event",
  operationType: "delete",
  baseRevision: 3,
  payload: {},
} as MobileSyncPushOperation;

const createEvent = {
  ...identity,
  entityType: "event",
  operationType: "create",
  baseRevision: 0,
  payload: { title: "Rent", date: "2026-09-27" },
} as MobileSyncPushOperation;

function snapshotAt(revision: number): EntitySnapshot {
  return { revision, updatedAt: "2026-09-27T00:00:00.000Z" } as EntitySnapshot;
}

describe("revisionConflict", () => {
  it.each([
    ["a create with no row", createEvent, null, null],
    ["a create over an existing row", createEvent, snapshotAt(1), "entity_exists"],
    ["a change with no row", deleteEvent, null, "entity_missing"],
    ["a change at an older revision", deleteEvent, snapshotAt(4), "stale_revision"],
    ["a change at its base revision", deleteEvent, snapshotAt(3), null],
  ] as const)("returns the conflict for %s", (_name, operation, current, expected) => {
    expect(revisionConflict(operation, current)).toBe(expected);
  });
});

describe("reference rejections", () => {
  it.each([
    ["invalid_category", "invalid_category"],
    ["category_kind_mismatch", "invalid_category"],
    ["invalid_account", "invalid_account"],
    ["category_requires_pro", "plan_limit"],
    ["invalid_subscription_category", "invalid_operation"],
    ["something_else", "invalid_operation"],
  ])("maps a transaction reference failure %s to %s", (errorCode, code) => {
    expect(
      transactionReferenceRejection(deleteEvent, new HttpError(400, errorCode, "Nope.")),
    ).toEqual({
      operationId: identity.operationId,
      entityType: "event",
      entityId: identity.entityId,
      status: "rejected",
      code,
      message: "Nope.",
    });
  });

  it.each([
    ["invalid_subscription_category", "invalid_category"],
    ["invalid_account", "invalid_account"],
    ["category_requires_pro", "plan_limit"],
    ["invalid_category", "invalid_operation"],
    ["something_else", "invalid_operation"],
  ])("maps a subscription reference failure %s to %s", (errorCode, code) => {
    expect(
      subscriptionReferenceRejection(deleteEvent, new HttpError(400, errorCode, "Nope.")),
    ).toMatchObject({ status: "rejected", code, message: "Nope." });
  });
});
