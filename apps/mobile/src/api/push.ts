import type { PushDeviceRegisterInput } from "@zoption/shared";

import { apiRequest } from "./authenticated";

const ignoreBody = (): void => undefined;

/** Tells the Worker this install can receive the signed-in person's push notifications. */
export function registerPushDevice(
  api: { accessToken: string; fetchImpl?: typeof fetch },
  input: PushDeviceRegisterInput,
): Promise<void> {
  return apiRequest({
    ...api,
    path: "/api/app/push/devices",
    method: "PUT",
    body: input,
    fallback: "Notifications could not be turned on for this phone.",
    decode: ignoreBody,
  });
}

/** Stops push to this install; called on sign-out so a shared phone stops showing them. */
export function unregisterPushDevice(
  api: { accessToken: string; fetchImpl?: typeof fetch; timeoutMs?: number },
  token: string,
): Promise<void> {
  return apiRequest({
    ...api,
    path: "/api/app/push/devices/unregister",
    method: "POST",
    body: { token },
    fallback: "Notifications could not be turned off for this phone.",
    decode: ignoreBody,
  });
}
