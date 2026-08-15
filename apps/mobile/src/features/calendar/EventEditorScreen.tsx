import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useCalendarEvent, useLocalWorkspace } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  ConfirmationDialog,
  ErrorState,
  FormField,
  Skeleton,
} from "@/ui/components";
import { spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { parseEventForm, todayIso, type EventFormErrors } from "./event-form";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function EventEditorScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = single(params.id);
  const editing = Boolean(id);
  const local = useLocalWorkspace();
  const eventState = useCalendarEvent(id);
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const initialized = useRef(false);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => todayIso());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    if (editing && !eventState.event) return;
    if (eventState.event) {
      setTitle(eventState.event.title);
      setDate(eventState.event.date);
      setStartTime(eventState.event.startTime ?? "");
      setEndTime(eventState.event.endTime ?? "");
      setNotes(eventState.event.notes ?? "");
    }
    initialized.current = true;
  }, [editing, eventState.event]);

  const save = async (): Promise<void> => {
    if (!local.workspace || saving) return;
    const parsed = parseEventForm({ title, date, startTime, endTime, notes });
    if (!parsed.success) {
      setErrors(parsed.errors);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editing && id) {
        await local.workspace.transactionMutations.updateEvent(id, parsed.input);
      } else {
        await local.workspace.transactionMutations.createEvent(parsed.input);
      }
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The event could not be saved safely.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!local.workspace || !editing || !id || saving) return;
    setConfirmDelete(false);
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.deleteEvent(id);
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The event could not be deleted safely.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: editing ? "Edit event" : "New event" }} />
      {eventState.error ? (
        <View style={styles.centered}>
          <ErrorState title="Event unavailable" message={eventState.error} onRetry={eventState.retry} />
        </View>
      ) : eventState.loading ? (
        <View accessibilityLabel="Loading event" style={styles.centered}>
          <Skeleton height={200} />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            <FormField
              accessibilityHint="The event title"
              autoCapitalize="sentences"
              error={errors.title}
              label="Title"
              onChangeText={setTitle}
              placeholder="Birthday dinner"
              value={title}
            />
            <FormField
              accessibilityHint="Use YYYY-MM-DD"
              autoCapitalize="none"
              error={errors.date}
              label="Date"
              onChangeText={setDate}
              placeholder="2026-08-20"
              value={date}
            />
            <View style={styles.timeRow}>
              <View style={styles.flex}>
                <FormField
                  accessibilityHint="Optional start time"
                  autoCapitalize="none"
                  error={errors.startTime}
                  label="Start time"
                  onChangeText={setStartTime}
                  placeholder="18:00"
                  value={startTime}
                />
              </View>
              <View style={styles.flex}>
                <FormField
                  accessibilityHint="Optional end time"
                  autoCapitalize="none"
                  error={errors.endTime}
                  label="End time"
                  onChangeText={setEndTime}
                  placeholder="20:00"
                  value={endTime}
                />
              </View>
            </View>
            <FormField
              accessibilityHint="Optional notes"
              error={errors.notes}
              label="Notes"
              multiline
              numberOfLines={4}
              onChangeText={setNotes}
              placeholder="Anything worth remembering"
              value={notes}
            />
            {message ? (
              <Text
                accessibilityRole="alert"
                style={[typography.callout, { color: theme.colors.danger }]}
              >
                {message}
              </Text>
            ) : null}
            <Button loading={saving} onPress={() => void save()}>
              Save event
            </Button>
            {editing ? (
              <Button
                disabled={saving}
                onPress={() => setConfirmDelete(true)}
                variant="danger"
              >
                Delete event
              </Button>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ConfirmationDialog
        confirmLabel="Delete"
        message="Zoption will remove this event locally and synchronize the deletion. The server keeps the final authority."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this event?"
        visible={confirmDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", padding: spacing.md },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  timeRow: { flexDirection: "row", gap: spacing.md },
});
