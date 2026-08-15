import NetInfo from "@react-native-community/netinfo";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import {
  BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
  BACKGROUND_SYNC_TASK_NAME,
  registerBackgroundSyncTask,
  runBackgroundSync,
  setBackgroundSyncRunner,
  shouldRunBackgroundSync,
} from "./background-sync-task";

jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(async () => 2),
  registerTaskAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(async () => ({ isInternetReachable: true, isConnected: true })),
}));

const mockedBackgroundTask = jest.mocked(BackgroundTask);
const mockedTaskManager = jest.mocked(TaskManager);
const mockedNetInfo = jest.mocked(NetInfo);

// defineTask must run at module scope of background-sync-task, which executes
// while this file's imports load — before any beforeEach clearAllMocks. Copy
// the call out now so the assertion survives the reset.
const firstDefinitionCall = (
  mockedTaskManager.defineTask as unknown as { mock: { calls: unknown[][] } }
).mock.calls[0];
const moduleScopeDefinition: unknown[] = (firstDefinitionCall ?? []).slice();

describe("background sync task", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setBackgroundSyncRunner(null);
    mockedBackgroundTask.getStatusAsync.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Available,
    );
    mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
    mockedBackgroundTask.registerTaskAsync.mockResolvedValue(undefined);
    mockedNetInfo.fetch.mockResolvedValue({ isInternetReachable: true, isConnected: true } as never);
  });

  it("defines the task at module scope before registration", () => {
    expect(moduleScopeDefinition[0]).toBe(BACKGROUND_SYNC_TASK_NAME);
    expect(typeof moduleScopeDefinition[1]).toBe("function");
  });

  it("guards runs on reachability and runner availability", () => {
    expect(shouldRunBackgroundSync({ hasRunner: true, reachable: true })).toBe(true);
    expect(shouldRunBackgroundSync({ hasRunner: false, reachable: true })).toBe(false);
    expect(shouldRunBackgroundSync({ hasRunner: true, reachable: false })).toBe(false);
  });

  it("declines without a runner and reports success, not failure", async () => {
    await expect(runBackgroundSync()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(mockedNetInfo.fetch).toHaveBeenCalled();
  });

  it("runs the registered runner once and reports success", async () => {
    const runner = jest.fn(async () => undefined);
    setBackgroundSyncRunner(runner);
    await expect(runBackgroundSync()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("reports failure when the runner throws so the OS may retry", async () => {
    setBackgroundSyncRunner(async () => {
      throw new Error("push rejected");
    });
    await expect(runBackgroundSync()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Failed);
  });

  it("treats offline reachability as a no-op success", async () => {
    setBackgroundSyncRunner(jest.fn(async () => undefined));
    mockedNetInfo.fetch.mockResolvedValue({ isInternetReachable: false, isConnected: true } as never);
    await expect(runBackgroundSync()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);
  });

  it("registers once with the platform minimum interval", async () => {
    await registerBackgroundSyncTask();
    await registerBackgroundSyncTask();
    expect(mockedBackgroundTask.registerTaskAsync).toHaveBeenCalledTimes(1);
    expect(mockedBackgroundTask.registerTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
    });
  });

  it("skips registration when the platform restricts background tasks", async () => {
    mockedBackgroundTask.getStatusAsync.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Restricted,
    );
    await registerBackgroundSyncTask();
    expect(mockedBackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });

  it("keeps an already-registered task untouched", async () => {
    mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
    await registerBackgroundSyncTask();
    expect(mockedBackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });
});
