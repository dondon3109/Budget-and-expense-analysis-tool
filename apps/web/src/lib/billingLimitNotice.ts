import { isResourceLimitReachedError, isUpgradeRequiredError } from "./api";

interface BillingLimitNotice {
  error: unknown;
  returnFocus: HTMLElement | null;
}

let current: BillingLimitNotice | undefined;
const listeners = new Set<() => void>();

function publish(next: BillingLimitNotice | undefined) {
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Raises the plan limit dialog for a resource limit or a Pro-only action. Monthly usage limits
 * are not raised here: the Assistant and Import pages show their own dialog for those.
 */
export function reportBillingLimit(error: unknown) {
  if (!isResourceLimitReachedError(error) && !isUpgradeRequiredError(error)) return;
  const active = document.activeElement;
  publish({ error, returnFocus: active instanceof HTMLElement ? active : null });
}

export function dismissBillingLimit() {
  publish(undefined);
}

export function subscribeBillingLimit(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBillingLimitNotice() {
  return current;
}
