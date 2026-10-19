import {
  FAMILY_CLOSING_DAYS,
  familyInviteSchema,
  familyMemberRoles,
  type FamilyDetail,
  type FamilyMember,
  type FamilyMemberRole,
} from "@zoption/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

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
import {
  Button,
  Card,
  ConfirmationDialog,
  ErrorState,
  FormField,
  SelectionField,
  Skeleton,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyAlertsCard } from "./FamilyAlertsCard";
import { SeatRulesDialog } from "./SeatRulesDialog";
import { formatFamilyDate, ROLE_LABELS, useFamilyApi } from "./use-family-api";

type Pending =
  | { kind: "remove"; member: FamilyMember }
  | { kind: "transfer"; member: FamilyMember }
  | { kind: "close" }
  | { kind: "leave" };

const roleOptions = familyMemberRoles.map((role) => ({ id: role, label: ROLE_LABELS[role] }));

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

/** The family shown: members, seats, and invitations, with the owner's controls. Needs a connection. */
export function FamilyManagerView() {
  const theme = useZoptionTheme();
  const { getAccessToken } = useSessionSnapshot();
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

  return (
    <View style={{ gap: spacing.md }}>
      {closing ? (
        <Card>
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.text }]}
          >
            This family closes on {formatFamilyDate(detail.closesAt!)}. Until then everyone can view
            it, but nothing can change.
          </Text>
        </Card>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Members</Text>
        <Text style={[typography.callout, muted]}>
          {detail.seats.used} of {detail.seats.limit} seats taken
          {detail.seats.cooling > 0 ? ` · ${detail.seats.cooling} cooling down` : ""}
          {owner
            ? ` · ${detail.swaps.used} of ${detail.swaps.limit} seat changes used this year`
            : ""}
        </Text>
        {detail.members.map((member) => (
          <View key={member.userId} style={{ gap: spacing.xxs }}>
            <Text style={[typography.body, { color: theme.colors.text }]}>
              {memberName(member)}
            </Text>
            <Text style={[typography.callout, muted]}>
              {ROLE_LABELS[member.role]} · joined {formatFamilyDate(member.joinedAt)}
            </Text>
            {canManage && member.role !== "owner" ? (
              <>
                <SelectionField
                  disabled={busy}
                  label={`Role for ${memberName(member)}`}
                  onSelect={(role) =>
                    void write(() =>
                      familyApi((api) =>
                        setFamilyMemberRole(api, member.userId, role as FamilyMemberRole),
                      ),
                    )
                  }
                  options={roleOptions}
                  placeholder="Role"
                  sheetTitle="Role"
                  value={member.role}
                />
                <View className="flex-row gap-2">
                  <Button
                    disabled={busy}
                    onPress={() => setPending({ kind: "transfer", member })}
                    size="compact"
                    variant="secondary"
                  >
                    Make owner
                  </Button>
                  <Button
                    disabled={busy}
                    onPress={() => setPending({ kind: "remove", member })}
                    size="compact"
                    variant="danger"
                  >
                    Remove
                  </Button>
                </View>
              </>
            ) : null}
          </View>
        ))}
      </Card>

      {canManage ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>Invitations</Text>
          {detail.invitations.map((invitation) => (
            <View key={invitation.id} style={{ gap: spacing.xxs }}>
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {invitation.email}
              </Text>
              <Text style={[typography.callout, muted]}>
                {ROLE_LABELS[invitation.role]} · until {formatFamilyDate(invitation.expiresAt)}
              </Text>
              <View className="flex-row gap-2">
                <Button
                  disabled={busy}
                  onPress={() =>
                    void write(() => familyApi((api) => resendFamilyInvitation(api, invitation.id)))
                  }
                  size="compact"
                  variant="secondary"
                >
                  Resend
                </Button>
                <Button
                  disabled={busy}
                  onPress={() =>
                    void write(() => familyApi((api) => revokeFamilyInvitation(api, invitation.id)))
                  }
                  size="compact"
                  variant="danger"
                >
                  Revoke
                </Button>
              </View>
            </View>
          ))}
          <FormField
            autoCapitalize="none"
            autoComplete="off"
            error={emailError}
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            value={email}
          />
          <SelectionField
            label="Role"
            onSelect={(role) => setInviteRole(role as FamilyMemberRole)}
            options={roleOptions}
            placeholder="Role"
            sheetTitle="Role"
            value={inviteRole}
          />
          <Button loading={busy} onPress={() => void invite()}>
            Send invitation
          </Button>
        </Card>
      ) : null}

      {message ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {message}
        </Text>
      ) : null}

      <FamilyAlertsCard canManage={canManage} />

      <Card style={{ gap: spacing.sm }}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          {owner ? "Close the family" : "Leave the family"}
        </Text>
        {owner ? (
          <>
            <Text style={[typography.callout, muted]}>
              To hand the family on, make another member the owner. Closing keeps it read only for{" "}
              {FAMILY_CLOSING_DAYS} days so everyone can export it, then deletes it.
            </Text>
            {closing ? null : (
              <Button onPress={() => setPending({ kind: "close" })} variant="danger">
                Close family
              </Button>
            )}
          </>
        ) : (
          <Button onPress={() => setPending({ kind: "leave" })} variant="secondary">
            Leave family
          </Button>
        )}
      </Card>

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
