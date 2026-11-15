import { requireOptionalNativeModule } from "expo";
import { router, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { z } from "zod";

import { useAccountGate } from "@/features/account-prompt/use-account-gate";

/** The private cache copy the Android share receiver made of a shared image. */
const sharedReceiptSchema = z
  .object({
    uri: z.string().startsWith("file://"),
    fileName: z.string().min(1).max(200),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export type SharedReceiptImage = z.infer<typeof sharedReceiptSchema>;

interface ShareIntakeModule {
  consumeSharedReceiptAsync(): Promise<unknown>;
}

// The image waits here for the scan screen rather than in route params, because any app can
// open a Zoption link with params of its choosing, and a file URI there could name a private file.
let pending: SharedReceiptImage | null = null;

/** Hands the shared image to the scan screen once; later calls return null. */
export function takeSharedReceipt(): SharedReceiptImage | null {
  const image = pending;
  pending = null;
  return image;
}

/**
 * Opens the receipt scanner for an image shared into Zoption from another app, such as a GCash
 * or bank screenshot. Mounted behind the app lock, so a shared image waits for the unlock. The
 * native module exists only on Android; elsewhere this does nothing.
 */
export function SharedReceiptHandoff() {
  const { requireAccount } = useAccountGate();
  const navigationReady = Boolean(useRootNavigationState()?.key);

  useEffect(() => {
    if (!navigationReady) return;
    const intake = requireOptionalNativeModule<ShareIntakeModule>("ZoptionShareIntake");
    if (!intake) return;
    let active = true;
    const check = async () => {
      const shared = sharedReceiptSchema.safeParse(
        await intake.consumeSharedReceiptAsync().catch(() => null),
      );
      if (!active || !shared.success || !requireAccount("receipt-scan")) return;
      pending = shared.data;
      router.push("/(app)/receipt-scan");
    };
    void check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [navigationReady, requireAccount]);

  return null;
}
