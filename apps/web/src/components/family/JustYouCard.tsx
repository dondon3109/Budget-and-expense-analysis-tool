import { FAMILY_SEAT_LIMIT } from "@zoption/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import "./JustYouCard.css";

// Shared by the family Home and the members screen, so dismissing it on one hides it on both.
const dismissedKey = (familyId: string) => `zoption:family-just-you:${familyId}`;

function readDismissed(familyId: string): boolean {
  try {
    return window.localStorage.getItem(dismissedKey(familyId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Tells the owner of an unpaid family that it is theirs alone until a family plan pays for it.
 * The caller decides when it applies; the person decides when they have read it.
 */
export function JustYouCard({ familyId, onPlanPage }: { familyId: string; onPlanPage: boolean }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(familyId));
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissedKey(familyId), "1");
    } catch {
      // Storage can be blocked; the card then returns on the next visit.
    }
  }

  return (
    <aside className="family-just-you" aria-labelledby="family-just-you-title">
      <div>
        <strong id="family-just-you-title">Just you for now</strong>
        <p>
          Try the family on your own with Free limits. A family plan lets you invite up to{" "}
          {FAMILY_SEAT_LIMIT - 1} people, and everyone gets the plan for their own Zoption too.
        </p>
        {!onPlanPage && (
          <Link className="button secondary compact" to="/app/family">
            See family plans
          </Link>
        )}
      </div>
      <button type="button" className="icon-button compact" aria-label="Dismiss" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
