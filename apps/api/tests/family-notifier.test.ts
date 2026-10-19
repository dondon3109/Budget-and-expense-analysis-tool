import type { DatabaseSync } from "node:sqlite";

import { familyPushDataSchema } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPushRepository } from "../src/db/push";
import { createFamilyNotifier } from "../src/family-notifier";
import type { sendPush } from "../src/push";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const FAMILY = "family-1";
const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("family notifier", () => {
  it("tells the phone which family and entry a push is about", async () => {
    const { binding, database } = createD1TestDatabase();
    databases.push(database);
    database
      .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'family', 'Dela Cruz family')")
      .run(FAMILY);
    const member = database.prepare(
      "INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)",
    );
    member.run(FAMILY, "mama", "owner");
    member.run(FAMILY, "kuya", "member");
    const send = vi.fn<typeof sendPush>(async () => ({ sent: 1, removed: 0 }));

    await createFamilyNotifier(createPushRepository(), send).notify(
      { DB: binding } as unknown as Bindings,
      {
        familyTenantId: FAMILY,
        category: "comment_reply",
        title: "New comment",
        body: "Salamat!",
        exceptUserId: "kuya",
        subject: { kind: "transaction", subjectId: "txn-1" },
      },
    );

    const message = send.mock.calls[0]![2];
    expect(message.userIds).toEqual(["mama"]);
    expect(familyPushDataSchema.parse(message.data)).toEqual({
      path: "/family",
      workspaceId: FAMILY,
      subjectKind: "transaction",
      subjectId: "txn-1",
    });
  });
});
