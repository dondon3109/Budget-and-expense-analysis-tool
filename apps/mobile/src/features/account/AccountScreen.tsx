import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, Share, Text, View } from "react-native";

import {
  ApiTransportError,
  downloadAccountArchive,
  requestAccountDeletion,
  type AccountDeletionStatus,
} from "@/api/account";
import { useSessionSnapshot } from "@/auth/session-state";
import { useLocalWorkspace, useLocalWorkspaceStats } from "@/db/local-workspace-state";
import { Button, Card, ConfirmationDialog, FormField, SkeletonLines } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";
import { VoiceLanguagePicker } from "@/ui/voice-language-picker";

export function AccountScreen() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const local = useLocalWorkspace();
  const localStats = useLocalWorkspaceStats();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<AccountDeletionStatus | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ error?: string; success?: string }>({});

  const canSubmit = confirmation === "DELETE" && password.length > 0 && !busy;

  const finishDeletion = useCallback(async () => {
    try {
      // The server already confirmed deletion, so any unsynced local work is
      // moot and the encrypted workspace is cleared per the safe recovery state.
      await session.signOut({ discardUnsyncedChanges: true });
    } catch {
      // Even if local sign-out is interrupted, the session guard redirects once
      // the identity clears. Never loop back into a deleted workspace.
    }
  }, [session]);

  const submitDeletion = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await (async () => {
        try {
          return await requestAccountDeletion(
            { accessToken: await session.getAccessToken(false) },
            { confirmation: "DELETE", password },
          );
        } catch (error) {
          if (error instanceof ApiTransportError && error.code === "session_expired") {
            return requestAccountDeletion(
              { accessToken: await session.getAccessToken(true) },
              { confirmation: "DELETE", password },
            );
          }
          throw error;
        }
      })();
      setDeleted(status);
      setConfirming(false);
      // Small delay so the confirmation copy is visible before redirect.
      setTimeout(() => void finishDeletion(), 1200);
    } catch (error) {
      setConfirming(false);
      if (error instanceof ApiTransportError) {
        if (error.serverCode === "invalid_current_password") {
          setError("The current password could not be verified.");
        } else if (error.serverCode === "subscription_blocks_account_deletion") {
          setError(
            "An active subscription blocks account deletion. Cancel renewal or wait for the period to end.",
          );
        } else if (error.serverCode === "platform_admin_account_protected") {
          setError("This account manages Zoption and cannot be deleted here.");
        } else {
          setError(error.message);
        }
      } else {
        setError("Account deletion could not be completed. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }, [finishDeletion, password, session]);

  const handleExportArchive = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportFeedback({});
    try {
      const token = await session.getAccessToken(false);
      let data: unknown;
      try {
        data = await downloadAccountArchive({ accessToken: token });
      } catch (err) {
        if (err instanceof ApiTransportError && err.code === "session_expired") {
          const freshToken = await session.getAccessToken(true);
          data = await downloadAccountArchive({ accessToken: freshToken });
        } else {
          throw err;
        }
      }

      const jsonString = JSON.stringify(data, null, 2);
      const file = new File(Paths.cache, "zoption-account-archive.json");
      file.write(jsonString);

      await Share.share({
        title: "Zoption Account Archive",
        message: Platform.OS === "android" ? jsonString : undefined,
        url: file.uri,
      });
      setExportFeedback({ success: "Account archive exported successfully." });
    } catch (err) {
      setExportFeedback({
        error: err instanceof Error ? err.message : "Failed to export account archive.",
      });
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, session]);

  const localRows =
    localStats.stats === null
      ? null
      : localStats.stats.transactionCount +
        localStats.stats.accountCount +
        localStats.stats.categoryCount;

  return (
    <Screen hasHeader title="Account" description="Account deletion is online-only and permanent">
      <Card accessibilityLabel="Account overview">
        <View className="gap-2">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Signed-in account</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            The same identity opens this financial workspace on the website and on mobile.
          </Text>
          {localStats.stats === null ? (
            <SkeletonLines lines={1} />
          ) : (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              This device holds {localRows} encrypted local record{localRows === 1 ? "" : "s"} in
              workspace version {local.workspace?.schemaVersion ?? "unknown"}.
            </Text>
          )}
        </View>
      </Card>

      <Card accessibilityLabel="Voice language settings">
        <View className="gap-2">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Voice language</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Choose your default voice language for AI assistant voice chats and transaction voice
            entry. Auto mode automatically detects English and Tagalog. This device remembers the
            choice; other devices keep their own.
          </Text>
          <VoiceLanguagePicker />
        </View>
      </Card>

      <Card accessibilityLabel="Data portability and backup">
        <View className="gap-3">
          <Text style={[typography.headline, { color: theme.colors.text }]}>
            Data portability & backup
          </Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Your financial records belong strictly to you. Download or share a full, structured JSON
            archive of all your accounts, transactions, categories, budgets, and subscriptions at
            any time. Free, private, and always available.
          </Text>
          {exportFeedback.error ? (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, { color: theme.colors.danger }]}
            >
              {exportFeedback.error}
            </Text>
          ) : null}
          {exportFeedback.success ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.caption, { color: theme.colors.brand }]}
            >
              {exportFeedback.success}
            </Text>
          ) : null}
          <Button
            variant="secondary"
            loading={exportBusy}
            disabled={exportBusy}
            onPress={() => void handleExportArchive()}
          >
            Export &amp; Share account archive (.json)
          </Button>
        </View>
      </Card>

      <Card accessibilityLabel="Danger zone">
        <View className="gap-3">
          <Text style={[typography.headline, { color: theme.colors.danger }]}>Delete account</Text>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            This permanently removes your Zoption financial workspace, assistant history, profile
            picture files and sign-in account. It cannot be undone.
          </Text>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            The encrypted local copy on this device is cleared only after Zoption confirms deletion.
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[typography.body, { color: theme.colors.danger }]}
            >
              {error}
            </Text>
          ) : null}
          {deleted ? (
            <Text
              accessibilityRole="alert"
              style={[typography.body, { color: theme.colors.brand }]}
            >
              {deleted === "deleted"
                ? "Your account has been deleted. Signing out…"
                : "Account deletion requested. Remaining cleanup continues securely. Signing out…"}
            </Text>
          ) : null}
          <FormField
            label="Current password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your Zoption password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            editable={deleted === null}
          />
          <FormField
            label='Type "DELETE" to confirm'
            value={confirmation}
            onChangeText={setConfirmation}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={deleted === null}
          />
          <Button
            variant="danger"
            disabled={!canSubmit}
            loading={busy}
            onPress={() => setConfirming(true)}
          >
            Delete my account
          </Button>
        </View>
      </Card>

      <ConfirmationDialog
        visible={confirming}
        title="Delete your Zoption account?"
        message="This permanently removes your financial workspace, assistant history and sign-in account. It cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submitDeletion()}
      />

      <View>
        <Button variant="quiet" onPress={() => router.back()}>
          Back to More
        </Button>
      </View>
    </Screen>
  );
}
