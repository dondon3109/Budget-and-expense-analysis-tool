import type {
  ImportCommitRequest,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRequest,
} from "@zoption/shared";

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

export function commitImport(
  workspace: AuthenticatedWorkspace,
  input: ImportCommitRequest,
): Promise<ImportCommitResult> {
  return requestJson(workspace, "/api/app/imports/commit", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
