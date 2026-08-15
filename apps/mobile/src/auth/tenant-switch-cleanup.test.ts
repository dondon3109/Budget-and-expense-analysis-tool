import { clearUserScopedRuntimeState } from "./session-state";
import { clearPlanCache } from "@/auth/plan-state";
import { useAssistantVoiceOptionsStore } from "@/stores/assistant-voice-store";
import { useSheetStore } from "@/stores/sheet-store";

jest.mock("@/auth/plan-state", () => ({
  clearPlanCache: jest.fn(),
}));

jest.mock("@/stores/assistant-voice-store", () => ({
  useAssistantVoiceOptionsStore: {
    getState: jest.fn(() => ({
      ensureSubject: jest.fn(),
      setState: jest.fn(),
    })),
  },
}));

const mockedClearPlanCache = jest.mocked(clearPlanCache);

describe("identity transition cleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("closes sheets, resets voice options and clears the plan cache", () => {
    useSheetStore.setState({ openSheet: "theme-picker" });
    const voiceReset = jest.fn();
    (
      useAssistantVoiceOptionsStore.getState as unknown as jest.Mock
    ).mockReturnValue({ ensureSubject: voiceReset, setState: jest.fn() });

    clearUserScopedRuntimeState();

    expect(useSheetStore.getState().openSheet).toBe(null);
    expect(voiceReset).toHaveBeenCalledWith(null);
    expect(mockedClearPlanCache).toHaveBeenCalled();
  });
});
