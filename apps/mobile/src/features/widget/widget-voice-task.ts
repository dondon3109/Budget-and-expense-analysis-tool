import * as Notifications from "expo-notifications";
import { AppRegistry, Platform } from "react-native";

import { extractVoiceTransactionsFromTranscript } from "@/api/ai-entry";
import { getSupabaseClient } from "@/auth/supabase-client";
import { openLocalWorkspace } from "@/db/workspace";
import { useDefaultSpendingAccountStore } from "@/stores/default-spending-account-store";

import { parseWidgetTranscriptToIntent } from "./widget-intent";
import { WIDGET_REVIEW_NOTIFICATION_ID, WIDGET_NOTIFICATION_PREFIX } from "./widget-notifications";
import {
  logWidgetVoiceNote,
  widgetLogNotificationBody,
  type WidgetLogDeps,
} from "./widget-voice-log";

// Android runs this headless task (MicWidgetLogService) after the widget mic
// captures speech, so a voice note is logged without any screen opening. It
// shares the app's JS runtime when the app is alive and starts its own when not.

export const WIDGET_VOICE_TASK_NAME = "ZoptionWidgetVoiceLog";
const WIDGET_CHANNEL_ID = "widget-voice";

const deps: WidgetLogDeps = {
  async getSession() {
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const session = data.session;
      return session ? { accessToken: session.access_token, subject: session.user.id } : null;
    } catch {
      return null;
    }
  },
  async openWorkspace(subject) {
    const workspace = await openLocalWorkspace(subject);
    return {
      readFormData: () => workspace.repository.getTransactionFormData(),
      createTransactions: (inputs) =>
        workspace.transactionMutations.createTransactions(
          inputs.filter((input) => input.kind !== "transfer"),
        ),
    };
  },
  async defaultAccountId() {
    // The store skips hydration, so a task that starts the runtime reads it itself.
    await useDefaultSpendingAccountStore.persist.rehydrate();
    return useDefaultSpendingAccountStore.getState().accountId;
  },
  extract: (accessToken, transcript, categoryNames) =>
    extractVoiceTransactionsFromTranscript(accessToken, transcript, undefined, categoryNames),
};

async function notify(
  body: string,
  options: { identifier?: string; data?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(WIDGET_CHANNEL_ID, {
        name: "Voice widget",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: options.identifier ?? `${WIDGET_NOTIFICATION_PREFIX}${Date.now()}`,
      content: { title: "Zoption", body, ...(options.data ? { data: options.data } : {}) },
      trigger: Platform.OS === "android" ? { channelId: WIDGET_CHANNEL_ID } : null,
    });
  } catch {
    // Feedback is best-effort: a notification failure must not undo a saved entry.
  }
}

export async function runWidgetVoiceTask(
  data: { transcript?: unknown } | undefined,
): Promise<void> {
  const transcript = typeof data?.transcript === "string" ? data.transcript.trim() : "";
  if (!transcript) return;
  // A balance update moves an account to a target, which needs the confirm screen
  // and its current-balance preview, so it stays a review the user opens by tap.
  if (parseWidgetTranscriptToIntent(transcript)?.type === "reconcile") {
    await notify("Tap to review this balance update.", {
      identifier: WIDGET_REVIEW_NOTIFICATION_ID,
      data: { transcript },
    });
    return;
  }
  try {
    await notify(widgetLogNotificationBody(await logWidgetVoiceNote(transcript, deps)));
  } catch {
    await notify(widgetLogNotificationBody({ status: "failed", reason: "unavailable" }));
  }
}

// Registered at module scope from the app entry (index.ts): when the widget starts
// the runtime with no UI, nothing else would have defined the task by then.
AppRegistry.registerHeadlessTask(WIDGET_VOICE_TASK_NAME, () => runWidgetVoiceTask);
