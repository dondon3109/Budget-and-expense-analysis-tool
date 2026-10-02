import { useRouter } from "expo-router";
import { useSyncExternalStore } from "react";

import { ConfirmationDialog } from "@/ui/components";

let currentMessage: string | null = null;
const listeners = new Set<() => void>();

function publish(message: string | null): void {
  currentMessage = message;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Raises the plan limit dialog. Callers pass the server's message: an assistant or import
 * request the plan refused, or a saved change the server rejected during sync.
 */
export function reportPlanLimit(message: string): void {
  publish(message);
}

/** Mounted once in the authenticated gate so every screen shares one dialog. */
export function PlanLimitHost() {
  const router = useRouter();
  const message = useSyncExternalStore(subscribe, () => currentMessage);

  return (
    <ConfirmationDialog
      visible={message !== null}
      title="Plan limit reached"
      message={message ?? ""}
      confirmLabel="Review Plan and billing"
      onCancel={() => publish(null)}
      onConfirm={() => {
        publish(null);
        router.push("/(app)/plan-billing");
      }}
    />
  );
}
