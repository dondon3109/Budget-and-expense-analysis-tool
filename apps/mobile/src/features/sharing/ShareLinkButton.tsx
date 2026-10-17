import { useState } from "react";

import { useAccountGate } from "@/features/account-prompt/use-account-gate";
import { Button } from "@/ui/components";

import { ShareLinkSheet, type ShareTarget } from "./ShareLinkSheet";

/** The editor entry point for a public share link; a guest gets the sign-in prompt instead. */
export function ShareLinkButton({ target, disabled }: { target: ShareTarget; disabled?: boolean }) {
  const { requireAccount } = useAccountGate();
  const [open, setOpen] = useState(false);
  const label = target.kind === "transaction" ? "Share transaction" : "Share balance";

  return (
    <>
      <Button
        accessibilityLabel={label}
        disabled={disabled}
        icon="share-variant"
        onPress={() => {
          if (requireAccount("share-link")) setOpen(true);
        }}
        variant="secondary"
      >
        {label}
      </Button>
      {/* Mounted only while open, so every opening starts from the defaults. */}
      {open ? <ShareLinkSheet onDismiss={() => setOpen(false)} target={target} visible /> : null}
    </>
  );
}
