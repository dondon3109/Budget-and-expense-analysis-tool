import type {
  FamilyComment,
  FamilyCommentSubject,
  FamilyEntryEvent,
  FamilyMember,
} from "@zoption/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import {
  addFamilyComment,
  getFamilyComments,
  getFamilyDetail,
  getFamilyEntryHistory,
  removeFamilyComment,
} from "@/api/family";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, Card, FormField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { describeEntryEvent, formatFamilyTime } from "./entry-history";
import { memberLabel, useFamilyApi } from "./use-family-api";

interface Thread {
  members: FamilyMember[];
  events: FamilyEntryEvent[];
  comments: FamilyComment[];
}

/**
 * Below a family entry or remittance: the family's comments on it, and for an entry who added it
 * and its edit history. All of it is read from the Worker, so it needs a connection.
 */
export function FamilyEntryPanel({
  subject,
  authorUserId = null,
}: {
  subject: FamilyCommentSubject;
  authorUserId?: string | null;
}) {
  const theme = useZoptionTheme();
  const me = useSessionSnapshot().subject;
  const { family, writable } = useActiveWorkspace();
  const role = family?.role ?? "viewer";
  const familyApi = useFamilyApi();
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { kind, subjectId } = subject;
  useEffect(() => {
    if (!familyApi) return;
    let live = true;
    setFailed(false);
    void familyApi((api) =>
      Promise.all([
        getFamilyDetail(api),
        kind === "transaction" ? getFamilyEntryHistory(api, subjectId) : Promise.resolve([]),
        getFamilyComments(api, { kind, subjectId }),
      ]),
    )
      .then(([detail, events, comments]) => {
        if (live) setThread({ members: detail.members, events, comments });
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt, familyApi, kind, subjectId]);

  if (!familyApi) return null;
  const muted = { color: theme.colors.textMuted };
  const name = (userId: string) => memberLabel(userId, me, thread?.members ?? []);

  const post = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    setMessage(null);
    try {
      const comment = await familyApi((api) => addFamilyComment(api, subject, draft.trim()));
      setThread((current) =>
        current ? { ...current, comments: [...current.comments, comment] } : current,
      );
      setDraft("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your comment could not be posted.");
    } finally {
      setPosting(false);
    }
  };
  const remove = async (commentId: string) => {
    setMessage(null);
    try {
      await familyApi((api) => removeFamilyComment(api, commentId));
      setThread((current) =>
        current
          ? { ...current, comments: current.comments.filter((item) => item.id !== commentId) }
          : current,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The comment could not be removed.");
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={[typography.headline, { color: theme.colors.text }]}>Family</Text>
      {failed ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={[typography.callout, muted]}>
            Connect to the internet to see the family's history and comments.
          </Text>
          <Button onPress={() => setAttempt((value) => value + 1)} variant="quiet">
            Try again
          </Button>
        </View>
      ) : !thread ? (
        <Text style={[typography.callout, muted]}>Loading history and comments…</Text>
      ) : (
        <>
          {subject.kind === "transaction" ? (
            <Text style={[typography.callout, muted]}>
              Added by {authorUserId ? name(authorUserId) : "the owner"}
            </Text>
          ) : null}
          {thread.events.map((event) => (
            <Text key={`${event.at}-${event.action}`} style={[typography.callout, muted]}>
              {name(event.userId)} {describeEntryEvent(event)} · {formatFamilyTime(event.at)}
            </Text>
          ))}
          <Text style={[typography.label, { color: theme.colors.text }]}>Comments</Text>
          {thread.comments.length === 0 ? (
            <Text style={[typography.callout, muted]}>No comments yet.</Text>
          ) : null}
          {thread.comments.map((comment) => (
            <View key={comment.id} style={{ gap: 2 }}>
              <Text style={[typography.body, { color: theme.colors.text }]}>{comment.body}</Text>
              <View className="flex-row items-center justify-between">
                <Text style={[typography.callout, muted]}>
                  {name(comment.userId)} · {formatFamilyTime(comment.createdAt)}
                </Text>
                {writable && (comment.userId === me || role === "owner") ? (
                  <Button
                    accessibilityLabel="Remove comment"
                    onPress={() => void remove(comment.id)}
                    variant="quiet"
                  >
                    Remove
                  </Button>
                ) : null}
              </View>
            </View>
          ))}
          {writable ? (
            <>
              <FormField
                label="Add a comment"
                maxLength={500}
                multiline
                onChangeText={setDraft}
                placeholder={
                  subject.kind === "transaction" ? "Ask about this entry" : "Say thanks, or ask"
                }
                value={draft}
              />
              <Button disabled={!draft.trim()} loading={posting} onPress={() => void post()}>
                Post comment
              </Button>
            </>
          ) : null}
        </>
      )}
      {message ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {message}
        </Text>
      ) : null}
    </Card>
  );
}
