import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { restoreOptimisticSnapshot, updateOptimistically } from "../src/lib/optimistic";

describe("optimistic cache updates", () => {
  it("updates every matching cache entry immediately", async () => {
    const client = new QueryClient();
    client.setQueryData(["transactions", { page: 1 }], ["first"]);
    client.setQueryData(["transactions", { page: 2 }], ["second"]);

    await updateOptimistically<string[]>(
      client,
      ["transactions"],
      (current) => [...(current ?? []), "pending"],
      false,
    );

    expect(client.getQueryData(["transactions", { page: 1 }])).toEqual(["first", "pending"]);
    expect(client.getQueryData(["transactions", { page: 2 }])).toEqual(["second", "pending"]);
  });

  it("restores every prior value after a failed request", async () => {
    const client = new QueryClient();
    const firstKey = ["goals", "first"] as const;
    const secondKey = ["goals", "second"] as const;
    client.setQueryData(firstKey, { items: ["one"] });
    client.setQueryData(secondKey, { items: ["two"] });

    const snapshot = await updateOptimistically<{ items: string[] }>(
      client,
      ["goals"],
      (current) => (current ? { items: [] } : current),
      false,
    );
    restoreOptimisticSnapshot(client, snapshot);

    expect(client.getQueryData(firstKey)).toEqual({ items: ["one"] });
    expect(client.getQueryData(secondKey)).toEqual({ items: ["two"] });
  });
});
