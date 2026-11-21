import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type TextInput } from "react-native";

import { authErrorMessage, emailSchema } from "@/auth/auth-validation";
import { useSessionSnapshot } from "@/auth/session-state";
import { isDevelopmentAppVariant } from "@/config/app-variant";
import { telemetry } from "@/telemetry/telemetry";
import { Button, FormField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

export function SignInScreen() {
  const theme = useZoptionTheme();
  const demoEnabled = isDevelopmentAppVariant();
  const {
    configured,
    continueAsGuest,
    signInWithGoogle,
    signInWithPassword,
    signInWithDummyAccount,
    status,
  } = useSessionSnapshot();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [dummyBusy, setDummyBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);

  useEffect(() => {
    if (status === "signed-in") router.replace("/(app)/(tabs)");
  }, [status]);

  async function handleDummySignIn(): Promise<void> {
    if (dummyBusy) return;
    setDummyBusy(true);
    setFormError(undefined);
    try {
      if (signInWithDummyAccount) {
        await signInWithDummyAccount();
      } else {
        await signInWithPassword("dummy@zoption.local", "dummy-password");
      }
      router.replace("/(app)/(tabs)");
    } catch (error) {
      setFormError(authErrorMessage(error, "Zoption could not sign in with dummy account."));
    } finally {
      setDummyBusy(false);
    }
  }

  async function handleGuest(): Promise<void> {
    if (guestBusy) return;
    setGuestBusy(true);
    try {
      await continueAsGuest();
      void telemetry.capture("guest_session_started");
      router.replace("/(app)/(tabs)");
    } catch {
      setGuestBusy(false);
    }
  }

  async function handleGoogleSignIn(): Promise<void> {
    if (!configured || googleBusy) return;
    setGoogleBusy(true);
    setFormError(undefined);
    try {
      await signInWithGoogle();
    } catch (error) {
      setFormError(authErrorMessage(error, "Zoption could not start Google sign-in."));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function submit(): Promise<void> {
    if (busy) return;
    if (!configured) {
      if (demoEnabled) {
        await handleDummySignIn();
      } else {
        setFormError("Authentication is unavailable in this Zoption build.");
      }
      return;
    }
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
    <Screen
      title="Sign in to Zoption"
      description="Sign in or create an account to sync across your phone and the web."
    >
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
          editable={!busy && !dummyBusy}
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
          editable={!busy && !dummyBusy}
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
        {!configured && demoEnabled ? (
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.warning }]}
          >
            This development build is missing its Supabase public configuration. You can sign in
            with a dummy account below for local development.
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
        {demoEnabled ? (
          <Button
            accessibilityLabel="Sign in with dummy account"
            disabled={dummyBusy || busy}
            loading={dummyBusy}
            variant="secondary"
            onPress={() => void handleDummySignIn()}
          >
            Sign in with dummy account
          </Button>
        ) : null}
        <Button
          variant="quiet"
          disabled={busy || dummyBusy}
          onPress={() => router.push("/(public)/forgot-password")}
        >
          Forgot password?
        </Button>
        <Button
          variant="secondary"
          disabled={!configured || busy || dummyBusy || googleBusy}
          onPress={() => router.push("/(public)/sign-up")}
        >
          Create an account
        </Button>
        {status === "guest" ? (
          <>
            <Text style={[typography.caption, styles.footnote, { color: theme.colors.textMuted }]}>
              Signing in opens your account workspace separately. Entries saved on this device as a
              guest do not transfer into an account.
            </Text>
            <Button variant="quiet" onPress={() => router.back()}>
              Not now
            </Button>
          </>
        ) : null}
        <View accessibilityLabel="Social sign-in options" style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>or</Text>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        </View>
        <Button
          accessibilityHint="Opens Google in the system browser and links the same Zoption identity"
          disabled={!configured || googleBusy}
          icon="google"
          loading={googleBusy}
          variant="secondary"
          onPress={() => void handleGoogleSignIn()}
        >
          Continue with Google
        </Button>
        {/* Guest mode is offered only before the first choice; a guest opening sign-in from the app gets "Not now" instead. */}
        {status === "signed-out" ? (
          <>
            <Button
              accessibilityHint="Uses Zoption on this device without an account"
              disabled={guestBusy || busy || dummyBusy}
              loading={guestBusy}
              variant="quiet"
              onPress={() => void handleGuest()}
            >
              Continue without an account
            </Button>
            <Text style={[typography.caption, styles.footnote, { color: theme.colors.textMuted }]}>
              Without an account your data stays only on this device and will not transfer if you
              sign in later. An account adds backup and sync across your phone and the web, the AI
              Assistant, receipt scanning and voice entry.
            </Text>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  footnote: { textAlign: "center" },
});
