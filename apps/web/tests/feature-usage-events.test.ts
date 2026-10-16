import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/analytics/funnel", () => ({ captureFunnelEvent: vi.fn() }));
vi.mock("../src/lib/api/transport", () => ({ requestJson: vi.fn() }));

import { appPageForPath } from "../src/analytics/AppPageViewed";
import { captureFunnelEvent } from "../src/analytics/funnel";
import { createTransaction, deleteTransaction } from "../src/lib/api";
import { requestJson } from "../src/lib/api/transport";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

const workspace = {} as AuthenticatedWorkspace;
const input = { kind: "expense" } as Parameters<typeof createTransaction>[1];

beforeEach(() => {
  vi.mocked(captureFunnelEvent).mockReset();
  vi.mocked(requestJson).mockReset();
});

describe("page_viewed names", () => {
  it("maps signed-in paths to fixed page names and ignores admin and public paths", () => {
    expect(appPageForPath("/app")).toBe("overview");
    expect(appPageForPath("/app/budgets/")).toBe("budgets");
    expect(appPageForPath("/app/support/reports")).toBe("support");
    expect(appPageForPath("/app/admin")).toBeUndefined();
    expect(appPageForPath("/login")).toBeUndefined();
  });
});

describe("write events", () => {
  it("counts a write only once the server accepted it", async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ id: "t1" });
    await createTransaction(workspace, input);
    expect(captureFunnelEvent).toHaveBeenCalledWith("transaction_created", {
      transaction_kind: "expense",
    });

    vi.mocked(requestJson).mockRejectedValueOnce(new Error("offline"));
    await expect(deleteTransaction(workspace, "t1")).rejects.toThrow("offline");
    expect(captureFunnelEvent).toHaveBeenCalledTimes(1);
  });
});
