import { useCallback, useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";

import {
  getFamilyShareOptions,
  shareBalanceToFamily,
  shareTransactionToFamily,
  type FamilyApi,
  type FamilyShareOption,
} from "@/api/family";
import { listMyBalanceShares, stopBalanceShare } from "@/api/workspaces";
import { useSessionSnapshot } from "@/auth/session-state";
import { BottomSheet, Button, SelectionField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";

/** A personal transaction becomes a one-time copy; a personal account's balance a live card. */
export type FamilyShareTarget =
  | {
      kind: "transaction";
      id: string;
      direction: "income" | "expense";
      categoryName: string;
      hasNote: boolean;
      /** The Worker copies its own row, so a change still waiting to sync cannot be shared yet. */
      synced: boolean;
    }
  | { kind: "balance"; id: string };

/**
 * The personal editors' way into a family: shown only in the personal workspace to someone who
 * can add to a family. Sharing reads the source on the Worker, so it needs a connection.
 */
export function ShareToFamilyButton({ target }: { target: FamilyShareTarget }) {
  const active = useActiveWorkspace();
  const guest = useSessionSnapshot().status === "guest";
  const [open, setOpen] = useState(false);
  const families = active.families.filter((family) => family.role !== "viewer");
  if (guest || active.family || families.length === 0) return null;
  const unsynced = target.kind === "transaction" && !target.synced;

  return (
    <>
      <Button
        disabled={unsynced}
        icon="account-group-outline"
        onPress={() => setOpen(true)}
        variant="secondary"
      >
        {unsynced ? "Share to family after it syncs" : "Share to family"}
      </Button>
      {/* Mounted only while open, so every opening starts from the defaults. */}
      {open ? (
        <ShareToFamilySheet families={families} onDismiss={() => setOpen(false)} target={target} />
      ) : null}
    </>
  );
}

function ShareToFamilySheet({
  families,
  target,
  onDismiss,
}: {
  families: readonly { id: string; name: string }[];
  target: FamilyShareTarget;
  onDismiss: () => void;
}) {
  const theme = useZoptionTheme();
  const { getAccessToken } = useSessionSnapshot();
  const [familyId, setFamilyId] = useState(families[0]!.id);
  const [options, setOptions] = useState<{
    accounts: FamilyShareOption[];
    categories: FamilyShareOption[];
  } | null>(null);
  const [liveShareId, setLiveShareId] = useState<string | null>(null);
  const [pickedAccount, setPickedAccount] = useState("");
  const [pickedCategory, setPickedCategory] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const familyName = families.find((family) => family.id === familyId)?.name ?? "the family";

  const familyApi = useCallback(
    async (): Promise<FamilyApi> => ({
      accessToken: await getAccessToken(false),
      workspaceId: familyId,
    }),
    [familyId, getAccessToken],
  );

  // Callers pass the target inline, so the effect keys on its fields, not the object.
  const { kind: targetKind, id: targetId } = target;
  useEffect(() => {
    let live = true;
    setOptions(null);
    setLiveShareId(null);
    setMessage(null);
    void (async () => {
      try {
        if (targetKind === "transaction") {
          const loaded = await getFamilyShareOptions(await familyApi());
          if (live) setOptions(loaded);
          return;
        }
        const shares = await listMyBalanceShares({ accessToken: await getAccessToken(false) });
        const share = shares.find(
          (item) => item.accountId === targetId && item.familyId === familyId,
        );
        if (live) setLiveShareId(share?.id ?? null);
      } catch (error) {
        if (live) {
          setMessage(
            error instanceof Error
              ? `${error.message} Sharing needs a connection.`
              : "Sharing needs a connection.",
          );
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [familyApi, familyId, getAccessToken, targetId, targetKind]);

  const muted = { color: theme.colors.textMuted };
  const categories = (options?.categories ?? []).filter(
    (category) => target.kind === "transaction" && category.kind === target.direction,
  );
  // Until picked: the family's first account and its category with the same name, if any.
  const accountId = pickedAccount || options?.accounts[0]?.id || "";
  const categoryId =
    pickedCategory ||
    categories.find(
      (category) =>
        target.kind === "transaction" &&
        category.name.toLowerCase() === target.categoryName.toLowerCase(),
    )?.id ||
    "";

  const run = async (task: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await task();
      setDone(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sharing did not finish.");
    } finally {
      setBusy(false);
    }
  };

  const share = () => {
    if (target.kind === "transaction") {
      if (!accountId || !categoryId) {
        setMessage("Choose the family account and category for the copy.");
        return;
      }
      void run(
        async () =>
          shareTransactionToFamily(await familyApi(), {
            transactionId: target.id,
            accountId,
            categoryId,
            includeNotes,
          }),
        `Copied to ${familyName}. Changing it here later will not change the copy.`,
      );
      return;
    }
    void run(
      async () => shareBalanceToFamily(await familyApi(), target.id),
      `${familyName} now sees this balance as it changes. Stop any time from here.`,
    );
  };

  const stop = (shareId: string) =>
    void run(
      async () => stopBalanceShare({ accessToken: await getAccessToken(false) }, shareId),
      `${familyName} keeps the balance as it is now, and stops seeing changes.`,
    );

  return (
    <BottomSheet onDismiss={onDismiss} title="Share to family" visible>
      <View style={{ gap: spacing.md }}>
        {done ? (
          <>
            <Text style={[typography.body, { color: theme.colors.text }]}>{done}</Text>
            <Button onPress={onDismiss}>Done</Button>
          </>
        ) : (
          <>
            {families.length > 1 ? (
              <SelectionField
                disabled={busy}
                label="Family"
                onSelect={(id) => {
                  setFamilyId(id);
                  setPickedAccount("");
                  setPickedCategory("");
                }}
                options={families.map((family) => ({ id: family.id, label: family.name }))}
                placeholder="Choose a family"
                sheetTitle="Family"
                value={familyId}
              />
            ) : null}
            {target.kind === "transaction" ? (
              <>
                <SelectionField
                  disabled={busy || !options}
                  label="Family account"
                  onSelect={setPickedAccount}
                  options={(options?.accounts ?? []).map((item) => ({
                    id: item.id,
                    label: item.name,
                  }))}
                  placeholder={options ? "Choose an account" : "Loading…"}
                  sheetTitle="Family account"
                  value={accountId}
                />
                <SelectionField
                  disabled={busy || !options}
                  label="Family category"
                  onSelect={setPickedCategory}
                  options={categories.map((item) => ({ id: item.id, label: item.name }))}
                  placeholder={options ? "Choose a category" : "Loading…"}
                  sheetTitle="Family category"
                  value={categoryId}
                />
                {target.hasNote ? (
                  <View className="flex-row items-center gap-3">
                    <Text style={[typography.body, { flex: 1, color: theme.colors.text }]}>
                      Copy my note
                    </Text>
                    <Switch
                      accessibilityLabel="Copy my note"
                      onValueChange={setIncludeNotes}
                      value={includeNotes}
                    />
                  </View>
                ) : null}
                <Text style={[typography.callout, muted]}>
                  The family gets its own copy, counted in its budgets. It never sees your account.
                </Text>
              </>
            ) : (
              <Text style={[typography.callout, muted]}>
                {liveShareId
                  ? `${familyName} sees this balance now. Stopping keeps the card at today's balance.`
                  : `${familyName} sees this account's name and balance, updated as it changes, until you stop sharing. Nothing else from your workspace is shown.`}
              </Text>
            )}
            {message ? (
              <Text
                accessibilityRole="alert"
                style={[typography.callout, { color: theme.colors.danger }]}
              >
                {message}
              </Text>
            ) : null}
            {liveShareId ? (
              <Button loading={busy} onPress={() => stop(liveShareId)} variant="secondary">
                Stop sharing
              </Button>
            ) : (
              <Button loading={busy} onPress={share}>
                {target.kind === "transaction" ? "Copy to family" : "Share balance"}
              </Button>
            )}
          </>
        )}
      </View>
    </BottomSheet>
  );
}
