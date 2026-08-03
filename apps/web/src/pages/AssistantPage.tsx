import {
  CURRENT_ASSISTANT_CONSENT_VERSION,
  type AssistantMessagePage,
  type AssistantThreadPage,
  type AssistantTurnResult,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAssistantSession } from "../assistant/AssistantSessionProvider";
import { useAuth } from "../auth/AuthProvider";
import { AssistantComposer } from "../components/assistant/AssistantComposer";
import { AssistantConsent } from "../components/assistant/AssistantConsent";
import { AssistantConversation } from "../components/assistant/AssistantConversation";
import { AssistantIdentityDialog } from "../components/assistant/AssistantIdentityDialog";
import { AssistantThreadList } from "../components/assistant/AssistantThreadList";
import { BillingLimitDialog } from "../components/billing/BillingLimitDialog";
import { PlanUsageIndicator } from "../components/billing/PlanUsageIndicator";
import { UpgradePrompt } from "../components/billing/UpgradePrompt";
import { AppShell } from "../components/layout/AppShell";
import { useBillingSummary } from "../hooks/useBillingSummary";
import {
  createAssistantThread,
  deleteAllAssistantThreads,
  deleteAssistantThread,
  getAssistantMessages,
  getAssistantPreferences,
  getAssistantThreads,
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
  const [pendingMessage, setPendingMessage] = useState<string>();
  const [sendError, setSendError] = useState<Error>();
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);

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
  const assistantUsage = billingQuery.data?.usages.find(
    (usage) => usage.feature === "assistant_question",
  );
  const isAssistantCycle = assistantUsage?.periodKind === "anchored_14_day";
  const isFreePlan = billingQuery.data?.plan === "free";

  useEffect(() => {
    if (!isUsageLimitReachedError(sendError) || sendError.details.feature !== "assistant_question") {
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
    },
    onError: (error) => {
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

  function send() {
    const message = draft.trim();
    if (!message || sendMutation.isPending) return;
    limitTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingMessage(message);
    setSendError(undefined);
    sendMutation.mutate(message);
  }

  function startNew() {
    startNewChat();
    setSendError(undefined);
    setHistoryOpen(false);
  }

  if (preferences.isLoading) {
    return (
      <AppShell>
        <div className="full-page-status">Preparing the assistant…</div>
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
        <div className="assistant-mobile-actions">
          <button
            className="button secondary compact assistant-history-toggle"
            type="button"
            aria-controls="assistant-chat-history"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            {historyOpen ? (
              <X size={16} aria-hidden="true" />
            ) : (
              <Menu size={16} aria-hidden="true" />
            )}{" "}
            History
          </button>
        </div>

        <div className={`assistant-workspace ${historyOpen ? "history-open" : ""}`}>
          <AssistantThreadList
            assistantName={assistantName}
            threads={threads.data?.items ?? []}
            activeThreadId={activeThreadId}
            busy={busy}
            onSelect={(threadId) => {
              setActiveThreadId(threadId);
              setHistoryOpen(false);
            }}
            onNew={startNew}
            onEditIdentity={() => setEditingIdentity(true)}
            onDelete={(threadId) => deleteMutation.mutateAsync(threadId)}
            onDeleteAll={() => deleteAllMutation.mutateAsync()}
          />
          <section className="assistant-chat" aria-label="Financial assistant conversation">
            <div className="assistant-chat-topline">
              <span className="assistant-chat-status">
                <Sparkles size={15} aria-hidden="true" /> Read-only financial answers
              </span>
              {assistantUsage && (
                <div className="assistant-chat-usage">
                  <PlanUsageIndicator
                    compact
                    label={
                      isFreePlan
                        ? `Free plan AI questions ${isAssistantCycle ? "this 14-day cycle" : "this month"}`
                        : `AI questions ${isAssistantCycle ? "this 14-day cycle" : "this month"}`
                    }
                    used={assistantUsage.used}
                    limit={assistantUsage.limit}
                    resetsAt={assistantUsage.resetsAt}
                    resetPendingLabel={
                      isAssistantCycle
                        ? "cycle starts with your first provider-backed question"
                        : undefined
                    }
                    showUpgrade={isFreePlan}
                  />
                </div>
              )}
              <small className="assistant-chat-retention">90-day private history</small>
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
              />
            )}
            <UpgradePrompt error={sendError} />
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
    </AppShell>
  );
}
