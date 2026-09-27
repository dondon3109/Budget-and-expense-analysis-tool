import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError, apiErrorPayload } from "./errors";
import { workspaceFetch } from "./transport";

export async function uploadProfileAvatar(
  workspace: AuthenticatedWorkspace,
  file: File,
): Promise<{ path: string }> {
  const form = new FormData();
  form.set("file", file, file.name);
  const response = await workspaceFetch(workspace, "/api/app/profile/avatar", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The profile picture could not be uploaded.",
      response.status,
      payload.error ?? "avatar_upload_failed",
      payload.details,
    );
  }
  const payload = (await response.json()) as { path?: unknown };
  if (typeof payload.path !== "string" || !payload.path) {
    throw new ApiRequestError(
      "The profile picture could not be uploaded.",
      502,
      "avatar_upload_failed",
    );
  }
  return { path: payload.path };
}

export async function deleteProfileAvatarObject(
  workspace: AuthenticatedWorkspace,
  path: string,
): Promise<void> {
  const response = await workspaceFetch(workspace, "/api/app/profile/avatar", {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok && response.status !== 204) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The profile picture could not be removed.",
      response.status,
      payload.error ?? "avatar_delete_failed",
      payload.details,
    );
  }
}
