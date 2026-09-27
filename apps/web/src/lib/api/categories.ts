import type { CategoryInput, CategoryRecord, CategoryUpdate } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export async function getCategories(
  workspace: AuthenticatedWorkspace,
  includeArchived = false,
): Promise<CategoryRecord[]> {
  const result = await requestJson<{ items: CategoryRecord[] }>(
    workspace,
    `/api/app/categories${includeArchived ? "?includeArchived=true" : ""}`,
  );
  return result.items;
}

export function createCategory(
  workspace: AuthenticatedWorkspace,
  input: CategoryInput,
): Promise<CategoryRecord> {
  return requestJson(workspace, "/api/app/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCategory(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: CategoryUpdate },
): Promise<CategoryRecord> {
  return requestJson(workspace, `/api/app/categories/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}
