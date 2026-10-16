/**
 * The signed-in person's choice to link usage analytics and crash reports to
 * their account, the mobile counterpart of the web's Analytics consent. Until
 * they choose "granted", telemetry stays on PostHog's per-launch device id.
 *
 * The choice is kept per account on this device, so another account signing
 * in here is asked again.
 */
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import { telemetry, type TelemetryAccount } from "./telemetry";

export type AccountLinkChoice = "granted" | "declined";

interface AccountLinkState {
  account: TelemetryAccount | null;
  /** Null until read from storage, or while the person has not chosen. */
  choice: AccountLinkChoice | null;
  loaded: boolean;
}

let state: AccountLinkState = { account: null, choice: null, loaded: false };
const listeners = new Set<() => void>();

function publish(next: AccountLinkState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// SecureStore keys allow only alphanumerics, ".", "-", and "_", which a Supabase user id meets.
function storageKey(accountId: string): string {
  return `zoption.analytics.account-link.${accountId}`;
}

function parseChoice(value: string | null): AccountLinkChoice | null {
  return value === "granted" || value === "declined" ? value : null;
}

/**
 * Called by the session on every identity change. A signed-in account is
 * identified only when it already granted the link on this device.
 */
export function setSignedInAccount(account: TelemetryAccount | null): void {
  publish({ account, choice: null, loaded: false });
  if (!account) return;
  void SecureStore.getItemAsync(storageKey(account.id))
    .catch(() => null)
    .then((stored) => {
      if (state.account?.id !== account.id) return;
      const choice = parseChoice(stored);
      publish({ account, choice, loaded: true });
      if (choice === "granted") telemetry.identify(account);
    });
}

/** Saves the choice for the signed-in account and applies it at once. */
export async function chooseAccountLink(choice: AccountLinkChoice): Promise<void> {
  const account = state.account;
  if (!account) return;
  publish({ account, choice, loaded: true });
  if (choice === "granted") telemetry.identify(account);
  else await telemetry.reset();
  await SecureStore.setItemAsync(storageKey(account.id), choice).catch(() => undefined);
}

export interface AccountLinkView {
  signedIn: boolean;
  choice: AccountLinkChoice | null;
  /** True once storage answered and the account has not chosen yet. */
  needsChoice: boolean;
}

export function useAccountLink(): AccountLinkView {
  const current = useSyncExternalStore(subscribe, () => state);
  return {
    signedIn: current.account !== null,
    choice: current.choice,
    needsChoice: current.account !== null && current.loaded && current.choice === null,
  };
}

/** Clears module state between tests. */
export function resetAccountLinkForTests(): void {
  publish({ account: null, choice: null, loaded: false });
}
