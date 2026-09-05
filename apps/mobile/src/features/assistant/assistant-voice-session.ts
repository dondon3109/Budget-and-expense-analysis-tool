export const MAX_RECORDING_SECONDS = 60;

export const recordingAudioMode = {
  allowsRecording: true,
  playsInSilentMode: true,
  interruptionMode: "doNotMix" as const,
};

export const playbackAudioMode = {
  allowsRecording: false,
  playsInSilentMode: true,
  interruptionMode: "mixWithOthers" as const,
};

export interface AssistantRecorderControls {
  prepareToRecordAsync: () => Promise<void>;
  record: (options?: { forDuration?: number }) => void;
  stop: () => Promise<void>;
  readonly uri: string | null;
}

/** Permission, session, and prepare must all succeed before record() is armed. */
export async function armAssistantRecorder(
  recorder: Pick<AssistantRecorderControls, "prepareToRecordAsync" | "record">,
  setAudioMode: (mode: typeof recordingAudioMode) => Promise<void>,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  await setAudioMode(recordingAudioMode);
  await recorder.prepareToRecordAsync();
  // The user may have cancelled (or left) while preparing: never start
  // capturing then, or a stranded take records after they gave up.
  if (isCancelled()) return;
  recorder.record({ forDuration: MAX_RECORDING_SECONDS });
}
