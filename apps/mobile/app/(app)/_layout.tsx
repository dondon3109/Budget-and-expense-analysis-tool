import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { useSessionSnapshot } from "@/auth/session-state";
import { useWorkerIdentity } from "@/auth/worker-identity-state";
import { LocalWorkspaceProvider, useLocalWorkspace } from "@/db/local-workspace-state";
import { SyncProvider } from "@/sync/sync-state";
import { ErrorState } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function AuthenticatedLayout() {
  const session = useSessionSnapshot();
  const identity = useWorkerIdentity();
  if (session.status !== "signed-in") return <Redirect href="/(public)/sign-in" />;
  if (!session.subject) return <Redirect href="/(public)/sign-in" />;
  return (
    <LocalWorkspaceProvider subject={session.subject}>
      <LocalWorkspaceGate identity={identity} />
    </LocalWorkspaceProvider>
  );
}

function LocalWorkspaceGate({ identity }: { identity: ReturnType<typeof useWorkerIdentity> }) {
  const local = useLocalWorkspace();
  const theme = useZoptionTheme();
  if (local.status === "opening") {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <ActivityIndicator
          accessibilityLabel="Opening encrypted local workspace"
          color={theme.colors.brand}
        />
        <Text style={[typography.body, { color: theme.colors.textMuted }]}>
          Unlocking encrypted local data…
        </Text>
      </View>
    );
  }
  if (local.status === "error") {
    return (
      <View className="flex-1 items-start justify-center px-6">
        <ErrorState
          title="Local workspace unavailable"
          message={local.message ?? "The encrypted local workspace could not be opened."}
          onRetry={local.retry}
        />
      </View>
    );
  }
  return (
    <SyncProvider
      enabled={identity.status === "verified"}
      onUnavailableRetry={identity.retry}
      unavailableMessage={
        identity.status === "error"
          ? (identity.message ?? "Zoption could not verify your financial workspace.")
          : null
      }
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="money-setup"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="reference"
          options={{
            headerShown: true,
            headerBackTitle: "Money setup",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="reference-conflict"
          options={{
            headerShown: true,
            headerBackTitle: "Money setup",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="transaction"
          options={{
            headerShown: true,
            headerBackTitle: "Transactions",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="transaction-conflict"
          options={{
            headerShown: true,
            headerBackTitle: "Transaction",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="goals"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="goal"
          options={{
            headerShown: true,
            headerBackTitle: "Goals",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="goal-conflict"
          options={{
            headerShown: true,
            headerBackTitle: "Goals",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="debts"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="debt"
          options={{
            headerShown: true,
            headerBackTitle: "Debts",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="debt-conflict"
          options={{
            headerShown: true,
            headerBackTitle: "Debts",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="subscriptions"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="subscription"
          options={{
            headerShown: true,
            headerBackTitle: "Subscriptions",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="subscription-conflict"
          options={{
            headerShown: true,
            headerBackTitle: "Subscriptions",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="calendar"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="event"
          options={{
            headerShown: true,
            headerBackTitle: "Calendar",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
        <Stack.Screen
          name="event-conflict"
          options={{
            headerShown: true,
            headerBackTitle: "Calendar",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
      </Stack>
    </SyncProvider>
  );
}
