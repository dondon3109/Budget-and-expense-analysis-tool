import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import type { BugReport, BugReportDraft } from "@zoption/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ApiTransportError,
  completeSupportChat,
  createBugReport,
  getBugReport,
  listBugReports,
  type SupportChatMessage,
} from "@/api/support";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, Card, EmptyState, ErrorState, FormField, SelectionField, SkeletonLines } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import {
  buildBugDiagnostics,
  prepareSupportHistory,
  validateBugDraft,
  validateSupportMessage,
} from "./support-forms";

type Section = "ask" | "reports";

const bugCategories = [
  { id: "ui", label: "Interface" },
  { id: "data", label: "Data" },
  { id: "import", label: "Import" },
  { id: "billing", label: "Billing" },
  { id: "authentication", label: "Sign in" },
  { id: "performance", label: "Performance" },
  { id: "other", label: "Other" },
] as const;

const bugFrequencies = [
  { id: "once", label: "Once" },
  { id: "sometimes", label: "Sometimes" },
  { id: "always", label: "Always" },
  { id: "unknown", label: "Not sure" },
] as const;

export function SupportScreen() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const [section, setSection] = useState<Section>("ask");
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<BugReportDraft | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);

  const [reports, setReports] = useState<BugReport[] | null>(null);
  const [reportsPhase, setReportsPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<BugReport | null>(null);

  const listRef = useRef<FlatList<SupportChatMessage>>(null);

  const withToken = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await operation(await session.getAccessToken(false));
      } catch (error) {
        if (error instanceof ApiTransportError && error.code === "session_expired") {
          return operation(await session.getAccessToken(true));
        }
        throw error;
      }
    },
    [session],
  );

  const loadReports = useCallback(async () => {
    setReportsPhase("loading");
    try {
      const items = await withToken((token) => listBugReports({ accessToken: token }));
      setReports(items);
      setReportsPhase("ready");
    } catch (error) {
      setReportsError(
        error instanceof ApiTransportError ? error.message : "Reports could not be loaded.",
      );
      setReportsPhase("error");
    }
  }, [withToken]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const toggleReport = useCallback(
    async (report: BugReport) => {
      if (openReportId === report.id) {
        setOpenReportId(null);
        setOpenReport(null);
        return;
      }
      setOpenReportId(report.id);
      setOpenReport(report);
      try {
        const detail = await withToken((token) =>
          getBugReport({ accessToken: token }, report.id),
        );
        setOpenReport(detail);
      } catch {
        // The list row already carries the essentials; detail loading is best-effort.
      }
    },
    [openReportId, withToken],
  );

  const sendChat = useCallback(
    async (text?: string) => {
      const message = (text ?? draftText).trim();
      const validation = validateSupportMessage(message);
      if (validation !== null) {
        setError(validation);
        return;
      }
      if (busy) return;
      setBusy(true);
      setError(null);
      const history = prepareSupportHistory(messages, message);
      if (history.length === 0) {
        setError("That message could not be sent.");
        setBusy(false);
        return;
      }
      setMessages(history);
      setDraftText("");
      try {
        const result = await withToken((token) =>
          completeSupportChat(
            { accessToken: token },
            { messages: history, pageContext: "app" },
          ),
        );
        setMessages((previous) => [...previous, { role: "assistant", content: result.message }]);
        if (result.bugReportDraft) {
          setDraft(result.bugReportDraft);
        }
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      } catch (error) {
        setError(
          error instanceof ApiTransportError ? error.message : "Zoption Support could not answer.",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, draftText, messages, withToken],
  );

  const submitReport = useCallback(async () => {
    if (draft === null) return;
    const validation = validateBugDraft(draft);
    if (validation !== null) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const report = await withToken((token) =>
        createBugReport(
          { accessToken: token },
          {
            clientRequestId: Crypto.randomUUID(),
            ...draft,
            pageContext: "app",
            diagnostics: buildBugDiagnostics("/support"),
          },
        ),
      );
      setSubmittedReference(report.reference);
      setDraft(null);
      void loadReports();
    } catch (error) {
      setError(
        error instanceof ApiTransportError ? error.message : "The report could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }, [draft, loadReports, withToken]);

  const canSend = validateSupportMessage(draftText) === null && !busy;

  return (
    <Screen
      title="Help & support"
      description="Support chat is online-only and never reads your financial records"
      scroll={false}
    >
      <View style={styles.segmentRow}>
        <SegmentButton
          label="Ask support"
          active={section === "ask"}
          onPress={() => setSection("ask")}
        />
        <SegmentButton
          label={"My reports" + (reports && reports.length > 0 ? " (" + reports.length + ")" : "")}
          active={section === "reports"}
          onPress={() => setSection("reports")}
        />
      </View>

      {section === "ask" ? (
        <View style={styles.chat}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item, index) => index + ":" + item.role}
            contentContainerStyle={styles.chatContent}
            renderItem={({ item }) => <SupportBubble message={item} />}
            ListHeaderComponent={
              <Text style={[typography.caption, { color: theme.colors.textMuted, marginBottom: spacing.sm }]}>
                Messages go to Zoption's AI support provider for a reply. Bug reports are saved
                only after you review and submit them. Never share passwords, card numbers or
                uploaded files here.
              </Text>
            }
            ListEmptyComponent={
              <EmptyState
                title="How can we help?"
                description="Ask how to record a transfer, why an import row was rejected, or what a dashboard number means."
              />
            }
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />

          {draft ? (
            <View style={styles.draftWrap}>
              <BugReportReview
                draft={draft}
                busy={busy}
                onChange={setDraft}
                onCancel={() => setDraft(null)}
                onSubmit={() => void submitReport()}
              />
            </View>
          ) : null}

          {submittedReference ? (
            <View style={[styles.notice, { backgroundColor: theme.colors.brandSoft }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={theme.colors.brand} />
              <Text style={[typography.caption, { color: theme.colors.text }]}>
                {submittedReference} received · status New. You can follow it under My reports.
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setSubmittedReference(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" style={[typography.caption, { color: theme.colors.danger, paddingHorizontal: spacing.md }]}>
              {error}
            </Text>
          ) : null}

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 92 : 0}
          >
            <View style={[styles.composer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <TextInput
                accessibilityLabel="Message Zoption Support"
                multiline
                value={draftText}
                onChangeText={setDraftText}
                placeholder="Describe what you need help with"
                placeholderTextColor={theme.colors.textMuted}
                maxLength={1200}
                style={[styles.input, { color: theme.colors.text }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send support message"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => void sendChat()}
                style={[styles.sendButton, { backgroundColor: canSend ? theme.colors.brand : theme.colors.border }]}
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.onBrand} size="small" />
                ) : (
                  <MaterialCommunityIcons name="arrow-up" size={22} color={theme.colors.onBrand} />
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : (
        <View style={styles.reports}>
          {reportsPhase === "loading" ? (
            <SkeletonLines lines={4} />
          ) : reportsPhase === "error" ? (
            <ErrorState
              title="Reports unavailable"
              message={reportsError ?? "Bug reports could not be loaded."}
              onRetry={() => void loadReports()}
            />
          ) : reports && reports.length > 0 ? (
            <FlatList
              data={reports}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.reportsContent}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.reference + ", " + item.title}
                  onPress={() => void toggleReport(item)}
                  style={[styles.reportRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                >
                  <View className="flex-1 gap-1">
                    <Text style={[typography.body, { color: theme.colors.text }]}>{item.title}</Text>
                    <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                      {item.reference} · {item.status}
                    </Text>
                    {openReportId === item.id && openReport ? (
                      <View className="gap-1 mt-2">
                        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                          Expected: {openReport.expectedBehavior}
                        </Text>
                        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                          Actual: {openReport.actualBehavior}
                        </Text>
                        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                          Steps: {openReport.stepsToReproduce}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <MaterialCommunityIcons
                    name={openReportId === item.id ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </Pressable>
              )}
            />
          ) : (
            <EmptyState
              title="No bug reports yet"
              description="Ask Zoption Support for help; when a report draft is ready you can review and submit it here."
            />
          )}
        </View>
      )}
    </Screen>
  );
}

function SupportBubble({ message }: { message: SupportChatMessage }) {
  const theme = useZoptionTheme();
  const isUser = message.role === "user";
  return (
    <View className={isUser ? "items-end" : "items-start"}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? theme.colors.brand : theme.colors.surfaceRaised,
            borderColor: isUser ? theme.colors.brand : theme.colors.border,
          },
        ]}
      >
        <Text style={[typography.body, { color: isUser ? theme.colors.onBrand : theme.colors.text }]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function BugReportReview({
  draft,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: BugReportDraft;
  busy: boolean;
  onChange: (draft: BugReportDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const theme = useZoptionTheme();
  const patch = (update: Partial<BugReportDraft>): void => onChange({ ...draft, ...update });
  const valid = useMemo(() => validateBugDraft(draft) === null, [draft]);
  return (
    <Card>
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>Bug report draft</Text>
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Review every field and remove anything sensitive. Nothing is saved until you submit.
        </Text>
        <FormField
          label="Title"
          value={draft.title}
          onChangeText={(title) => patch({ title })}
          maxLength={120}
        />
        <SelectionField
          label="Category"
          value={draft.category}
          options={[...bugCategories]}
          placeholder="Choose a category"
          sheetTitle="Report category"
          onSelect={(category) => patch({ category: category as BugReportDraft["category"] })}
        />
        <FormField
          label="What happened?"
          value={draft.actualBehavior}
          onChangeText={(actualBehavior) => patch({ actualBehavior })}
          multiline
          maxLength={2000}
        />
        <FormField
          label="What did you expect?"
          value={draft.expectedBehavior}
          onChangeText={(expectedBehavior) => patch({ expectedBehavior })}
          multiline
          maxLength={2000}
        />
        <FormField
          label="Steps to reproduce"
          value={draft.stepsToReproduce}
          onChangeText={(stepsToReproduce) => patch({ stepsToReproduce })}
          multiline
          maxLength={2000}
        />
        <SelectionField
          label="How often?"
          value={draft.frequency}
          options={[...bugFrequencies]}
          placeholder="How often does it happen?"
          sheetTitle="Frequency"
          onSelect={(frequency) => patch({ frequency: frequency as BugReportDraft["frequency"] })}
        />
        <View className="flex-row gap-2">
          <Button variant="quiet" onPress={onCancel}>
            Discard
          </Button>
          <Button loading={busy} disabled={!valid} onPress={onSubmit}>
            Submit report
          </Button>
        </View>
      </View>
    </Card>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, { backgroundColor: active ? theme.colors.surfaceRaised : "transparent", borderColor: active ? theme.colors.brand : theme.colors.border }]}
    >
      <Text style={[typography.body, { color: active ? theme.colors.text : theme.colors.textMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segmentRow: { flexDirection: "row", gap: spacing.sm },
  segment: {
    flex: 1,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  chat: { flex: 1 },
  chatContent: { padding: spacing.md, paddingBottom: spacing.md },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    margin: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    maxHeight: 120,
    fontSize: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    paddingHorizontal: 4,
  },
  sendButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  draftWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  reports: { flex: 1, paddingHorizontal: spacing.md },
  reportsContent: { gap: spacing.sm, paddingBottom: spacing.xl },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
  },
});
