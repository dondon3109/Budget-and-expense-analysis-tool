import { useState } from "react";
import { Text, View } from "react-native";

import { authErrorMessage, emailSchema } from "@/auth/auth-validation";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, FormField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function ForgotPasswordScreen() {
  const theme = useZoptionTheme();
  const { configured, sendPasswordReset } = useSessionSnapshot();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setError(parsedEmail.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      await sendPasswordReset(parsedEmail.data);
      setSent(true);
    } catch (submitError) {
      setError(authErrorMessage(submitError, "Zoption could not send the recovery email."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Reset password"
      description="We’ll email a secure link that returns to this app."
    >
      <View className="w-full gap-4">
        <FormField
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="send"
          textContentType="username"
          value={email}
          editable={!busy && !sent}
          error={error}
          onChangeText={(value) => {
            setEmail(value);
            setError(undefined);
          }}
          onSubmitEditing={() => void submit()}
        />
        {sent ? (
          <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.income }]}>
            If an account exists for that email, its recovery message is on the way.
          </Text>
        ) : (
          <Button disabled={!configured} loading={busy} onPress={() => void submit()}>
            Send recovery email
          </Button>
        )}
      </View>
    </Screen>
  );
}
