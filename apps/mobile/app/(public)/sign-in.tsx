import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextInput } from "react-native";

import { authErrorMessage, emailSchema } from "@/auth/auth-validation";
import { useSessionSnapshot } from "@/auth/session-state";
import { Button, FormField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export default function SignInScreen() {
  const theme = useZoptionTheme();
  const { configured, signInWithGoogle, signInWithPassword, status } = useSessionSnapshot();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (status === "signed-in") router.replace("/(app)/(tabs)");
  }, [status]);

  async function handleGoogleSignIn(): Promise<void> {
    if (!configured || googleBusy) return;
    setGoogleBusy(true);
    setFormError(undefined);
    try {
      await signInWithGoogle();
    } catch (error) {
      setFormError(authErrorMessage(error, "Zoption could not start Google sign-in."));
      setGoogleBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (busy || !configured) return;
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) {
      setEmailError(parsedEmail.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }
    if (!password) {
      setFormError("Enter your password.");
      return;
    }

    setBusy(true);
    setEmailError(undefined);
    setFormError(undefined);
    try {
      await signInWithPassword(parsedEmail.data, password);
    } catch (error) {
      setFormError(authErrorMessage(error, "Zoption could not sign you in."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Welcome back" description="Use the same Zoption identity as the website.">
      <View className="w-full gap-4">
        <FormField
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          textContentType="username"
          value={email}
          error={emailError}
          editable={!busy}
          onChangeText={(value) => {
            setEmail(value);
            setEmailError(undefined);
            setFormError(undefined);
          }}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <FormField
          ref={passwordRef}
          label="Password"
          autoCapitalize="none"
          autoComplete="current-password"
          returnKeyType="go"
          secureTextEntry
          textContentType="password"
          value={password}
          editable={!busy}
          onChangeText={(value) => {
            setPassword(value);
            setFormError(undefined);
          }}
          onSubmitEditing={() => void submit()}
        />
        {formError ? (
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.danger }]}
          >
            {formError}
          </Text>
        ) : null}
        {!configured ? (
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.warning }]}
          >
            This development build is missing its Supabase public configuration. Restart it after
            adding the mobile environment values.
          </Text>
        ) : null}
        <Button
          accessibilityLabel="Sign in to Zoption"
          disabled={!configured}
          loading={busy}
          onPress={() => void submit()}
        >
          Sign in
        </Button>
        <Button
          variant="quiet"
          disabled={busy}
          onPress={() => router.push("/(public)/forgot-password")}
        >
          Forgot password?
        </Button>
        <View
          accessibilityLabel="Social sign-in options"
          style={styles.dividerRow}
        >
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>or</Text>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        </View>
        <Button
          accessibilityHint="Opens Google in the system browser and links the same Zoption identity"
          disabled={!configured || googleBusy}
          loading={googleBusy}
          variant="secondary"
          onPress={() => void handleGoogleSignIn()}
        >
          Continue with Google
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
});
