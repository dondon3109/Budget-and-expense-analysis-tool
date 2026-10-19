import {
  FAMILY_CLOSING_DAYS,
  familyInviteSchema,
  type FamilyDetail,
  type FamilyMember,
  type FamilyMemberRole,
} from "@zoption/shared";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  closeFamily,
  getFamilyDetail,
  inviteFamilyMember,
  removeFamilyMember,
  resendFamilyInvitation,
  revokeFamilyInvitation,
  setFamilyMemberRole,
  transferFamily,
} from "@/api/family";
import { leaveFamily } from "@/api/workspaces";
import { useSessionSnapshot } from "@/auth/session-state";
import { withTapSound } from "@/features/sounds/sound-effects";
import {
  BottomSheet,
  Button,
  Card,
  ConfirmationDialog,
  ErrorState,
  FormField,
  MenuGroup,
  MenuRow,
  Skeleton,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyAlertsCard } from "./FamilyAlertsCard";
import { FamilyAvatar, RoleBadge, RoleChooser, SectionLabel } from "./family-ui";
import { SeatRulesDialog } from "./SeatRulesDialog";
import { formatFamilyDate, ROLE_LABELS, useFamilyApi } from "./use-family-api";

type Pending =
  | { kind: "remove"; member: FamilyMember }
  | { kind: "transfer"; member: FamilyMember }
  | { kind: "close" }
  | { kind: "leave" };

function memberName(member: FamilyMember): string {
  return member.email ?? "Member without a confirmed email";
}

function confirmCopy(action: Exclude<Pending, { kind: "remove" }>, familyName: string) {
  if (action.kind === "transfer") {
    return {
      title: `Make ${memberName(action.member)} the owner?`,
      message:
        "They will manage members and billing for the family, and you become a member. Only they can give ownership back.",
      confirmLabel: "Make owner",
    };
  }
  if (action.kind === "close") {
    return {
      title: `Close ${familyName}?`,
      message: `Everyone keeps read-only access for ${FAMILY_CLOSING_DAYS} days to export it, then the family and everything in it is deleted. This cannot be undone.`,
      confirmLabel: "Close family",
    };
  }
  return {
    title: `Leave ${familyName}?`,
    message:
      "You lose access right away, and this phone drops its copy of the family, including changes not yet synced. What you added stays in the family.",
    confirmLabel: "Leave family",
  };
}

/**
 * The family shown: a summary with seats, members (the owner taps one to manage it), invitations,
 * alerts, and leaving or closing. Needs a connection.
 */
