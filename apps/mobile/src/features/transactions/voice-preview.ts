import type { TransactionVoiceDraft } from "@zoption/shared";

export const VOICE_PREVIEW_AUTO_SAVE_MS = 3000;

export type VoicePreviewStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "discarded"
  | "error";

export interface VoicePreviewIdleState {
  status: "idle";
}

export interface VoicePreviewPendingState {
  status: "pending";
  draft: TransactionVoiceDraft;
  remainingMs: number;
}

export interface VoicePreviewSavingState {
  status: "saving";
  draft: TransactionVoiceDraft;
}

export interface VoicePreviewSavedState {
  status: "saved";
  draft: TransactionVoiceDraft;
}

export interface VoicePreviewDiscardedState {
  status: "discarded";
}

export interface VoicePreviewErrorState {
  status: "error";
  draft: TransactionVoiceDraft;
  error: string;
}

export type VoicePreviewState =
  | VoicePreviewIdleState
  | VoicePreviewPendingState
  | VoicePreviewSavingState
  | VoicePreviewSavedState
  | VoicePreviewDiscardedState
  | VoicePreviewErrorState;

export const initialVoicePreviewState: VoicePreviewState = { status: "idle" };

export type VoicePreviewAction =
  | { type: "START"; draft: TransactionVoiceDraft; durationMs?: number }
  | { type: "TICK"; deltaMs: number }
  | { type: "EDIT" }
  | { type: "CANCEL" }
  | { type: "TRIGGER_SAVE" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_ERROR"; error: string }
  | { type: "RESET" };

export function startVoicePreviewAction(
  draft: TransactionVoiceDraft,
  durationMs: number = VOICE_PREVIEW_AUTO_SAVE_MS,
): VoicePreviewAction {
  return { type: "START", draft, durationMs };
}

export function tickVoicePreviewAction(deltaMs: number): VoicePreviewAction {
  return { type: "TICK", deltaMs };
}

export function editVoicePreviewAction(): VoicePreviewAction {
  return { type: "EDIT" };
}

export function cancelVoicePreviewAction(): VoicePreviewAction {
  return { type: "CANCEL" };
}

export function triggerSaveVoicePreviewAction(): VoicePreviewAction {
  return { type: "TRIGGER_SAVE" };
}

export function saveSuccessVoicePreviewAction(): VoicePreviewAction {
  return { type: "SAVE_SUCCESS" };
}

export function saveErrorVoicePreviewAction(error: string): VoicePreviewAction {
  return { type: "SAVE_ERROR", error };
}

export function resetVoicePreviewAction(): VoicePreviewAction {
  return { type: "RESET" };
}

export function remainingSecondsFromMs(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function voicePreviewReducer(
  state: VoicePreviewState,
  action: VoicePreviewAction,
): VoicePreviewState {
  switch (action.type) {
    case "START":
      // If saving is already in progress, guard against interruption
      if (state.status === "saving") {
        return state;
      }
      return {
        status: "pending",
        draft: action.draft,
        remainingMs: action.durationMs ?? VOICE_PREVIEW_AUTO_SAVE_MS,
      };

    case "TICK": {
      if (state.status !== "pending") {
        return state;
      }
      const remainingMs = Math.max(0, state.remainingMs - action.deltaMs);
      if (remainingMs === 0) {
        return {
          status: "saving",
          draft: state.draft,
        };
      }
      return {
        ...state,
        remainingMs,
      };
    }

    case "EDIT":
      // User tapped Edit: dismiss preview, keep values in form
      if (state.status === "saving" || state.status === "saved") {
        return state;
      }
      return { status: "idle" };

    case "CANCEL":
      // User tapped Cancel: cancel countdown and mark discarded
      if (state.status === "saving" || state.status === "saved") {
        return state;
      }
      return { status: "discarded" };

    case "TRIGGER_SAVE":
      if (state.status === "pending") {
        return {
          status: "saving",
          draft: state.draft,
        };
      }
      return state;

    case "SAVE_SUCCESS":
      if (state.status === "saving") {
        return {
          status: "saved",
          draft: state.draft,
        };
      }
      return state;

    case "SAVE_ERROR":
      if (state.status === "saving" || state.status === "pending") {
        return {
          status: "error",
          draft: state.draft,
          error: action.error,
        };
      }
      return state;

    case "RESET":
      return { status: "idle" };

    default:
      return state;
  }
}

export interface VoicePreviewMachineOptions {
  autoSaveDurationMs?: number;
  onAutoSave?: (draft: TransactionVoiceDraft) => Promise<void> | void;
  onDiscard?: () => void;
  onStateChange?: (state: VoicePreviewState) => void;
}

export class VoicePreviewMachine {
  private state: VoicePreviewState = initialVoicePreviewState;
  private autoSaveDurationMs: number;
  private onAutoSave?: (draft: TransactionVoiceDraft) => Promise<void> | void;
  private onDiscard?: () => void;
  private onStateChange?: (state: VoicePreviewState) => void;

  constructor(options: VoicePreviewMachineOptions = {}) {
    this.autoSaveDurationMs = options.autoSaveDurationMs ?? VOICE_PREVIEW_AUTO_SAVE_MS;
    this.onAutoSave = options.onAutoSave;
    this.onDiscard = options.onDiscard;
    this.onStateChange = options.onStateChange;
  }

  updateOptions(options: Partial<VoicePreviewMachineOptions>): void {
    if (options.autoSaveDurationMs !== undefined) {
      this.autoSaveDurationMs = options.autoSaveDurationMs;
    }
    if (options.onAutoSave !== undefined) {
      this.onAutoSave = options.onAutoSave;
    }
    if (options.onDiscard !== undefined) {
      this.onDiscard = options.onDiscard;
    }
    if (options.onStateChange !== undefined) {
      this.onStateChange = options.onStateChange;
    }
  }

  getState(): VoicePreviewState {
    return this.state;
  }

  start(draft: TransactionVoiceDraft, durationMs?: number): void {
    this.transition({
      type: "START",
      draft,
      durationMs: durationMs ?? this.autoSaveDurationMs,
    });
  }

  tick(deltaMs: number): void {
    this.transition({ type: "TICK", deltaMs });
  }

  edit(): void {
    this.transition({ type: "EDIT" });
  }

  cancel(): void {
    this.transition({ type: "CANCEL" });
  }

  markSaveSuccess(): void {
    this.transition({ type: "SAVE_SUCCESS" });
  }

  markSaveError(error: string): void {
    this.transition({ type: "SAVE_ERROR", error });
  }

  reset(): void {
    this.transition({ type: "RESET" });
  }

  private transition(action: VoicePreviewAction): void {
    const prevStatus = this.state.status;
    const nextState = voicePreviewReducer(this.state, action);
    this.state = nextState;
    this.onStateChange?.(nextState);

    if (prevStatus === "pending" && nextState.status === "saving") {
      this.triggerAutoSave(nextState.draft);
    } else if (prevStatus !== "discarded" && nextState.status === "discarded") {
      this.onDiscard?.();
    }
  }

  private triggerAutoSave(draft: TransactionVoiceDraft): void {
    if (!this.onAutoSave) return;
    try {
      const result = this.onAutoSave(draft);
      if (result) {
        result
          .then(() => {
            this.markSaveSuccess();
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : "Auto-save failed";
            this.markSaveError(message);
          });
      } else {
        this.markSaveSuccess();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Auto-save failed";
      this.markSaveError(message);
    }
  }
}

export function createVoicePreviewMachine(
  options?: VoicePreviewMachineOptions,
): VoicePreviewMachine {
  return new VoicePreviewMachine(options);
}
