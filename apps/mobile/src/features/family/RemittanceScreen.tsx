import { currencies, resolveCategoryEmoji, type Currency } from "@zoption/shared";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSessionSnapshot } from "@/auth/session-state";
import {
  useLocalReferenceData,
  useLocalWorkspace,
  useRemittance,
} from "@/db/local-workspace-state";
import type { LocalRemittance } from "@/db/remittance-queries";
import { todayIso } from "@/features/subscriptions/subscription-form";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  Card,
  ConfirmationDialog,
  DateField,
  ErrorState,
  FormField,
  formatMoneyMinor,
  SelectionField,
  Skeleton,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyEntryPanel } from "./FamilyEntryPanel";
import {
  defaultArrivalCategory,
  parseArrivalForm,
  parseSendForm,
  REMITTANCE_PROVIDERS,
  type RemittanceFormErrors,
} from "./remittance-form";

const currencyOptions = currencies.map((code) => ({ id: code, label: code }));
const providerOptions = REMITTANCE_PROVIDERS.map((name) => ({ id: name, label: name }));

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Records money sent home, or with `id` shows one remittance: confirm it arrived, cancel it, or
 * drop a change the family refused. Works offline; the family sees it after the next sync.
 */
export function RemittanceScreen() {
  const id = single(useLocalSearchParams<{ id?: string | string[] }>().id);
  const theme = useZoptionTheme();
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const me = useSessionSnapshot().subject ?? "";
  const { family, writable } = useActiveWorkspace();
  const familyCurrency = useWorkspaceCurrency();
  const state = useRemittance(id);
  const reference = useLocalReferenceData();

  const [sentAmount, setSentAmount] = useState("");
  const [sentCurrency, setSentCurrency] = useState<Currency>("USD");
  const [fee, setFee] = useState("");
  const [provider, setProvider] = useState("");
  const [sentOn, setSentOn] = useState(todayIso);
  const [note, setNote] = useState("");
  const [arrived, setArrived] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayIso);
  const [pickedAccount, setPickedAccount] = useState("");
  const [pickedCategory, setPickedCategory] = useState("");
  const [errors, setErrors] = useState<RemittanceFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const accounts = reference.data?.accounts ?? [];
  const categories = reference.data?.categories ?? [];
  // Until picked: the first account in the family currency, and a remittance income category.
  const accountId =
    pickedAccount ||
    accounts.find((account) => account.currency === familyCurrency)?.id ||
    accounts[0]?.id ||
    "";
  const categoryId = pickedCategory || defaultArrivalCategory(categories);
  const accountOptions = accounts.map((account) => ({
    id: account.id,
    label:
      account.currency === familyCurrency ? account.name : `${account.name} (${account.currency})`,
  }));
  const categoryOptions = categories
    .filter((category) => category.kind === "income" && !category.locked)
    .map((category) => {
      const emoji = resolveCategoryEmoji(category);
      return { id: category.id, label: emoji ? `${emoji} ${category.name}` : category.name };
    });

  const remittance = state.remittance;
  const canWrite = family !== null && writable;
  const canCancel =
    canWrite && remittance !== null && (family?.role === "owner" || remittance.sentByUserId === me);
  const refused = remittance?.syncState === "failed" || remittance?.syncState === "conflicted";
  const arrival = { amount: receivedAmount, accountId, categoryId, date: receivedOn };

  const run = async (task: () => Promise<unknown>, fallback: string): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await task();
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const save = (): void => {
    const mutations = local.workspace?.transactionMutations;
    if (!mutations) return;
    if (remittance) {
      const parsed = parseArrivalForm(arrival);
      if (!parsed.success) return setErrors(parsed.errors);
      void run(
        () => mutations.receiveRemittance(me, remittance.id, parsed.input),
        "The arrival could not be saved.",
      );
      return;
    }
    const parsed = parseSendForm(
      { amount: sentAmount, currency: sentCurrency, fee, provider, sentOn, note },
      arrived ? arrival : null,
    );
    if (!parsed.success) return setErrors(parsed.errors);
    void run(
      () => mutations.sendRemittance(me, parsed.input),
      "The remittance could not be saved.",
    );
  };

  const clear = (field: keyof RemittanceFormErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setMessage(null);
  };

  const arrivalFields = (
    <>
      <FormField
        editable={!saving}
        error={errors.receivedAmount}
        keyboardType="decimal-pad"
        label={`Amount that arrived (${familyCurrency})`}
        maxLength={18}
        onChangeText={(value) => {
          setReceivedAmount(value);
          clear("receivedAmount");
        }}
        placeholder="0.00"
        value={receivedAmount}
      />
      <SelectionField
        disabled={saving}
        error={errors.account}
        label="Landed in"
        onSelect={(value) => {
          setPickedAccount(value);
          clear("account");
        }}
        options={accountOptions}
        placeholder="Choose an account"
        sheetTitle="Account"
        value={accountId}
      />
      <SelectionField
        disabled={saving}
        error={errors.category}
        label="Income category"
        onSelect={(value) => {
          setPickedCategory(value);
          clear("category");
        }}
        options={categoryOptions}
        placeholder="Choose a category"
        sheetTitle="Category"
        value={categoryId}
      />
      <DateField disabled={saving} label="Arrived on" onChange={setReceivedOn} value={receivedOn} />
    </>
  );

  const body = () => {
    if (!id) {
      return (
        <>
          <View style={styles.row}>
            <View style={styles.flex}>
              <FormField
                editable={!saving}
                error={errors.sentAmount}
                keyboardType="decimal-pad"
                label="Amount sent"
                maxLength={18}
                onChangeText={(value) => {
                  setSentAmount(value);
                  clear("sentAmount");
                }}
                placeholder="0.00"
                value={sentAmount}
              />
            </View>
            <View style={styles.currency}>
              <SelectionField
                disabled={saving}
                label="Currency"
                onSelect={(value) => setSentCurrency(value as Currency)}
                options={currencyOptions}
                placeholder="Currency"
                sheetTitle="Sent in"
                value={sentCurrency}
              />
            </View>
          </View>
          <FormField
            editable={!saving}
            error={errors.fee}
            keyboardType="decimal-pad"
            label={`Fee (${sentCurrency}, optional)`}
            maxLength={18}
            onChangeText={(value) => {
              setFee(value);
              clear("fee");
            }}
            placeholder="0.00"
            value={fee}
          />
          <SelectionField
            disabled={saving}
            label="Sent with (optional)"
            onSelect={setProvider}
            options={providerOptions}
            placeholder="Choose a service"
            sheetTitle="Sent with"
            value={provider}
          />
          <DateField disabled={saving} label="Sent on" onChange={setSentOn} value={sentOn} />
          <FormField
            editable={!saving}
            label="Note (optional)"
            maxLength={240}
            onChangeText={setNote}
            placeholder="For tuition, groceries…"
            value={note}
          />
          <View style={styles.switchRow}>
            <Text style={[typography.body, styles.flex, { color: theme.colors.text }]}>
              It already arrived
            </Text>
            <Switch
              accessibilityLabel="It already arrived"
              disabled={saving}
              onValueChange={setArrived}
              value={arrived}
            />
          </View>
          {arrived ? arrivalFields : null}
          <Button disabled={!local.workspace} loading={saving} onPress={save}>
            Save remittance
          </Button>
        </>
      );
    }
    if (!remittance) return null;
    return (
      <>
        <Summary remittance={remittance} />
        {refused ? (
          <Card style={{ gap: spacing.xs }}>
            <Text style={[typography.callout, { color: theme.colors.danger }]}>
              The family did not accept this change. Someone may have confirmed or cancelled it
              first.
            </Text>
            <Button
              loading={saving}
              onPress={() =>
                void run(
                  () =>
                    local.workspace!.transactionMutations.discardRemittanceChange(remittance.id),
                  "The change could not be dropped.",
                )
              }
              variant="secondary"
            >
              Use the family's version
            </Button>
          </Card>
        ) : null}
        {!refused && canWrite && !remittance.received ? (
          <>
            <Text style={[typography.headline, { color: theme.colors.text }]}>Did it arrive?</Text>
            {arrivalFields}
            <Button disabled={!local.workspace} loading={saving} onPress={save}>
              Confirm received
            </Button>
            {canCancel ? (
              <Button disabled={saving} onPress={() => setConfirmCancel(true)} variant="quiet">
                Cancel this send
              </Button>
            ) : null}
          </>
        ) : null}
        {remittance.syncState === "synced" ? (
          <FamilyEntryPanel subject={{ kind: "remittance", subjectId: remittance.id }} />
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: id ? "Remittance" : "Record a remittance" }} />
      {state.error ? (
        <View style={styles.centered}>
          <ErrorState title="Remittance unavailable" message={state.error} onRetry={state.retry} />
        </View>
      ) : id && state.loading ? (
        <View accessibilityLabel="Loading remittance" style={styles.centered}>
          <Skeleton height={120} />
        </View>
      ) : id && !remittance ? (
        <View style={styles.centered}>
          <ErrorState
            title="Remittance not found"
            message="This remittance was cancelled or is no longer on this phone."
          />
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
            <View style={styles.form}>
              {body()}
              {message ? (
                <Text
                  accessibilityRole="alert"
                  style={[typography.callout, { color: theme.colors.danger }]}
                >
                  {message}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ConfirmationDialog
        confirmLabel="Cancel send"
        destructive
        message="The family will no longer see this send as on the way."
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          void run(
            () => local.workspace!.transactionMutations.cancelRemittance(remittance!.id),
            "The send could not be cancelled.",
          );
        }}
        title="Cancel this send?"
        visible={confirmCancel}
      />
    </SafeAreaView>
  );
}

function Summary({ remittance }: { remittance: LocalRemittance }) {
  const theme = useZoptionTheme();
  const muted = { color: theme.colors.textMuted };
  return (
    <Card style={{ gap: spacing.xxs }}>
      <Text style={[typography.title, { color: theme.colors.text }]}>
        {formatMoneyMinor(remittance.sentAmountMinor, remittance.sentCurrency)}
      </Text>
      <Text style={[typography.callout, muted]}>
        Sent on {remittance.sentOn}
        {remittance.provider ? ` via ${remittance.provider}` : ""}
        {remittance.feeMinor
          ? ` · fee ${formatMoneyMinor(remittance.feeMinor, remittance.sentCurrency)}`
          : ""}
      </Text>
      {remittance.note ? (
        <Text style={[typography.body, { color: theme.colors.text }]}>{remittance.note}</Text>
      ) : null}
      <Text style={[typography.callout, muted]}>
        {remittance.received
          ? `${formatMoneyMinor(remittance.received.amountMinor, remittance.received.currency)} arrived on ${remittance.received.date}`
          : "On the way"}
        {remittance.syncState === "pending" ? " · waiting to sync" : ""}
      </Text>
    </Card>
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
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  form: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  currency: { width: 110 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
