import { describe, expect, it, vi } from "vitest";

import type { BugReportRepository } from "../src/db/bug-reports";
import { dispatchBugfixDraft } from "../src/support/bugfix-dispatch";
import type { Bindings } from "../src/types";

function repository(waiting: number) {
  const listForEgress = vi.fn(async () =>
    Array.from({ length: waiting }, (_, index) => ({ id: `report-${index}` })),
  );
  return { repository: { listForEgress } as unknown as BugReportRepository, listForEgress };
}

const configured = { GITHUB_BUGFIX_DISPATCH_TOKEN: "github_pat_test" } as Bindings;

describe("dispatchBugfixDraft", () => {
  it("does nothing without a token, so a Preview Worker never starts drafts", async () => {
    const { repository: repo, listForEgress } = repository(1);
    const fetcher = vi.fn();

    await expect(dispatchBugfixDraft({} as Bindings, repo, fetcher)).resolves.toBe(
      "not_configured",
    );
    expect(listForEgress).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stays quiet when no report is waiting", async () => {
    const fetcher = vi.fn();

    await expect(dispatchBugfixDraft(configured, repository(0).repository, fetcher)).resolves.toBe(
      "idle",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("dispatches the workflow on main without sending any report detail", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(dispatchBugfixDraft(configured, repository(1).repository, fetcher)).resolves.toBe(
      "dispatched",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.github.com/repos/dondon3109/Budget-and-expense-analysis-tool/actions/workflows/bugfix.yml/dispatches",
    );
    expect(init.body).toBe(JSON.stringify({ ref: "main" }));
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer github_pat_test");
  });

  it("fails loudly when GitHub refuses the dispatch", async () => {
    const fetcher = vi.fn(async () => new Response("Bad credentials", { status: 401 }));

    await expect(
      dispatchBugfixDraft(configured, repository(1).repository, fetcher),
    ).rejects.toThrow("status 401");
  });
});
