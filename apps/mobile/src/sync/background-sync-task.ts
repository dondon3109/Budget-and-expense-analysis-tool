import NetInfo from "@react-native-community/netinfo";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

export const BACKGROUND_SYNC_TASK_NAME = "zoption-background-sync";

// The OS treats this as a minimum delay, not a schedule: iOS typically runs
// background refresh during system-chosen windows and Android WorkManager
// batches work. 15 minutes is the platform minimum.
export const BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES = 15;

export type BackgroundSyncRunner = () => Promise<void>;

let runner: BackgroundSyncRunner | null = null;
let registrationPromise: Promise<void> | null = null;

/**
 * The runner is owned by the mounted sync engine. When the app has been
 * terminated, no React tree exists and the runner is null, so the background
 * task declines to run rather than half-synchronizing without the encrypted
 * workspace and session already open.
 */
export function setBackgroundSyncRunner(next: BackgroundSyncRunner | null): void {
  runner = next;
}

export function hasBackgroundSyncRunner(): boolean {
  return runner !== null;
}

/** Pure guard so interruption and offline semantics stay testable. */
export function shouldRunBackgroundSync({
  hasRunner,
  reachable,
}: {
  hasRunner: boolean;
  reachable: boolean;
}): boolean {
  return hasRunner && reachable;
}

async function reachabilityHint(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isInternetReachable ?? state.isConnected ?? false;
  } catch {
    return false;
  }
}

/**
 * Executes one guarded background synchronization attempt. NetInfo is only a
 * hint here: the Worker's actual response decides success, and the runner's
 * own error classification handles retries.
 */
export async function runBackgroundSync(): Promise<BackgroundTask.BackgroundTaskResult> {
  if (!shouldRunBackgroundSync({ hasRunner: runner !== null, reachable: await reachabilityHint() })) {
    // Nothing to run. Reporting Success avoids the OS treating an intentional
    // no-op as a failed task worth retrying.
    return BackgroundTask.BackgroundTaskResult.Success;
  }
  try {
    await runner?.();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

// Registered at module scope per the expo-background-task contract: the task
// must be defined before registerTaskAsync is called and before the app
// finishes launching.
TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => runBackgroundSync());

/** Registers the OS-level task exactly once per app lifetime. */
export async function registerBackgroundSyncTask(): Promise<void> {
  if (Platform.OS === "web") return;
  if (registrationPromise) return registrationPromise;
  registrationPromise = (async () => {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME);
    if (!registered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
        minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
      });
    }
  })();
  try {
    await registrationPromise;
  } catch (error) {
    registrationPromise = null;
    throw error;
  }
}
