import { Stack } from "expo-router";
import { Platform } from "react-native";

import { AuthenticatedGate } from "@/auth/authenticated-layout";
import { useZoptionTheme } from "@/ui/theme-provider";
import { fonts } from "@/ui/tokens";

export default function AuthenticatedLayout() {
  const theme = useZoptionTheme();
  return (
    <AuthenticatedGate>
      <Stack
        screenOptions={{
          headerShown: false,
          // Pushed screens show a native header; theme it to match the app
          // instead of the platform default color scheme.
          headerStyle: { backgroundColor: theme.colors.canvas },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text, fontFamily: fonts.heading },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="money-setup"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="categories"
          options={{
            headerShown: true,
            headerBackTitle: "Transactions",
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
          name="budget-conflict"
          options={{
            headerShown: true,
            headerBackTitle: "Budgets",
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
        <Stack.Screen
          name="import"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="receipt-scan"
          options={{
            headerShown: true,
            headerBackTitle: "Transactions",
            title: "Scan receipt",
          }}
        />
        <Stack.Screen name="assistant" options={{ headerShown: false }} />
        <Stack.Screen
          name="plan-billing"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="support"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="account"
          options={{
            headerShown: true,
            headerBackTitle: "More",
          }}
        />
        <Stack.Screen
          name="tutorials"
          options={{
            headerShown: true,
            headerBackTitle: "More",
            title: "Tutorials & Guides",
          }}
        />
        <Stack.Screen
          name="widget-intent"
          options={{
            headerShown: true,
            headerBackTitle: "Home",
            title: "Voice widget",
            presentation: Platform.OS === "ios" ? "formSheet" : "card",
            sheetGrabberVisible: Platform.OS === "ios",
          }}
        />
      </Stack>
    </AuthenticatedGate>
  );
}
