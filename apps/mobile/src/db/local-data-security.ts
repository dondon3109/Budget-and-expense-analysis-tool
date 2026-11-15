import { requireNativeModule } from "expo";

interface LocalDataSecurityNativeModule {
  ensureSQLiteBackupExcludedAsync(): Promise<boolean>;
  /** Android `Settings.Global.BOOT_COUNT`. Absent on iOS. */
  readBootCountAsync(): Promise<number>;
}

let nativeModule: LocalDataSecurityNativeModule | null = null;

function getNativeModule(): LocalDataSecurityNativeModule {
  if (nativeModule) return nativeModule;
  const resolved = requireNativeModule<LocalDataSecurityNativeModule>("ZoptionLocalDataSecurity");
  nativeModule = resolved;
  return resolved;
}

export async function ensureLocalDataBackupProtection(): Promise<void> {
  const protectedFromBackup = await getNativeModule().ensureSQLiteBackupExcludedAsync();
  if (protectedFromBackup !== true) {
    throw new Error("The operating system did not confirm local data backup protection.");
  }
}

/** The device's boot count. Callers treat a failure as "unknown" and keep the session. */
export async function readDeviceBootCount(): Promise<number> {
  return getNativeModule().readBootCountAsync();
}
