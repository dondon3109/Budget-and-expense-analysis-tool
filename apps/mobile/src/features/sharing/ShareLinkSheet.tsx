import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import {
  shareLinkExpiries,
  type ShareLinkCreated,
  type ShareLinkCreateInput,
  type ShareLinkExpiry,
} from "@zoption/shared";
import { ApiTransportError } from "@/api/authenticated";
import { createShareLink } from "@/api/shares";
import { useSessionSnapshot } from "@/auth/session-state";
import { withTapSound } from "@/features/sounds/sound-effects";
import { BottomSheet, Button, FormField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

/** What the sheet shares: one transaction, or one account's balance. */
export type ShareTarget =
  { kind: "transaction"; id: string; hasNote: boolean } | { kind: "balance"; id: string };

type FieldKey = "description" | "category" | "date" | "note";

const FIELD_LABELS: Record<FieldKey, string> = {
  description: "Description",
  category: "Category",
  date: "Date",
  note: "Note",
};

const EXPIRY_LABELS: Record<ShareLinkExpiry, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  never: "No end",
};

interface ShareLinkSheetProps {
  target: ShareTarget;
  visible: boolean;
  onDismiss: () => void;
}

function failureMessage(error: unknown): string {
  // The server only knows rows that reached it, so an unsynced local edit reads as missing.
  if (error instanceof ApiTransportError && error.code === "not_found") {
    return "Zoption has not synced this yet. Sync, then try again.";
  }
  return error instanceof Error ? error.message : "The link could not be created.";
}

/**
 * Creates a public, read-only snapshot link for one transaction or balance. Only the amount is
 * always shown; every other field is opt in, and the snapshot never changes after it is made.
 * The parent mounts the sheet per target, so each opening starts from the defaults.
 */
export function ShareLinkSheet({ target, visible, onDismiss }: ShareLinkSheetProps) {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const [show, setShow] = useState<Record<FieldKey, boolean>>({
    description: false,
    category: true,
    date: true,
    note: false,
  });
  const [sharerName, setSharerName] = useState("");
  const [expiry, setExpiry] = useState<ShareLinkExpiry>("7d");
  const [created, setCreated] = useState<ShareLinkCreated | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = (Object.keys(FIELD_LABELS) as FieldKey[]).filter(
    (field) => field !== "note" || (target.kind === "transaction" && target.hasNote),
  );

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const name = sharerName.trim() || undefined;
    const input: ShareLinkCreateInput =
      target.kind === "transaction"
        ? { kind: "transaction", transactionId: target.id, show, sharerName: name, expiry }
        : { kind: "balance", accountId: target.id, sharerName: name, expiry };
    try {
      setCreated(
        await createShareLink({ accessToken: await session.getAccessToken(false) }, input),
      );
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const copy = (): void => {
    if (!created) return;
    void Clipboard.setStringAsync(created.url);
    setCopied(true);
  };

  return (
    <BottomSheet
      onDismiss={onDismiss}
      title={target.kind === "transaction" ? "Share transaction" : "Share balance"}
      visible={visible}
    >
      <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
        Anyone with the link sees a frozen snapshot, never your accounts or other transactions. You
        can turn links off in Settings on the web.
      </Text>

      {created ? (
        <View
          style={[
            styles.linkCard,
            { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[typography.label, { color: theme.colors.text }]}>View-only link</Text>
          <Text
            accessibilityLabel="Share link"
            numberOfLines={2}
            selectable
            style={[typography.caption, { color: theme.colors.textMuted }]}
          >
            {created.url}
          </Text>
          <Button accessibilityLabel="Copy link" icon="content-copy" onPress={copy}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button
            accessibilityLabel="Share link"
            icon="share-variant"
            onPress={() => void Share.share({ message: created.url })}
            variant="secondary"
          >
            Share
          </Button>
        </View>
      ) : (
        <>
          {target.kind === "transaction" ? (
            <View style={styles.section}>
              <Text style={[typography.label, { color: theme.colors.text }]}>
                Show with the amount
              </Text>
              <View style={styles.pillRow}>
                {fields.map((field) => (
                  <Pill
                    key={field}
                    label={FIELD_LABELS[field]}
                    role="checkbox"
                    selected={show[field]}
                    onPress={() => setShow((current) => ({ ...current, [field]: !current[field] }))}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <FormField
            label="Your name (optional)"
            maxLength={40}
            onChangeText={setSharerName}
            placeholder="Shown as “A Zoption user”"
            value={sharerName}
          />

          <View style={styles.section}>
            <Text style={[typography.label, { color: theme.colors.text }]}>Link works for</Text>
            <View style={styles.pillRow}>
              {shareLinkExpiries.map((option) => (
                <Pill
                  key={option}
                  label={EXPIRY_LABELS[option]}
                  role="radio"
                  selected={expiry === option}
                  onPress={() => setExpiry(option)}
                />
              ))}
            </View>
          </View>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[typography.callout, { color: theme.colors.danger }]}
            >
              {error}
            </Text>
          ) : null}

          <Button
            accessibilityLabel="Create link"
            icon="link-variant"
            loading={busy}
            disabled={busy}
            onPress={() => void create()}
          >
            Create link
          </Button>
        </>
      )}
    </BottomSheet>
  );
}

function Pill({
  label,
  role,
  selected,
  onPress,
}: {
  label: string;
  role: "checkbox" | "radio";
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useZoptionTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      onPress={withTapSound(onPress)}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised,
          borderColor: selected ? theme.colors.brand : theme.colors.border,
        },
      ]}
    >
      <Text
        style={[
          typography.label,
          { color: selected ? theme.colors.brand : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  pill: {
    borderRadius: radii.round,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  linkCard: { borderRadius: radii.md, borderWidth: 1, padding: spacing.sm, gap: spacing.xs },
});
