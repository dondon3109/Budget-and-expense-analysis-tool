import type { TransactionVoiceDraft } from "@zoption/shared";
import {
  VOICE_PREVIEW_AUTO_SAVE_MS,
  VoicePreviewMachine,
  remainingSecondsFromMs,
  voicePreviewReducer,
} from "./voice-preview";

const mockDraft: TransactionVoiceDraft = {
  transcript: "Coffee 150 pesos from Cash",
  description: "Coffee",
  date: "2026-09-12",
  amountMinor: 15000,
  currency: "PHP",
  kind: "expense",
  categoryName: "Coffee & Drinks",
};

const mockDraft2: TransactionVoiceDraft = {
  transcript: "Lunch 350 pesos from Wallet",
  description: "Lunch",
  date: "2026-09-12",
  amountMinor: 35000,
  currency: "PHP",
  kind: "expense",
  categoryName: "Food & Dining",
};

describe("voice-preview pure state machine", () => {
  describe("constants and helpers", () => {
    it("exposes VOICE_PREVIEW_AUTO_SAVE_MS as 3000ms", () => {
      expect(VOICE_PREVIEW_AUTO_SAVE_MS).toBe(3000);
    });

    it("calculates whole remaining seconds with remainingSecondsFromMs", () => {
      expect(remainingSecondsFromMs(3000)).toBe(3);
      expect(remainingSecondsFromMs(2500)).toBe(3);
      expect(remainingSecondsFromMs(2000)).toBe(2);
      expect(remainingSecondsFromMs(1500)).toBe(2);
      expect(remainingSecondsFromMs(1000)).toBe(1);
      expect(remainingSecondsFromMs(400)).toBe(1);
      expect(remainingSecondsFromMs(0)).toBe(0);
    });
  });

  describe("state machine lifecycle (a-e)", () => {
    it("(a) auto-save fires exactly once for a pending preview", () => {
      const onAutoSave = jest.fn();
      const machine = new VoicePreviewMachine({ onAutoSave });

      machine.start(mockDraft);
      expect(machine.getState().status).toBe("pending");
      expect(onAutoSave).not.toHaveBeenCalled();

      // Tick partially
      machine.tick(1000);
      expect(machine.getState().status).toBe("pending");
      expect(onAutoSave).not.toHaveBeenCalled();

      // Tick remaining duration to complete countdown
      machine.tick(2000);
      expect(machine.getState().status).toBe("saved");
      expect(onAutoSave).toHaveBeenCalledTimes(1);
      expect(onAutoSave).toHaveBeenCalledWith(mockDraft);

      // Additional ticks must not trigger further saves
      machine.tick(1000);
      machine.tick(5000);
      expect(onAutoSave).toHaveBeenCalledTimes(1);
    });

    it("(b) 'Edit' cancels the pending auto-save and no save occurs", () => {
      const onAutoSave = jest.fn();
      const machine = new VoicePreviewMachine({ onAutoSave });

      machine.start(mockDraft);
      machine.tick(1500);
      expect(machine.getState().status).toBe("pending");

      // User presses "Edit" to take manual control of form
      machine.edit();
      expect(machine.getState().status).toBe("idle");

      // Even if ticks advance past original duration, save never fires
      machine.tick(2000);
      machine.tick(5000);
      expect(onAutoSave).not.toHaveBeenCalled();
    });

    it("(c) 'Cancel' cancels and reports discarded so no transaction is created", () => {
      const onAutoSave = jest.fn();
      const onDiscard = jest.fn();
      const machine = new VoicePreviewMachine({ onAutoSave, onDiscard });

      machine.start(mockDraft);
      machine.tick(1000);

      // User presses "Cancel"
      machine.cancel();
      expect(machine.getState().status).toBe("discarded");
      expect(onDiscard).toHaveBeenCalledTimes(1);

      // Time advance produces no save
      machine.tick(3000);
      expect(onAutoSave).not.toHaveBeenCalled();
    });

    it("(d) starting a second preview while one is pending does not cause two saves", () => {
      const onAutoSave = jest.fn();
      const machine = new VoicePreviewMachine({ onAutoSave });

      machine.start(mockDraft);
      machine.tick(2000);
      expect(onAutoSave).not.toHaveBeenCalled();

      // Second capture arrives while first is pending
      machine.start(mockDraft2);
      expect(machine.getState().status).toBe("pending");

      // 1500ms into the second countdown (3500ms since initial start)
      machine.tick(1500);
      expect(onAutoSave).not.toHaveBeenCalled();

      // Advance final 1500ms to reach 3000ms for second draft
      machine.tick(1500);
      expect(onAutoSave).toHaveBeenCalledTimes(1);
      expect(onAutoSave).toHaveBeenCalledWith(mockDraft2);

      // No second save fires
      machine.tick(5000);
      expect(onAutoSave).toHaveBeenCalledTimes(1);
    });

    it("(e) a failed save surfaces an error state and preserves the draft", async () => {
      const onAutoSave = jest.fn().mockRejectedValue(new Error("Encrypted storage write error"));
      const machine = new VoicePreviewMachine({ onAutoSave });

      machine.start(mockDraft);
      machine.tick(3000);

      expect(onAutoSave).toHaveBeenCalledTimes(1);

      // Wait for async rejection to resolve
      await Promise.resolve();
      await Promise.resolve();

      const state = machine.getState();
      expect(state.status).toBe("error");
      if (state.status === "error") {
        expect(state.draft).toEqual(mockDraft);
        expect(state.error).toBe("Encrypted storage write error");
      }
    });
  });

  describe("pure reducer transitions", () => {
    it("transitions on START", () => {
      const state = voicePreviewReducer({ status: "idle" }, { type: "START", draft: mockDraft });
      expect(state).toEqual({
        status: "pending",
        draft: mockDraft,
        remainingMs: 3000,
      });
    });

    it("decreases remainingMs on TICK", () => {
      const state = voicePreviewReducer(
        { status: "pending", draft: mockDraft, remainingMs: 3000 },
        { type: "TICK", deltaMs: 1000 },
      );
      expect(state).toEqual({
        status: "pending",
        draft: mockDraft,
        remainingMs: 2000,
      });
    });

    it("transitions to saving when remainingMs reaches 0 on TICK", () => {
      const state = voicePreviewReducer(
        { status: "pending", draft: mockDraft, remainingMs: 500 },
        { type: "TICK", deltaMs: 500 },
      );
      expect(state).toEqual({
        status: "saving",
        draft: mockDraft,
      });
    });

    it("transitions to idle on EDIT", () => {
      const state = voicePreviewReducer(
        { status: "pending", draft: mockDraft, remainingMs: 1000 },
        { type: "EDIT" },
      );
      expect(state).toEqual({ status: "idle" });
    });

    it("transitions to discarded on CANCEL", () => {
      const state = voicePreviewReducer(
        { status: "pending", draft: mockDraft, remainingMs: 1000 },
        { type: "CANCEL" },
      );
      expect(state).toEqual({ status: "discarded" });
    });

    it("transitions to saved on SAVE_SUCCESS", () => {
      const state = voicePreviewReducer(
        { status: "saving", draft: mockDraft },
        { type: "SAVE_SUCCESS" },
      );
      expect(state).toEqual({ status: "saved", draft: mockDraft });
    });

    it("transitions to error and preserves draft on SAVE_ERROR", () => {
      const state = voicePreviewReducer(
        { status: "saving", draft: mockDraft },
        { type: "SAVE_ERROR", error: "Storage error" },
      );
      expect(state).toEqual({
        status: "error",
        draft: mockDraft,
        error: "Storage error",
      });
    });
  });
});
