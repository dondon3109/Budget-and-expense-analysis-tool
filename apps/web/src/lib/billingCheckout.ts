import type { BillingInterval } from "@zoption/shared";

import { startBillingCheckout } from "./api";
import type { AuthenticatedWorkspace } from "./workspace";

/** Shown whenever a checkout target cannot be trusted or the SDK fails to open it. */
export const CHECKOUT_OPEN_ERROR =
  "Secure payment could not be opened. Continue on PayPal to finish subscribing.";

/** The only hosts a PayPal approval link or SDK redirect target may use. */
const PAYPAL_HOST = "www.paypal.com";
const PAYPAL_SANDBOX_HOST = "www.sandbox.paypal.com";

/**
 * Sends the browser to a PayPal approval or checkout URL.
 *
 * The API pins its approval link to a PayPal host, but the PayPal SDK hands back
 * a redirect target too, and neither value may reach window.location.assign
 * unvalidated: an unchecked assign out of the signed-in app is an open redirect.
 * The sandbox host is only trusted outside a production build.
 */
export function redirectToPaypalCheckout(url: string): void {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error(CHECKOUT_OPEN_ERROR);
  }

  const host = target.hostname.toLowerCase();
  const trustedHost =
    host === PAYPAL_HOST || (host === PAYPAL_SANDBOX_HOST && !import.meta.env.PROD);
  if (target.protocol !== "https:" || target.username || target.password || !trustedHost) {
    throw new Error(CHECKOUT_OPEN_ERROR);
  }

  window.location.assign(url);
}

export async function openBillingCheckout(
  workspace: AuthenticatedWorkspace,
  interval: BillingInterval,
) {
  const checkout = await startBillingCheckout(workspace, interval);
  redirectToPaypalCheckout(checkout.approvalUrl);
}
