import * as Notifications from "expo-notifications";

import { logWidgetVoiceNote } from "./widget-voice-log";
import { runWidgetVoiceTask } from "./widget-voice-task";

jest.mock("./widget-voice-log", () => ({
  ...jest.requireActual("./widget-voice-log"),
  logWidgetVoiceNote: jest.fn(),
}));
jest.mock("@/auth/supabase-client", () => ({ getSupabaseClient: jest.fn() }));
jest.mock("@/db/workspace", () => ({ openLocalWorkspace: jest.fn() }));
jest.mock("@/api/ai-entry", () => ({ extractVoiceTransactionsFromTranscript: jest.fn() }));

const mockedLog = logWidgetVoiceNote as jest.MockedFunction<typeof logWidgetVoiceNote>;
const mockedPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockedSchedule = Notifications.scheduleNotificationAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
});

function lastNotification() {
  return mockedSchedule.mock.calls.at(-1)?.[0] as {
    identifier: string;
    content: { body: string; data?: { transcript: string } };
  };
}

describe("widget voice task", () => {
  it("registers at module scope under the name the native service starts", () => {
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports -- a fresh module registry needs a sync require */
      const { AppRegistry } = require("react-native");
      const register = jest.spyOn(AppRegistry, "registerHeadlessTask").mockImplementation();
      const task = require("./widget-voice-task");
      /* eslint-enable @typescript-eslint/no-require-imports */
      expect(task.WIDGET_VOICE_TASK_NAME).toBe("ZoptionWidgetVoiceLog");
      expect(register).toHaveBeenCalledWith("ZoptionWidgetVoiceLog", expect.any(Function));
    });
  });

  it("logs the note and notifies the count", async () => {
    mockedLog.mockResolvedValue({ status: "logged", count: 2 });
    await runWidgetVoiceTask({ transcript: " spent 250 on lunch and 2,000 on groceries " });
    expect(mockedLog).toHaveBeenCalledWith(
      "spent 250 on lunch and 2,000 on groceries",
      expect.any(Object),
    );
    expect(lastNotification().content.body).toMatch(/^Logged 2 transactions/);
    expect(lastNotification().identifier).toMatch(/^zoption-widget-/);
  });

  it("hands a balance update to a tappable review instead of logging it", async () => {
    await runWidgetVoiceTask({ transcript: "adjust BDO savings to 5,000" });
    expect(mockedLog).not.toHaveBeenCalled();
    expect(lastNotification().identifier).toBe("zoption-widget-review");
    expect(lastNotification().content.data).toEqual({
      transcript: "adjust BDO savings to 5,000",
    });
  });

  it("tells the user nothing was saved when logging throws", async () => {
    mockedLog.mockRejectedValue(new Error("boom"));
    await runWidgetVoiceTask({ transcript: "spent 250 on lunch" });
    expect(lastNotification().content.body).toMatch(/Nothing was saved/);
  });

  it("stays silent without notification permission, and ignores an empty note", async () => {
    mockedPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    mockedLog.mockResolvedValue({ status: "logged", count: 1 });
    await runWidgetVoiceTask({ transcript: "spent 250 on lunch" });
    expect(mockedSchedule).not.toHaveBeenCalled();
    await runWidgetVoiceTask({ transcript: "   " });
    await runWidgetVoiceTask(undefined);
    expect(mockedLog).toHaveBeenCalledTimes(1);
  });
});
