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
