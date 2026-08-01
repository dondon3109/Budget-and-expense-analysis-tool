import type { BillingInterval } from "@zoption/shared";

import { startBillingCheckout } from "./api";
import type { AuthenticatedWorkspace } from "./workspace";

export async function openBillingCheckout(workspace: AuthenticatedWorkspace, interval: BillingInterval) {
  const checkout = await startBillingCheckout(workspace, interval);
  window.location.assign(checkout.approvalUrl);
}
