import {
  FAMILY_SEAT_LIMIT,
  familyCreateSchema,
  type FamilyInvitation,
  type WorkspaceList,
  type WorkspaceSummary,
} from "@zoption/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import {
  acceptFamilyInvitation,
  createFamily,
  declineFamilyInvitation,
  leaveFamily,
  listFamilyInvitations,
  listWorkspaces,
  type PersonalApi,
} from "@/api/workspaces";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, Card, ConfirmationDialog, ErrorState, FormField, Skeleton } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { SeatRulesDialog } from "./SeatRulesDialog";
import { formatFamilyDate, ROLE_LABELS } from "./use-family-api";

type Pending =
  | { kind: "create"; name: string }
  | { kind: "accept"; invitation: FamilyInvitation }
  | { kind: "leave"; family: WorkspaceSummary };

interface Directory {
  list: WorkspaceList;
  invitations: FamilyInvitation[];
}

/**
 * The person's side of families, shown from their personal workspace: invitations addressed to
 * them, the families they are in, and starting one. Needs a connection.
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
      if (action.kind === "leave") {
        await personal((api) => leaveFamily(api, action.family.id));
        setPending(null);
        await active.forgetFamily(action.family.id);
        await load();
        return;
      }
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
      if (action.kind === "leave") setPending(null);
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

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.sm }}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Invitations</Text>
        {directory.invitations.length === 0 ? (
          <Text style={[typography.callout, muted]}>No one has invited you to a family.</Text>
        ) : null}
        {directory.invitations.map((invitation) => (
          <View key={invitation.id} style={{ gap: spacing.xxs }}>
            <Text style={[typography.body, { color: theme.colors.text }]}>
              {invitation.familyName}
            </Text>
            <Text style={[typography.callout, muted]}>
              {ROLE_LABELS[invitation.role]}
              {invitation.invitedBy ? ` · from ${invitation.invitedBy}` : ""} · until{" "}
              {formatFamilyDate(invitation.expiresAt)}
            </Text>
            <View className="flex-row gap-2">
              <Button
                disabled={busy}
                onPress={() => void decline(invitation.id)}
                size="compact"
                variant="secondary"
              >
                Decline
              </Button>
              <Button
                disabled={busy}
                onPress={() => {
                  setMessage(null);
                  setPending({ kind: "accept", invitation });
                }}
                size="compact"
              >
                Accept
              </Button>
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={[typography.headline, { color: theme.colors.text }]}>Your families</Text>
        {families.length === 0 ? (
          <Text style={[typography.callout, muted]}>You are not in a family yet.</Text>
        ) : null}
        {families.map((family) => (
          <View key={family.id} style={{ gap: spacing.xxs }}>
            <Text style={[typography.body, { color: theme.colors.text }]}>{family.name}</Text>
            <Text style={[typography.callout, muted]}>{ROLE_LABELS[family.role]}</Text>
            <View className="flex-row gap-2">
              {family.role === "owner" ? null : (
                <Button
                  disabled={busy}
                  onPress={() => setPending({ kind: "leave", family })}
                  size="compact"
                  variant="secondary"
                >
                  Leave
                </Button>
              )}
              <Button disabled={busy} onPress={() => open(family.id)} size="compact">
                Open
              </Button>
            </View>
          </View>
        ))}
      </Card>

      {directory.list.familiesAvailable && !ownsFamily ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={[typography.headline, { color: theme.colors.text }]}>Start a family</Text>
          <Text style={[typography.callout, muted]}>
            Share one budget with up to {FAMILY_SEAT_LIMIT - 1} other people. Your personal budget
            stays private.
          </Text>
          <FormField
            error={nameError}
            label="Family name"
            maxLength={60}
            onChangeText={setName}
            value={name}
          />
          <Button disabled={busy} onPress={startCreate}>
            Create family
          </Button>
        </Card>
      ) : null}

      {message && !pending ? (
        <Text
          accessibilityRole="alert"
          style={[typography.callout, { color: theme.colors.danger }]}
        >
          {message}
        </Text>
      ) : null}

      {pending?.kind === "leave" ? (
        <ConfirmationDialog
          confirmLabel="Leave family"
          destructive
          message="You lose access right away, and this phone drops its copy of the family, including changes not yet synced. What you added stays in the family."
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm(pending)}
          title={`Leave ${pending.family.name}?`}
          visible
        />
      ) : pending ? (
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