export function FamilyManagerView() {
  const theme = useZoptionTheme();
  const session = useSessionSnapshot();
  const { getAccessToken } = session;
  const active = useActiveWorkspace();
  const familyApi = useFamilyApi();
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<FamilyMemberRole>("member");
  const [emailError, setEmailError] = useState<string>();
  const [managedId, setManagedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyApi) return;
    setFailed(null);
    try {
      setDetail(await familyApi(getFamilyDetail));
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The family could not be loaded.");
    }
  }, [familyApi]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!familyApi || !active.family) return null;
  const family = active.family;
  if (failed) {
    return (
      <ErrorState
        message={`${failed} Members and invitations need a connection.`}
        onRetry={() => void load()}
        title="Family unavailable"
      />
    );
  }
  if (!detail) return <Skeleton height={160} />;

  const muted = { color: theme.colors.textMuted };
  const owner = detail.role === "owner";
  const closing = detail.closesAt !== null;
  const canManage = owner && !closing;

  // Runs one change and reloads the family; the message line says why one failed.
  const write = async (task: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setMessage(null);
    try {
      await task();
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The family could not be changed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (action: Pending) => {
    if (action.kind === "leave") {
      if (busy) return;
      setBusy(true);
      setMessage(null);
      try {
        await leaveFamily({ accessToken: await getAccessToken(false) }, family.id);
        setPending(null);
        await active.forgetFamily(family.id);
        router.replace("/(app)/(tabs)");
      } catch (error) {
        setPending(null);
        setMessage(error instanceof Error ? error.message : "You could not leave the family.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const done = await write(() => {
      if (action.kind === "remove") {
        return familyApi((api) => removeFamilyMember(api, action.member.userId));
      }
      if (action.kind === "transfer") {
        return familyApi((api) => transferFamily(api, action.member.userId));
      }
      return familyApi(closeFamily);
    });
    // The seat rules dialog shows its own error; the plain one closes so the error line shows.
    if (done || action.kind !== "remove") setPending(null);
    if (done) setManagedId(null);
    // A new owner or a closing family changes what this phone may push.
    if (done) active.refresh();
  };

  const invite = async () => {
    const parsed = familyInviteSchema.safeParse({ email: email.trim(), role: inviteRole });
    if (!parsed.success) {
      setEmailError("Enter an email address.");
      return;
    }
    setEmailError(undefined);
    if (await write(() => familyApi((api) => inviteFamilyMember(api, parsed.data)))) setEmail("");
  };

  const me = session.subject;
  const seatShare =
    detail.seats.limit > 0 ? Math.min(1, detail.seats.used / detail.seats.limit) : 0;
  const seatNotes = [
    detail.seats.cooling > 0 ? `${detail.seats.cooling} cooling down` : null,
    owner ? `${detail.swaps.used} of ${detail.swaps.limit} seat changes used this year` : null,
  ].filter((note): note is string => note !== null);
  // Read from the reloaded list, so the sheet follows a role change it just made.
  const managed = managedId
    ? (detail.members.find((member) => member.userId === managedId) ?? null)
    : null;

  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <View style={styles.row}>
          <FamilyAvatar label={detail.name} size={56} />
          <View style={styles.rowText}>
            <Text style={[typography.title, { color: theme.colors.text }]}>{detail.name}</Text>
            <RoleBadge role={detail.role} />
          </View>
        </View>
        <View style={{ gap: spacing.xxs }}>
          <View style={styles.between}>
            <Text style={[typography.callout, { color: theme.colors.text }]}>Seats</Text>
            <Text style={[typography.callout, muted]}>
              {detail.seats.used} of {detail.seats.limit} taken
            </Text>
          </View>
          <View
            accessibilityElementsHidden
            style={[styles.track, { backgroundColor: theme.colors.canvasMuted }]}
          >
            <View
              style={[
                styles.fill,
                { width: `${seatShare * 100}%`, backgroundColor: theme.colors.brand },
              ]}
            />
          </View>
          {seatNotes.length > 0 ? (
            <Text style={[typography.caption, muted]}>{seatNotes.join(" · ")}</Text>
          ) : null}
        </View>
        {closing ? (
          <View
            accessibilityRole="alert"
            style={[styles.notice, { backgroundColor: theme.colors.warningSoft }]}
          >
            <Text style={[typography.callout, { color: theme.colors.warning }]}>
              Closes on {formatFamilyDate(detail.closesAt!)}. Until then everyone can view it, but
              nothing can change.
            </Text>
          </View>
        ) : null}
      </Card>

      {message && !pending ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {message}
        </Text>
      ) : null}

      <MenuGroup title={`Members · ${detail.members.length}`}>
        {detail.members.map((member) => {
          const manageable = canManage && member.role !== "owner";
          const name = member.userId === me ? "You" : memberName(member);
          const row = (
            <View style={[styles.row, styles.listRow]}>
              <FamilyAvatar label={member.email ?? "?"} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
                  {name}
                </Text>
                <Text style={[typography.caption, muted]}>
                  Joined {formatFamilyDate(member.joinedAt)}
                </Text>
              </View>
              <RoleBadge role={member.role} />
              {manageable ? (
                <MaterialCommunityIcons
                  color={String(theme.colors.textMuted)}
                  name="chevron-right"
                  size={20}
                />
              ) : null}
            </View>
          );
          if (!manageable) return <View key={member.userId}>{row}</View>;
          return (
            <Pressable
              key={member.userId}
              accessibilityHint="Change role, make owner, or remove"
              accessibilityLabel={`${name}, ${ROLE_LABELS[member.role]}`}
              accessibilityRole="button"
              onPress={withTapSound(() => {
                setMessage(null);
                setManagedId(member.userId);
              })}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.colors.canvasMuted : "transparent",
              })}
            >
              {row}
            </Pressable>
          );
        })}
      </MenuGroup>

      {canManage ? (
        <View style={{ gap: spacing.xs }}>
          <SectionLabel>Invite someone</SectionLabel>
          <Card style={{ gap: spacing.sm }}>
            <FormField
              autoCapitalize="none"
              autoComplete="off"
              error={emailError}
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              placeholder="name@example.com"
              value={email}
            />
            <RoleChooser disabled={busy} onChange={setInviteRole} value={inviteRole} />
            <Button icon="email-fast-outline" loading={busy} onPress={() => void invite()}>
              Send invitation
            </Button>
          </Card>
        </View>
      ) : null}

      {canManage && detail.invitations.length > 0 ? (
        <MenuGroup title="Waiting to join">
          {detail.invitations.map((invitation) => (
            <View key={invitation.id} style={[styles.row, styles.listRow]}>
              <FamilyAvatar label={invitation.email} />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[typography.headline, { color: theme.colors.text }]}>
                  {invitation.email}
                </Text>
                <Text style={[typography.caption, muted]}>
                  {ROLE_LABELS[invitation.role]} · expires {formatFamilyDate(invitation.expiresAt)}
                </Text>
              </View>
              <Button
                accessibilityLabel={`Resend invitation to ${invitation.email}`}
                disabled={busy}
                icon="refresh"
                onPress={() =>
                  void write(() => familyApi((api) => resendFamilyInvitation(api, invitation.id)))
                }
                size="compact"
                variant="quiet"
              />
              <Button
                accessibilityLabel={`Revoke invitation to ${invitation.email}`}
                disabled={busy}
                icon="close"
                onPress={() =>
                  void write(() => familyApi((api) => revokeFamilyInvitation(api, invitation.id)))
                }
                size="compact"
                variant="quiet"
              />
            </View>
          ))}
        </MenuGroup>
      ) : null}

      <FamilyAlertsCard canManage={canManage} />

      {owner && closing ? null : (
        <View style={{ gap: spacing.xs }}>
          <MenuGroup title={owner ? "Close the family" : "Leave the family"}>
            <MenuRow
              icon={owner ? "close-circle-outline" : "logout"}
              onPress={() => setPending(owner ? { kind: "close" } : { kind: "leave" })}
              title={owner ? "Close family" : "Leave family"}
              tone="danger"
            />
          </MenuGroup>
          <Text style={[typography.caption, styles.footnote, muted]}>
            {owner
              ? `To hand the family on, make another member the owner. Closing keeps it read only for ${FAMILY_CLOSING_DAYS} days so everyone can export it, then deletes it.`
              : "What you added stays in the family."}
          </Text>
        </View>
      )}

      {managed ? (
        <BottomSheet
          onDismiss={() => setManagedId(null)}
          title={memberName(managed)}
          visible={!pending}
        >
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.label, muted]}>Role</Text>
              <RoleChooser
                disabled={busy}
                onChange={(role) => {
                  if (role === managed.role) return;
                  void write(() =>
                    familyApi((api) => setFamilyMemberRole(api, managed.userId, role)),
                  );
                }}
                value={managed.role === "owner" ? "member" : managed.role}
              />
            </View>
            {message ? (
              <Text
                accessibilityRole="alert"
                style={[typography.callout, { color: theme.colors.danger }]}
              >
                {message}
              </Text>
            ) : null}
            <Button
              disabled={busy}
              icon="crown-outline"
              onPress={() => setPending({ kind: "transfer", member: managed })}
              variant="secondary"
            >
              Make owner
            </Button>
            <Button
              disabled={busy}
              icon="account-remove-outline"
              onPress={() => setPending({ kind: "remove", member: managed })}
              variant="danger"
            >
              Remove from family
            </Button>
          </View>
        </BottomSheet>
      ) : null}

      {pending?.kind === "remove" ? (
        <SeatRulesDialog
          busy={busy}
          confirmLabel="Remove member"
          error={message}
          onClose={() => setPending(null)}
          onConfirm={() => void confirm(pending)}
          title={`Remove ${memberName(pending.member)}`}
        />
      ) : pending ? (
        <ConfirmationDialog
          {...confirmCopy(pending, detail.name)}
          destructive={pending.kind !== "transfer"}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm(pending)}
          visible
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowText: { flex: 1, minWidth: 0, gap: spacing.xxs, alignItems: "flex-start" },
  listRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  between: { flexDirection: "row", justifyContent: "space-between" },
  track: { height: 8, borderRadius: radii.round, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radii.round },
  notice: { borderRadius: radii.md, padding: spacing.sm },
  footnote: { paddingHorizontal: spacing.xs },
});
