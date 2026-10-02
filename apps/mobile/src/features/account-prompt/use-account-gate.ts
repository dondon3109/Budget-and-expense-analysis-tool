import { router, type Href } from "expo-router";
import { useCallback } from "react";

import { useSessionSnapshot } from "@/auth/session-state";

import type { AccountFeature } from "./account-features";
import { useAccountPromptStore } from "./account-prompt-store";

/**
 * Guards entry points to account-only features. A guest gets the sign-in prompt instead of the
 * feature; everyone else passes through. The Worker still authenticates every request, so this
 * only explains why a guest cannot continue.
 */
export function useAccountGate() {
  const { status } = useSessionSnapshot();
  const open = useAccountPromptStore((state) => state.open);

  /** True when the caller may continue; for a guest, opens the prompt and returns false. */
  const requireAccount = useCallback(
    (feature: AccountFeature): boolean => {
      if (status !== "guest") return true;
      open(feature);
      return false;
    },
    [open, status],
  );

  /** Navigates to the feature's screen, or shows the sign-in prompt for a guest. */
  const openFeature = useCallback(
    (feature: AccountFeature, href: Href): void => {
      if (requireAccount(feature)) router.push(href);
    },
    [requireAccount],
  );

  return { requireAccount, openFeature };
}
