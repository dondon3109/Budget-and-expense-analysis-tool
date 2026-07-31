import type { BillingInterval } from "@zoption/shared";

import { startBillingCheckout } from "./api";
import { getPaddle } from "./paddle";
import type { AuthenticatedWorkspace } from "./workspace";

export async function openBillingCheckout(
  workspace: AuthenticatedWorkspace,
  interval: BillingInterval,
  email?: string,
) {
  const checkout = await startBillingCheckout(workspace, interval);
  const paddle = await getPaddle();
  if (!paddle) throw new Error("Paddle checkout could not be loaded.");

  const successUrl = new URL("/app/settings", window.location.origin);
  successUrl.searchParams.set("checkout", "completed");
  paddle.Checkout.open({
    items: [{ priceId: checkout.priceId, quantity: 1 }],
    customer: email ? { email } : undefined,
    customData: { zoption_checkout_reference: checkout.reference },
    settings: {
      displayMode: "overlay",
      variant: "one-page",
      theme: "light",
      successUrl: successUrl.toString(),
    },
  });
}
