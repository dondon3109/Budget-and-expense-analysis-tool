import { bugReportRepository, type BugReportRepository } from "../db/bug-reports";
import type { Bindings } from "../types";

const BUGFIX_WORKFLOW_DISPATCH_URL =
  "https://api.github.com/repos/dondon3109/Budget-and-expense-analysis-tool/actions/workflows/bugfix.yml/dispatches";

export type BugfixDispatchOutcome = "not_configured" | "idle" | "dispatched";

/**
 * Starts the bugfix draft workflow when a report is waiting to cross egress. GitHub's own
 * schedule never fired for this repository, so the Worker's cron is the automation's timer.
 *
 * Reading the queue here does not claim anything: only the egress route records a crossing, and
 * the workflow's claim job calls it. The dispatch carries no report id, so the Worker sends
 * GitHub nothing about any report.
 */
export async function dispatchBugfixDraft(
  env: Bindings,
  repository: BugReportRepository = bugReportRepository,
  fetcher: typeof fetch = fetch,
): Promise<BugfixDispatchOutcome> {
  // Only Production holds the token, so a Preview Worker never starts drafts.
  const token = env.GITHUB_BUGFIX_DISPATCH_TOKEN?.trim();
  if (!token) return "not_configured";

  const waiting = await repository.listForEgress(env, 1);
  if (waiting.length === 0) return "idle";

  const response = await fetcher(BUGFIX_WORKFLOW_DISPATCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "zoption-api",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!response.ok) {
    throw new Error(`Bugfix workflow dispatch failed with status ${response.status}`);
  }
  return "dispatched";
}
