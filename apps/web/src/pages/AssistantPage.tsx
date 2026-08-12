import {
  CURRENT_ASSISTANT_CONSENT_VERSION,
  type AssistantMessagePage,
  type AssistantThreadPage,
  type AssistantTurnResult,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAssistantSession } from "../assistant/AssistantSessionProvider";
import { useAuth } from "../auth/AuthProvider";
import { AssistantComposer } from "../components/assistant/AssistantComposer";
import { AssistantConsent } from "../components/assistant/AssistantConsent";
import { AssistantConversation } from "../components/assistant/AssistantConversation";
import { AssistantIdentityDialog } from "../components/assistant/AssistantIdentityDialog";
import { AssistantMemoryPanel } from "../components/assistant/AssistantMemoryPanel";
import { AssistantThreadList } from "../components/assistant/AssistantThreadList";
import { AssistantVoiceControl } from "../components/assistant/AssistantVoiceControl";
import { BillingLimitDialog } from "../components/billing/BillingLimitDialog";
import { PlanUsageIndicator } from "../components/billing/PlanUsageIndicator";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
import { AppShell } from "../components/layout/AppShell";
import { InlineLoader } from "../components/layout/InlineLoader";
import { ThemeToggle } from "../components/theme/ThemeToggle";
import { useBillingSummary } from "../hooks/useBillingSummary";
import {
  createAssistantThread,
  deleteAllAssistantThreads,
  deleteAssistantThread,
  getAssistantMessages,
  getAssistantPreferences,
  getAssistantThreads,
  getTransferFeeInsight,
  getAssistantVoiceSpeech,
  grantAssistantConsent,
  isBillingEnforcementError,
  isUsageLimitReachedError,
  sendAssistantMessage,
  updateAssistantIdentity,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import "./AssistantPage.css";

function requestId(): string {
  return crypto.randomUUID();
}

export function AssistantPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const billingQuery = useBillingSummary(workspace);
  const { activeThreadId, draft, setActiveThreadId, setDraft, startNewChat } =
    useAssistantSession();
  const limitTriggerRef = useRef<HTMLElement | null>(null);
  const historyToggleRef = useRef<HTMLButtonElement>(null);
  const historyCloseRef = useRef<HTMLButtonElement>(null);
  const historyWasOpenRef = useRef(false);
  const voiceTurnRef = useRef(false);
  const [pendingMessage, setPendingMessage] = useState<string>();
  const [sendError, setSendError] = useState<Error>();
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string>();
  const [voicePlaybackError, setVoicePlaybackError] = useState<string>();

  const preferences = useQuery({
    queryKey: queryKeys.assistantPreferences(workspace),
    queryFn: () => getAssistantPreferences(workspace),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const threads = useQuery({
    queryKey: queryKeys.assistantThreads(workspace),
    queryFn: () => getAssistantThreads(workspace),
    enabled: Boolean(
      preferences.data?.consentedAt &&
      preferences.data.assistantName &&
      preferences.data.userPreferredName,
    ),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const messages = useQuery({
    queryKey: queryKeys.assistantMessages(workspace, activeThreadId ?? "new"),
    queryFn: () => getAssistantMessages(workspace, activeThreadId!),
    enabled: Boolean(
      activeThreadId &&
      preferences.data?.consentedAt &&
      preferences.data.assistantName &&
      preferences.data.userPreferredName,
    ),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const feeInsightQuery = useQuery({
    queryKey: queryKeys.transferFeeInsight(workspace),
    queryFn: () => getTransferFeeInsight(workspace),
    enabled: Boolean(
      !activeThreadId &&
      preferences.data?.consentedAt &&
      preferences.data.assistantName &&
      preferences.data.userPreferredName,
    ),
  });
  const assistantUsage = billingQuery.data?.usages.find(
    (usage) => usage.feature === "assistant_question",
  );
  const isFreePlan = billingQuery.data?.plan === "free";

  useEffect(() => {
    if (historyOpen) historyCloseRef.current?.focus();
    else if (historyWasOpenRef.current) historyToggleRef.current?.focus();
    historyWasOpenRef.current = historyOpen;
  }, [historyOpen]);

  useEffect(
    () => () => {
      if (voiceAudioUrl) URL.revokeObjectURL(voiceAudioUrl);
    },
    [voiceAudioUrl],
  );

  useEffect(() => {
    if (!historyOpen) return;

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setHistoryOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [historyOpen]);

  useEffect(() => {
    if (
      !isUsageLimitReachedError(sendError) ||
      sendError.details.feature !== "assistant_question"
    ) {
      return;
    }
    const resetsAt = sendError.details.resetsAt;
    if (
      assistantUsage &&
      assistantUsage.used < assistantUsage.limit &&
      resetsAt &&
      Date.now() >= new Date(resetsAt).getTime()
    ) {
      setSendError(undefined);
      setLimitDialogOpen(false);
    }
  }, [assistantUsage, sendError]);

  const consentMutation = useMutation({
    mutationFn: () => grantAssistantConsent(workspace),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.assistantPreferences(workspace), data);
    },
  });
  const identityMutation = useMutation({
    mutationFn: (identity: { assistantName: string; userPreferredName: string }) =>
      updateAssistantIdentity(workspace, identity),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.assistantPreferences(workspace), data);
      setEditingIdentity(false);
    },
  });

  function cacheTurn(result: AssistantTurnResult) {
    queryClient.setQueryData<AssistantMessagePage>(
      queryKeys.assistantMessages(workspace, result.thread.id),
      (current) => ({
        items: [
          ...(current?.items.filter(
            (message) =>
              message.id !== result.userMessage.id && message.id !== result.assistantMessage.id,
          ) ?? []),
          result.userMessage,
          result.assistantMessage,
        ],
        nextCursor: current?.nextCursor ?? null,
      }),
    );
    queryClient.setQueryData<AssistantThreadPage>(
      queryKeys.assistantThreads(workspace),
      (current) => ({
        items: [
          result.thread,
          ...(current?.items.filter((thread) => thread.id !== result.thread.id) ?? []),
        ],
        nextCursor: current?.nextCursor ?? null,
      }),
    );
  }

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const input = { message, clientRequestId: requestId() };
      return activeThreadId
        ? sendAssistantMessage(workspace, { threadId: activeThreadId, input })
        : createAssistantThread(workspace, input);
    },
    onSuccess: (result) => {
      cacheTurn(result);
      setActiveThreadId(result.thread.id);
      setDraft("");
      setPendingMessage(undefined);
      setSendError(undefined);
      if (voiceTurnRef.current && __ASSISTANT_VOICE_ENABLED__) {
        voiceTurnRef.current = false;
        setVoicePlaybackError(undefined);
        void getAssistantVoiceSpeech(workspace, result.assistantMessage.id)
          .then((blob) => {
            setVoiceAudioUrl((current) => {
              if (current) URL.revokeObjectURL(current);
              return URL.createObjectURL(blob);
            });
          })
          .catch((error: unknown) => {
            setVoicePlaybackError(
              error instanceof Error ? error.message : "The spoken reply could not be prepared.",
            );
          });
      }
    },
    onError: (error) => {
      voiceTurnRef.current = false;
      setPendingMessage(undefined);
      const nextError =
        error instanceof Error ? error : new Error("Your message could not be sent.");
      setSendError(nextError);
      if (isUsageLimitReachedError(nextError)) setLimitDialogOpen(true);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing(workspace) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (threadId: string) => deleteAssistantThread(workspace, threadId),
    onMutate: async (threadId) => {
      const threadKey = queryKeys.assistantThreads(workspace);
      await queryClient.cancelQueries({ queryKey: threadKey });

      const previousThreads = queryClient.getQueryData<AssistantThreadPage>(threadKey);
      queryClient.setQueryData<AssistantThreadPage>(threadKey, (current) => ({
        items: current?.items.filter((thread) => thread.id !== threadId) ?? [],
        nextCursor: current?.nextCursor ?? null,
      }));

      const wasActive = activeThreadId === threadId;
      if (wasActive) setActiveThreadId(null);
      return { previousThreads, wasActive };
    },
    onError: (_error, _threadId, context) => {
      if (!context) return;
      queryClient.setQueryData(queryKeys.assistantThreads(workspace), context.previousThreads);
      if (context.wasActive) setActiveThreadId(_threadId);
    },
    onSuccess: (_result, threadId) => {
      queryClient.removeQueries({ queryKey: queryKeys.assistantMessages(workspace, threadId) });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.assistantThreads(workspace) }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => deleteAllAssistantThreads(workspace),
    onMutate: async () => {
      const threadKey = queryKeys.assistantThreads(workspace);
      await queryClient.cancelQueries({ queryKey: threadKey });

      const previousThreads = queryClient.getQueryData<AssistantThreadPage>(threadKey);
      queryClient.setQueryData<AssistantThreadPage>(threadKey, { items: [], nextCursor: null });
      const activeThread = activeThreadId;
      setActiveThreadId(null);
      return { previousThreads, activeThread };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(queryKeys.assistantThreads(workspace), context.previousThreads);
      if (context.activeThread) setActiveThreadId(context.activeThread);
    },
    onSuccess: () => {
      const threadKey = queryKeys.assistantThreads(workspace);
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey.length > threadKey.length &&
          threadKey.every((part, index) => query.queryKey[index] === part) &&
          query.queryKey.at(-1) === "messages",
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.assistantThreads(workspace) }),
  });

  function sendMessage(messageValue: string, fromVoice = false) {
    const message = messageValue.trim();
    if (!message || sendMutation.isPending) return;
    voiceTurnRef.current = fromVoice || voiceTurnRef.current;
    if (voiceTurnRef.current) {
      setVoiceAudioUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return undefined;
      });
      setVoicePlaybackError(undefined);
    }
    limitTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingMessage(message);
    setSendError(undefined);
    sendMutation.mutate(message);
  }

  function send() {
    sendMessage(draft);
  }

  function startNew() {
    startNewChat();
    setSendError(undefined);
    voiceTurnRef.current = false;
    setVoicePlaybackError(undefined);
    setVoiceAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return undefined;
    });
    setHistoryOpen(false);
  }

  if (preferences.isLoading) {
    return (
      <AppShell>
        <InlineLoader label="Preparing the assistant" />
      </AppShell>
    );
  }
  if (preferences.isError) {
    return (
      <AppShell>
        <div className="full-page-status error-state">
          <strong>The assistant could not be loaded.</strong>
          <span>{preferences.error.message}</span>
          <button
            className="button primary"
            type="button"
            onClick={() => void preferences.refetch()}
          >
            Try again
          </button>
        </div>
      </AppShell>
    );
  }
  if (
    !preferences.data?.consentedAt ||
    preferences.data.consentVersion !== CURRENT_ASSISTANT_CONSENT_VERSION
  ) {
    return (
      <AppShell>
        <div className="assistant-page consent-view">
          <AssistantConsent
            accepting={consentMutation.isPending}
            error={consentMutation.error?.message}
            onAccept={() => consentMutation.mutate()}
          />
        </div>
      </AppShell>
    );
  }

  const identityRequired = !preferences.data?.assistantName || !preferences.data?.userPreferredName;
  const assistantName = preferences.data?.assistantName ?? "Your assistant";
  const profileDisplayName =
    typeof user?.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : undefined;
  const busy = sendMutation.isPending || deleteMutation.isPending || deleteAllMutation.isPending;

  return (
    <AppShell>
      <div className="assistant-page">
        <h1 className="sr-only">AI Financial Assistant</h1>

        <div className={`assistant-workspace ${historyOpen ? "history-open" : ""}`}>
          <AssistantThreadList
            assistantName={assistantName}
            threads={threads.data?.items ?? []}
            activeThreadId={activeThreadId}
            busy={busy}
            closeButtonRef={historyCloseRef}
            onClose={() => setHistoryOpen(false)}
            onSelect={(threadId) => {
              setActiveThreadId(threadId);
              setHistoryOpen(false);
            }}
            onNew={startNew}
            onEditIdentity={() => setEditingIdentity(true)}
            onDelete={(threadId) => deleteMutation.mutateAsync(threadId)}
            onDeleteAll={() => deleteAllMutation.mutateAsync()}
          />
          <button
            className="assistant-history-backdrop"
            type="button"
            aria-label="Dismiss chat history"
            aria-hidden={historyOpen ? undefined : true}
            tabIndex={historyOpen ? 0 : -1}
            onClick={() => setHistoryOpen(false)}
          />
          <section className="assistant-chat" aria-label="Financial assistant conversation">
            <div className="assistant-chat-topline">
              <button
                ref={historyToggleRef}
                className="button secondary compact assistant-history-toggle"
                type="button"
                aria-label="History"
                aria-controls="assistant-chat-history"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((open) => !open)}
              >
                {historyOpen ? (
                  <X size={18} aria-hidden="true" />
                ) : (
                  <Menu size={18} aria-hidden="true" />
                )}
                <span className="assistant-history-label">History</span>
              </button>
              <span className="assistant-chat-status">
                <span className="assistant-status-dot" aria-hidden="true" />
                <strong>{assistantName}</strong>
                <span className="assistant-status-readonly">Read only</span>
              </span>
              {assistantUsage && (
                <div className="assistant-chat-usage">
                  <PlanUsageIndicator
                    meter
                    label="Plan usage"
                    used={assistantUsage.used}
                    limit={assistantUsage.limit}
                    showUpgrade={isFreePlan}
                  />
                </div>
              )}
              <div className="assistant-chat-corner">
                <small className="assistant-chat-retention">90-day private history</small>
                <ThemeToggle variant="segmented" />
                <button
                  type="button"
                  className="assistant-memory-trigger"
                  onClick={() => setMemoryOpen(true)}
                >
                  <Brain size={12} aria-hidden="true" /> Memory
                </button>
              </div>
            </div>
            <p className="assistant-education-notice">
              Educational budgeting information only. Zoption does not provide personalized
              financial, investment, tax, legal, or insurance advice.
            </p>
            {messages.isError ? (
              <div className="assistant-chat-error" role="alert">
                <strong>This chat could not be loaded.</strong>
                <button type="button" onClick={() => void messages.refetch()}>
                  Try again
                </button>
              </div>
            ) : (
              <AssistantConversation
                assistantName={assistantName}
                messages={messages.data?.items ?? []}
                pendingMessage={pendingMessage}
                loading={sendMutation.isPending || (Boolean(activeThreadId) && messages.isLoading)}
                onPrompt={setDraft}
                feeInsight={feeInsightQuery.data}
              />
            )}
            <UpgradePrompt error={sendError} />
            {__ASSISTANT_VOICE_ENABLED__ && (voiceAudioUrl || voicePlaybackError) && (
              <div className="assistant-voice-playback" role="status">
                {voiceAudioUrl ? (
                  <audio
                    controls
                    autoPlay
                    src={voiceAudioUrl}
                    aria-label="Spoken assistant reply"
                  />
                ) : (
                  <span>{voicePlaybackError}</span>
                )}
              </div>
            )}
            <AssistantComposer
              value={draft}
              busy={sendMutation.isPending}
              error={
                sendError && !isBillingEnforcementError(sendError) ? sendError.message : undefined
              }
              onChange={(value) => {
                setDraft(value);
                if (sendError) setSendError(undefined);
              }}
              onSend={send}
              voiceControl={
                __ASSISTANT_VOICE_ENABLED__ ? (
                  <AssistantVoiceControl
                    workspace={workspace}
                    disabled={sendMutation.isPending}
                    reviewRequired={__ASSISTANT_VOICE_REVIEW_REQUIRED__}
                    onTranscript={(transcript) => {
                      voiceTurnRef.current = true;
                      if (__ASSISTANT_VOICE_REVIEW_REQUIRED__) {
                        setDraft(transcript);
                        setSendError(undefined);
                      } else {
                        sendMessage(transcript, true);
                      }
                    }}
                  />
                ) : undefined
              }
            />
          </section>
        </div>
      </div>
      {(identityRequired || editingIdentity) && (
        <AssistantIdentityDialog
          required={identityRequired}
          assistantName={preferences.data?.assistantName}
          userPreferredName={preferences.data?.userPreferredName}
          profileDisplayName={profileDisplayName}
          busy={identityMutation.isPending}
          serverError={identityMutation.error?.message}
          onSubmit={(identity) => identityMutation.mutate(identity)}
          onClose={() => setEditingIdentity(false)}
        />
      )}
      {limitDialogOpen && (
        <BillingLimitDialog
          error={sendError}
          returnFocus={limitTriggerRef.current}
          onClose={() => setLimitDialogOpen(false)}
        />
      )}
      {memoryOpen && (
        <AssistantMemoryPanel workspace={workspace} open onClose={() => setMemoryOpen(false)} />
      )}
    </AppShell>
  );
}
