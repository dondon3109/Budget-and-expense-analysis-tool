import { useSyncExternalStore } from "react";

import {
  dismissBillingLimit,
  getBillingLimitNotice,
  subscribeBillingLimit,
} from "../../lib/billingLimitNotice";
import { BillingLimitDialog } from "./BillingLimitDialog";

/** Shows the plan limit dialog for any failed mutation or export that hit a billing limit. */
export function BillingLimitHost() {
  const notice = useSyncExternalStore(subscribeBillingLimit, getBillingLimitNotice);
  if (!notice) return null;

  return (
    <BillingLimitDialog
      error={notice.error}
      returnFocus={notice.returnFocus}
      onClose={dismissBillingLimit}
    />
  );
}
