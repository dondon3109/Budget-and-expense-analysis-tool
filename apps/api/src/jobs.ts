import type { Bindings } from "./types";

export type JobMessage =
  | { type: "paypal-reconcile"; tenantId: string }
  | { type: "bug-report-notify"; reportId: string }
  | { type: "subscription-renewal-notify"; notificationId: string }
  | { type: "account-deletion"; userId: string };

export async function enqueueJob(
  env: Bindings,
  message: JobMessage,
  options?: { delaySeconds?: number },
): Promise<boolean> {
  if (!env.JOBS) return false;
  try {
    await env.JOBS.send(
      message,
      options?.delaySeconds ? { delaySeconds: options.delaySeconds } : undefined,
    );
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Queue enqueue failed",
        type: message.type,
        errorCode: error instanceof Error ? error.name : "unknown_error",
      }),
    );
    return false;
  }
}
