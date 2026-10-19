import {
  FAMILY_SEAT_LIMIT,
  familyCreateSchema,
  type FamilyInvitation,
  type WorkspaceList,
} from "@zoption/shared";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  acceptFamilyInvitation,
  createFamily,
  declineFamilyInvitation,
  listFamilyInvitations,
  listWorkspaces,
  type PersonalApi,
} from "@/api/workspaces";
import { useSessionSnapshot } from "@/auth/session-state";
import { withTapSound } from "@/features/sounds/sound-effects";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  MenuGroup,
  Skeleton,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyAvatar, RoleBadge, SectionLabel } from "./family-ui";
import { SeatRulesDialog } from "./SeatRulesDialog";
import { formatFamilyDate, ROLE_LABELS } from "./use-family-api";

type Pending = { kind: "create"; name: string } | { kind: "accept"; invitation: FamilyInvitation };

interface Directory {
  list: WorkspaceList;
  invitations: FamilyInvitation[];
}

/**
 * The person's side of families, shown from their personal workspace: invitations addressed to
 * them, the families they are in (a tap switches to one), and starting one. Leaving happens
 * inside the family. Needs a connection.
 */
export function FamilyDirectoryView() {
  const theme = useZoptionTheme();
  const { getAccessToken } = useSessionSnapshot();
  const active = useActiveWorkspace();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();

  const personal = useCallback(
    async <T,>(call: (api: PersonalApi) => Promise<T>): Promise<T> =>
      call({ accessToken: await getAccessToken(false) }),
    [getAccessToken],
  );
  const load = useCallback(async () => {
    setFailed(null);
    try {
      const [list, invitations] = await Promise.all([
        personal(listWorkspaces),
        personal(listFamilyInvitations),
      ]);
      setDirectory({ list, invitations });
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "Your families could not be loaded.");
    }
  }, [personal]);
  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <ErrorState
        message={`${failed} Families need a connection to set up.`}
        onRetry={() => void load()}
        title="Families unavailable"
      />
    );
  }
  if (!directory) return <Skeleton height={160} />;

  const muted = { color: theme.colors.textMuted };
  const families = directory.list.workspaces.filter((workspace) => workspace.kind === "family");
  const ownsFamily = families.some((family) => family.role === "owner");

  const open = (familyId: string) => {
    active.switchTo(familyId);
    router.replace("/(app)/(tabs)");
  };

  const confirm = async (action: Pending) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      let familyId = "";
      if (action.kind === "create") {
        familyId = (await personal((api) => createFamily(api, action.name))).id;
      } else {
        await personal((api) => acceptFamilyInvitation(api, action.invitation.id));
        familyId = action.invitation.familyId;
      }
      setPending(null);
      setName("");
      // The switcher learns the new family from the list this refresh fetches.
      active.refresh();
      open(familyId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The family could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  const decline = async (invitationId: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await personal((api) => declineFamilyInvitation(api, invitationId));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be declined.");
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    const parsed = familyCreateSchema.shape.name.safeParse(name);
    if (!parsed.success) {
      setNameError("Name the family in 60 characters or fewer.");
      return;
    }
    setNameError(undefined);
    setMessage(null);
    setPending({ kind: "create", name: parsed.data });
  };

  const canCreate = directory.list.familiesAvailable && !ownsFamily;

  return (
    <View style={{ gap: spacing.lg }}>
      {message && !pending ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {message}
        </Text>
      ) : null}

      {directory.invitations.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <SectionLabel>Invitations</SectionLabel>
          {directory.invitations.map((invitation) => (
            <Card key={invitation.id} style={{ gap: spacing.md }}>
              <View style={styles.row}>
                <FamilyAvatar label={invitation.familyName} size={44} />
                <View style={styles.rowText}>
                  <Text style={[typography.headline, { color: theme.colors.text }]}>
                    {invitation.familyName}
                  </Text>
                  <Text style={[typography.callout, muted]}>
                    {invitation.invitedBy
                      ? `${invitation.invitedBy} invited you`
                      : "You're invited"}{" "}
                    as {ROLE_LABELS[invitation.role].toLowerCase()}
                  </Text>
                  <Text style={[typography.caption, muted]}>
                    Expires {formatFamilyDate(invitation.expiresAt)}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <View style={styles.action}>
                  <Button
                    disabled={busy}
                    onPress={() => void decline(invitation.id)}
                    variant="secondary"
                  >
                    Decline
                  </Button>
                </View>
                <View style={styles.action}>
                  <Button
                    disabled={busy}
                    onPress={() => {
                      setMessage(null);
                      setPending({ kind: "accept", invitation });
                    }}
                  >
                    Join
                  </Button>
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {families.length > 0 ? (
        <MenuGroup title="Your families">
          {families.map((family) => (
            <Pressable
              key={family.id}
              accessibilityHint="Switches to this family"
              accessibilityLabel={`${family.name}, ${ROLE_LABELS[family.role]}`}
              accessibilityRole="button"
              disabled={busy}
              onPress={withTapSound(() => open(family.id))}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.colors.canvasMuted : "transparent",
              })}
            >
              <View style={[styles.row, styles.familyRow]}>
                <FamilyAvatar label={family.name} />
                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={[typography.headline, { color: theme.colors.text }]}
                  >
                    {family.name}
                  </Text>
                  <RoleBadge role={family.role} />
                </View>
                <Text style={[typography.callout, { color: theme.colors.brand }]}>Open</Text>
                <MaterialCommunityIcons
                  color={String(theme.colors.brand)}
                  name="chevron-right"
                  size={20}
                />
              </View>
            </Pressable>
          ))}
        </MenuGroup>
      ) : (
        <Card>
          <EmptyState
            description={
              directory.list.familiesAvailable
                ? `Share one budget with up to ${FAMILY_SEAT_LIMIT - 1} other people: shared spending, remittances home, and alerts. Your personal budget stays private.`
                : "Starting a family isn't available yet. You can join one when someone invites you; the invitation shows up here."
            }
            icon="account-group-outline"
            title="Budget together as a family"
          />
        </Card>
      )}

      {canCreate ? (
        <View style={{ gap: spacing.xs }}>
          <SectionLabel>
            {families.length > 0 ? "Start your own family" : "Start a family"}
          </SectionLabel>
          <Card style={{ gap: spacing.sm }}>
            <FormField
              error={nameError}
              label="Family name"
              maxLength={60}
              onChangeText={setName}
              placeholder="e.g. Dela Cruz family"
              value={name}
            />
            <Button disabled={busy} icon="plus" onPress={startCreate}>
              Create family
            </Button>
          </Card>
        </View>
      ) : null}

      {pending ? (
        <SeatRulesDialog
          busy={busy}
          confirmLabel={pending.kind === "create" ? "Create family" : "Join family"}
          error={message}
          onClose={() => setPending(null)}
          onConfirm={() => void confirm(pending)}
          title={
            pending.kind === "create"
              ? `Create ${pending.name}`
              : `Join ${pending.invitation.familyName}`
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowText: { flex: 1, minWidth: 0, gap: spacing.xxs, alignItems: "flex-start" },
  familyRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
