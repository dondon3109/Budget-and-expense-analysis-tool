export interface OtaUpdateCheckResponse {
  isAvailable: boolean;
  isRollBackToEmbedded: boolean;
}

export interface OtaUpdateFetchResponse {
  isNew: boolean;
  isRollBackToEmbedded: boolean;
}

export interface OtaUpdateClient {
  readonly isEnabled: boolean;
  checkForUpdateAsync(): Promise<OtaUpdateCheckResponse>;
  fetchUpdateAsync(): Promise<OtaUpdateFetchResponse>;
  reloadAsync(): Promise<void>;
}

export type OtaUpdateResult =
  { status: "current" } | { status: "ready"; rollBackToEmbedded: boolean };

/**
 * Checks and downloads only runtime-compatible JS/assets. Native compatibility
 * remains owned by Expo's embedded runtimeVersion; APK installation is a
 * separate service and is intentionally never called from this module.
 */
export async function checkAndDownloadOtaUpdate(
  client: OtaUpdateClient,
  onPhase?: (phase: "checking" | "downloading") => void,
): Promise<OtaUpdateResult> {
  onPhase?.("checking");
  const check = await client.checkForUpdateAsync();
  if (!check.isAvailable && !check.isRollBackToEmbedded) {
    return { status: "current" };
  }

  onPhase?.("downloading");
  const fetched = await client.fetchUpdateAsync();
  if (fetched.isNew || fetched.isRollBackToEmbedded) {
    return {
      status: "ready",
      rollBackToEmbedded: fetched.isRollBackToEmbedded,
    };
  }
  return { status: "current" };
}
