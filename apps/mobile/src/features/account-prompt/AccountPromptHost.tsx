import { router } from "expo-router";

import { ConfirmationDialog } from "@/ui/components";

import { accountBenefits, accountFeatures } from "./account-features";
import { useAccountPromptStore } from "./account-prompt-store";

/** Mounted once in the authenticated gate so every screen shares one sign-in prompt. */
export function AccountPromptHost() {
  const feature = useAccountPromptStore((state) => state.feature);
  const close = useAccountPromptStore((state) => state.close);

  const benefits = accountBenefits.map((benefit) => `• ${benefit}`).join("\n");
  const message = feature
    ? `${accountFeatures[feature]} needs a Zoption account. You're using Zoption on this device only.\n\nWith an account you get:\n${benefits}`
    : "";

  return (
    <ConfirmationDialog
      visible={feature !== null}
      title="Sign in to continue"
      message={message}
      confirmLabel="Sign in"
      onCancel={close}
      onConfirm={() => {
        close();
        router.push("/(public)/sign-in");
      }}
    />
  );
}
