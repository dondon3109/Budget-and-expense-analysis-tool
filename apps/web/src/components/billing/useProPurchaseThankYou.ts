import { useEffect, useRef, useState } from "react";

/**
 * Thank the user when a purchase confirms: free to paid while the page is open, or paid on
 * arrival from a completed checkout. A later visit to an already-paid plan stays quiet.
 */
export function useProPurchaseThankYou(
  loaded: boolean,
  paymentConfirmed: boolean,
  checkoutCompleted: boolean,
) {
  const sawUnpaidRef = useRef(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    if (!paymentConfirmed) {
      sawUnpaidRef.current = true;
      return;
    }
    if (!sawUnpaidRef.current && !checkoutCompleted) return;
    sawUnpaidRef.current = false;
    setOpen(true);
  }, [loaded, paymentConfirmed, checkoutCompleted]);
  return { open, close: () => setOpen(false) };
}
