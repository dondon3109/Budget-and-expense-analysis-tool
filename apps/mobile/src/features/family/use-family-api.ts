import { useCallback } from "react";

import type { FamilyApi } from "@/api/family";
import { useSessionSnapshot } from "@/auth/session-state";

import { useActiveWorkspace } from "./active-workspace";

/**
 * Calls an online family surface in the family shown with a current token, or null outside a
 * family. These surfaces need a connection; their callers say so when a call fails.
 */
export function useFamilyApi(): (<T>(call: (api: FamilyApi) => Promise<T>) => Promise<T>) | null {
  const { getAccessToken } = useSessionSnapshot();
  const workspaceId = useActiveWorkspace().family?.id ?? null;
  const run = useCallback(
    async <T>(call: (api: FamilyApi) => Promise<T>): Promise<T> => {
      if (!workspaceId) throw new Error("Switch to a family first.");
      return call({ accessToken: await getAccessToken(false), workspaceId });
    },
    [getAccessToken, workspaceId],
  );
  return workspaceId ? run : null;
}

/** How a family member is named: "You", their verified email, or a former member. */
export function memberLabel(
  userId: string,
  me: string | null,
  members: readonly { userId: string; email: string | null }[],
): string {
  if (userId === me) return "You";
  return members.find((member) => member.userId === userId)?.email ?? "A former member";
}
