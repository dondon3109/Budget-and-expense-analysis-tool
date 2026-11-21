import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextInput } from "react-native";

import {
  authErrorMessage,
  emailSchema,
  passwordPolicy,
  validateNewPassword,
} from "@/auth/auth-validation";
import { useSessionSnapshot } from "@/auth/session-state";
import { telemetry } from "@/telemetry/telemetry";
import { Button, Card, FormField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

export function SignUpScreen() {
  const theme = useZoptionTheme();
  const { configured, signUpWithPassword, signInWithGoogle, status } = useSessionSnapshot();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmationError, setConfirmationError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [confirmationSent, setConfirmationSent] = useState(false);
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
      void telemetry.capture("signup_submitted", { method: "google", outcome: "signed_in" });
    } catch (error) {
      void telemetry.capture("signup_submitted", { method: "google", outcome: "failed" });
      setFormError(authErrorMessage(error, "Zoption could not start Google sign-in."));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (busy || !configured) return;
    setEmailError(undefined);
    setPasswordError(undefined);
    setConfirmationError(undefined);
    setFormError(undefined);

    const parsedEmail = emailSchema.safeParse(email);
    const nextPasswordError = validateNewPassword(password);
    const nextConfirmationError = !confirmation
      ? "Confirm your password."
      : password !== confirmation
        ? "Passwords do not match."
        : null;

    if (!parsedEmail.success) {
      setEmailError(parsedEmail.error.issues[0]?.message ?? "Enter a valid email address.");
    }
    if (nextPasswordError) setPasswordError(nextPasswordError);
    if (nextConfirmationError) setConfirmationError(nextConfirmationError);
    if (!parsedEmail.success || nextPasswordError || nextConfirmationError) return;

    setBusy(true);
    try {
      const result = await signUpWithPassword(parsedEmail.data, password);
      if (result.confirmationRequired) {
        setConfirmationSent(true);
        void telemetry.capture("signup_submitted", {
          method: "password",
          outcome: "confirmation_required",
        });
      } else {
        void telemetry.capture("signup_submitted", { method: "password", outcome: "signed_in" });
        router.replace("/(app)/(tabs)");
      }
    } catch (error) {
      void telemetry.capture("signup_submitted", { method: "password", outcome: "failed" });
      setFormError(authErrorMessage(error, "Your account could not be created."));
    } finally {
      setBusy(false);
    }
  }

  if (confirmationSent) {
    return (
      <Screen
        title="Check your email"
        description="Open the confirmation link to finish creating your Zoption account."
      >
        <Card accessibilityLabel="Email confirmation sent">
          <View style={styles.cardBody}>
            <Text style={[typography.body, { color: theme.colors.text }]}>
              If {email.trim()} is available for a new account, a confirmation link is on its way.
            </Text>
            <Button variant="secondary" onPress={() => router.replace("/(public)/sign-in")}>
              Back to sign in
            </Button>
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Create your account"
      description="Back up and sync your budgets across your phone and the web."
    >
      <View className="w-full gap-4">
        <FormField
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          textContentType="emailAddress"
          value={email}
          error={emailError}
          editable={!busy && !googleBusy}
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
          autoComplete="new-password"
          returnKeyType="next"
          secureTextEntry
          textContentType="newPassword"
          value={password}
          error={passwordError}
          hint={passwordPolicy.summary}
          editable={!busy && !googleBusy}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError(undefined);
            setFormError(undefined);
          }}
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <FormField
          ref={confirmRef}
          label="Confirm password"
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="go"
          secureTextEntry
          textContentType="newPassword"
          value={confirmation}
          error={confirmationError}
          editable={!busy && !googleBusy}
          onChangeText={(value) => {
            setConfirmation(value);
            setConfirmationError(undefined);
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
        <Button
          accessibilityLabel="Create Zoption account"
          disabled={!configured || googleBusy}
          loading={busy}
          onPress={() => void submit()}
        >
          Create account
        </Button>
        <View accessibilityLabel="Social sign-up options" style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>or</Text>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        </View>
        <Button
          disabled={!configured || googleBusy || busy}
          icon="google"
          loading={googleBusy}
          variant="secondary"
          onPress={() => void handleGoogleSignIn()}
        >
          Continue with Google
        </Button>
        <Button variant="quiet" disabled={busy || googleBusy} onPress={() => router.back()}>
          Already have an account? Sign in
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardBody: { gap: spacing.md },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
});
