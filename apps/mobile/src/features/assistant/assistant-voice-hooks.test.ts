jest.mock("expo-audio", () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: { HIGH_QUALITY: "hq" },
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioPlayer: jest.fn(() => ({})),
  useAudioPlayerStatus: jest.fn(() => ({})),
  useAudioRecorder: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: { cache: "/cache" },
}));

jest.mock("@/api/voice-stream", () => ({
  startMobileVoiceStream: jest.fn(async () => ({
    stop: jest.fn(async () => null),
    cancel: jest.fn(),
    live: false,
  })),
}));

jest.mock("@/files/temporary-source-file", () => ({
  discardTemporarySourceFile: jest.fn(),
}));

jest.mock("@/api/assistant-voice", () => {
  const actual = jest.requireActual("@/api/assistant-voice");
  return {
    ...actual,
    transcribeVoice: jest.fn(async () => ({ text: "transcribed", durationSeconds: 2 })),
  };
});

import { act, renderHook } from "@testing-library/react-native";

import { transcribeVoice } from "@/api/assistant-voice";
import { startMobileVoiceStream } from "@/api/voice-stream";
import { useVoiceLanguageStore } from "@/stores/voice-language-store";
import { useAssistantRecorder, useVoiceRecorder } from "./assistant-voice-hooks";
import {
  armAssistantRecorder,
  playbackAudioMode,
  recordingAudioMode,
} from "./assistant-voice-session";

describe("armAssistantRecorder", () => {
  it("sets a recording session and prepares before record()", async () => {
    const prepareToRecordAsync = jest.fn(async () => undefined);
    const record = jest.fn();
    const setAudioMode = jest.fn(async () => undefined);

    await armAssistantRecorder({ prepareToRecordAsync, record }, setAudioMode);

    expect(setAudioMode).toHaveBeenCalledWith(recordingAudioMode);
    expect(prepareToRecordAsync).toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith({ forDuration: 60 });
    expect(setAudioMode.mock.invocationCallOrder[0]).toBeLessThan(
      prepareToRecordAsync.mock.invocationCallOrder[0]!,
    );
    expect(prepareToRecordAsync.mock.invocationCallOrder[0]).toBeLessThan(
      record.mock.invocationCallOrder[0]!,
    );
  });

  it("does not record when prepare fails", async () => {
    const record = jest.fn();
    await expect(
      armAssistantRecorder(
        {
          prepareToRecordAsync: async () => {
            throw new Error("unprepared");
          },
          record,
        },
        async () => undefined,
      ),
    ).rejects.toThrow("unprepared");
    expect(record).not.toHaveBeenCalled();
  });

  it("keeps playback audio from mixing with an active recording session", () => {
    expect(recordingAudioMode.allowsRecording).toBe(true);
    expect(playbackAudioMode.allowsRecording).toBe(false);
  });
});

describe("useVoiceRecorder unmount during recording", () => {
  function audioMocks() {
    return jest.requireMock("expo-audio") as {
      AudioModule: { requestRecordingPermissionsAsync: jest.Mock };
      useAudioRecorder: jest.Mock;
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("never surfaces a released native recorder as a render error", async () => {
    // Replays the on-device RedBox: leaving voice chat mid-recording read
    // `.uri` on an already-released AudioRecorder SharedObject, and the
    // synchronous native throw escaped as a render error.
    const releasedRecorder = {
      prepareToRecordAsync: jest.fn(async () => undefined),
      record: jest.fn(),
      stop: jest.fn(async () => undefined),
      get uri(): string | null {
        throw new Error("Cannot use shared object that was already released");
      },
    };
    audioMocks().useAudioRecorder.mockReturnValue(releasedRecorder);

    const { result, unmount } = await renderHook(() =>
      useVoiceRecorder<string>({
        getAccessToken: async () => "token",
        onTranscribed: jest.fn(),
        onError: jest.fn(),
        transcribe: jest.fn(async () => "done"),
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.phase).toBe("recording");

    expect(() => unmount()).not.toThrow();
  });

  it("never starts capturing after cancel during warm-up", async () => {
    let resolvePermission!: (value: { granted: boolean }) => void;
    const permissionGate = new Promise<{ granted: boolean }>((resolve) => {
      resolvePermission = resolve;
    });
    let resolvePrepare!: () => void;
    const prepareGate = new Promise<void>((resolve) => {
      resolvePrepare = resolve;
    });
    audioMocks().AudioModule.requestRecordingPermissionsAsync.mockResolvedValueOnce(permissionGate);
    const pendingRecorder = {
      prepareToRecordAsync: jest.fn(() => prepareGate),
      record: jest.fn(),
      stop: jest.fn(async () => undefined),
      uri: "file://pending.m4a",
    };
    audioMocks().useAudioRecorder.mockReturnValue(pendingRecorder);

    const { result } = await renderHook(() =>
      useVoiceRecorder<string>({
        getAccessToken: async () => "token",
        onTranscribed: jest.fn(),
        onError: jest.fn(),
        transcribe: jest.fn(async () => "done"),
      }),
    );

    let started!: Promise<void>;
    await act(async () => {
      started = result.current.startRecording();
    });
    expect(result.current.phase).toBe("requesting");

    await act(async () => {
      await result.current.cancelRecording();
    });
    await act(async () => {
      resolvePermission({ granted: true });
      resolvePrepare();
      await started;
    });

    expect(pendingRecorder.record).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });
});

describe("voice language forwarding in recorder hooks", () => {
  function audioMocks() {
    return jest.requireMock("expo-audio") as {
      AudioModule: { requestRecordingPermissionsAsync: jest.Mock };
      useAudioRecorder: jest.Mock;
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useVoiceLanguageStore.setState({ language: "auto" });
    audioMocks().AudioModule.requestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
    audioMocks().useAudioRecorder.mockReturnValue({
      prepareToRecordAsync: jest.fn(async () => undefined),
      record: jest.fn(),
      stop: jest.fn(async () => undefined),
      uri: "file://test.m4a",
    });
  });

  it("forwards default auto language to startMobileVoiceStream", async () => {
    const { result } = await renderHook(() =>
      useVoiceRecorder<string>({
        getAccessToken: async () => "test-token",
        onTranscribed: jest.fn(),
        onError: jest.fn(),
        transcribe: jest.fn(async () => "done"),
        onPartialTranscript: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(startMobileVoiceStream).toHaveBeenCalledWith("test-token", expect.any(Object), {
      language: "auto",
    });
  });

  it("forwards configured or explicit language to startMobileVoiceStream", async () => {
    useVoiceLanguageStore.setState({ language: "fil" });

    const { result } = await renderHook(() =>
      useVoiceRecorder<string>({
        getAccessToken: async () => "test-token",
        onTranscribed: jest.fn(),
        onError: jest.fn(),
        transcribe: jest.fn(async () => "done"),
        onPartialTranscript: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(startMobileVoiceStream).toHaveBeenCalledWith("test-token", expect.any(Object), {
      language: "fil",
    });
  });

  it("forwards language to transcribeVoice in useAssistantRecorder", async () => {
    useVoiceLanguageStore.setState({ language: "en" });

    const { result } = await renderHook(() =>
      useAssistantRecorder({
        getAccessToken: async () => "test-token",
        onTranscribed: jest.fn(),
        onError: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      await result.current.stopAndTranscribe();
    });

    expect(transcribeVoice).toHaveBeenCalledWith(
      { accessToken: "test-token" },
      expect.objectContaining({ uri: "file://test.m4a", mimeType: "audio/mp4" }),
      { language: "en" },
    );
  });
});
