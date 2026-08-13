import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { authErrorMessage, passwordPolicy, validateNewPassword } from "@/auth/auth-validation";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, FormField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function UpdatePasswordScreen() {
  const theme = useZoptionTheme();
  const { updatePassword } = useSessionSnapshot();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    const policyError = validateNewPassword(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      await updatePassword(password);
      router.replace("/(app)/(tabs)");
    } catch (submitError) {
      setError(authErrorMessage(submitError, "Zoption could not update your password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Choose a new password" description="Use a password unique to Zoption.">
      <View className="w-full gap-4">
        <FormField
          label="New password"
          autoCapitalize="none"
          autoComplete="new-password"
          secureTextEntry
          textContentType="newPassword"
          value={password}
          hint={passwordPolicy.summary}
          editable={!busy}
          onChangeText={(value) => {
            setPassword(value);
            setError(undefined);
          }}
        />
        <FormField
          label="Confirm new password"
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="done"
          secureTextEntry
          textContentType="newPassword"
          value={confirmation}
          editable={!busy}
          onChangeText={(value) => {
            setConfirmation(value);
            setError(undefined);
          }}
          onSubmitEditing={() => void submit()}
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.danger }]}
          >
            {error}
          </Text>
        ) : null}
        <Button loading={busy} onPress={() => void submit()}>
          Update password
        </Button>
      </View>
    </Screen>
  );
}
