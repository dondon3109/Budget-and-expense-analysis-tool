import type {
  ImportCommitRequest,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRequest,
} from "@zoption/shared";

import { captureFunnelEvent } from "../../analytics/funnel";
import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function previewImport(
  workspace: AuthenticatedWorkspace,
  input: ImportPreviewRequest,
): Promise<ImportPreview> {
  return requestJson(workspace, "/api/app/imports/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function commitImport(
  workspace: AuthenticatedWorkspace,
  input: ImportCommitRequest,
): Promise<ImportCommitResult> {
  const result = await requestJson<ImportCommitResult>(workspace, "/api/app/imports/commit", {
    method: "POST",
    body: JSON.stringify(input),
  });
  captureFunnelEvent("import_completed", {});
  return result;
}
