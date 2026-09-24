import { describe, expect, it, vi } from "vitest";

import { enqueueJob } from "../src/jobs";
import type { Bindings } from "../src/types";

describe("enqueueJob", () => {
  it("returns false when the queue binding is missing", async () => {
    await expect(
      enqueueJob({} as Bindings, { type: "billing-reconcile", tenantId: "user:1" }),
    ).resolves.toBe(false);
  });

  it("sends the message and optional delay when JOBS is bound", async () => {
    const send = vi.fn(async () => undefined);
    const env = { JOBS: { send } } as unknown as Bindings;
    await expect(
      enqueueJob(env, { type: "bug-report-notify", reportId: "report-1" }, { delaySeconds: 30 }),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(
      { type: "bug-report-notify", reportId: "report-1" },
      { delaySeconds: 30 },
    );
  });
});
