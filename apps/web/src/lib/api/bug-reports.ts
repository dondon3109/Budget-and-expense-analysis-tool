import type {
  AdminBugReport,
  BugReport,
  BugReportCreateInput,
  BugReportStatus,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function createBugReport(
  workspace: AuthenticatedWorkspace,
  input: BugReportCreateInput,
): Promise<BugReport> {
  return requestJson(workspace, "/api/app/support/bug-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getBugReports(workspace: AuthenticatedWorkspace): Promise<BugReport[]> {
  return requestJson(workspace, "/api/app/support/bug-reports");
}

export function getAdminBugReports(workspace: AuthenticatedWorkspace): Promise<AdminBugReport[]> {
  return requestJson(workspace, "/api/app/admin/bug-reports");
}

export function updateAdminBugReportStatus(
  workspace: AuthenticatedWorkspace,
  id: string,
  status: BugReportStatus,
): Promise<AdminBugReport> {
  return requestJson(workspace, `/api/app/admin/bug-reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
