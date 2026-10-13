import { useState, type CSSProperties } from "react";

import { eggArt, PET_HATCH_TAPS, type PetSpecies } from "@zoption/shared";

import { PetSvg } from "./PetSvg";
import "./HatchEgg.css";

// Matches the pet-hatch-burst animation, so the Baby appears as the shell finishes flying apart.
const BURST_MS = 280;

function hatchHint(left: number): string {
  if (left === PET_HATCH_TAPS) {
    return `Ready to hatch! Click the egg ${PET_HATCH_TAPS} times to crack it open.`;
  }
  if (left === 0) return "Cracking…";
  return left === 1 ? "1 more click…" : `${left} more clicks…`;
}

/**
 * A ready egg the user clicks open, like the phone app's. Each click shakes it harder and spreads
 * the cracks; the last asks the Worker, and only its answer bursts the shell. Leaving the page
 * forgets partial clicks.
 */
export function HatchEgg({
  species,
  days,
  hatch,
}: {
  species: PetSpecies;
  days: number;
  hatch: (beforeShow: () => Promise<void>) => Promise<unknown>;
}) {
  const [taps, setTaps] = useState(0);
  const [bursting, setBursting] = useState(false);
  const [failed, setFailed] = useState(false);
  const left = PET_HATCH_TAPS - taps;

  const tap = () => {
    // The last click is in flight.
    if (left === 0) return;
    const next = taps + 1;
    setTaps(next);
    setFailed(false);
    if (next < PET_HATCH_TAPS) return;
    hatch(async () => {
      setBursting(true);
      await new Promise((resolve) => setTimeout(resolve, BURST_MS));
    }).catch(() => {
      setTaps(0);
      setFailed(true);
    });
  };

  return (
    <>
      <button
        type="button"
        className="pet-hatch-egg"
        data-bursting={bursting || undefined}
        aria-label={`Ready egg. Click ${left} more times to hatch it.`}
        onClick={tap}
      >
        {/* Keyed by the count so each click replays the shake, a little wider each time. */}
        <span
          key={taps}
          className="pet-hatch-shake"
          data-shaking={taps > 0 || undefined}
          style={{ "--pet-swing": `${3 + taps * 1.4}deg` } as CSSProperties}
        >
          <PetSvg art={eggArt(species, days, taps)} mood="egg" size={220} />
        </span>
      </button>
      {failed ? (
        <p className="pet-warning" role="alert">
          Couldn't hatch, try again.
        </p>
      ) : (
        <p className="pet-note" aria-live="polite">
          {hatchHint(left)}
        </p>
      )}
    </>
  );
}
