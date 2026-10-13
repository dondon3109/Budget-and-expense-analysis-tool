import { useState } from "react";

import {
  PET_DAILY_POINT_CEILING,
  PET_STAGE_THRESHOLDS,
  eggArt,
  petArt,
  petEarningRows,
  petMood,
  petSpecies,
  petSpeciesLabels,
  petStageLabels,
  type PetSpecies,
  type PetView,
} from "@zoption/shared";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { HatchEgg } from "../components/pet/HatchEgg";
import { PetSvg } from "../components/pet/PetSvg";
import { userWorkspace } from "../lib/workspace";
import { useChoosePetEgg, useHatchPet, usePet, useSetPetEnabled } from "../queries/pet";
import "./PetPage.css";

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 1;
  return (
    <div className="pet-meter">
      <span>{label}</span>
      <div
        className="pet-meter-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="pet-meter-fill" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

function EggPicker({ busy, onChoose }: { busy: boolean; onChoose: (species: PetSpecies) => void }) {
  const [picked, setPicked] = useState<PetSpecies>();
  return (
    <form
      className="pet-egg-picker"
      onSubmit={(event) => {
        event.preventDefault();
        if (picked) onChoose(picked);
      }}
    >
      <fieldset>
        <legend className="sr-only">Pick an egg</legend>
        {petSpecies.map((species) => (
          <label key={species} className="pet-egg-option">
            <input
              type="radio"
              name="pet-egg"
              value={species}
              checked={picked === species}
              onChange={() => setPicked(species)}
            />
            <PetSvg art={eggArt(species)} mood="egg" size={96} still />
            <span>{petSpeciesLabels[species]}</span>
          </label>
        ))}
      </fieldset>
      <button className="button primary" type="submit" disabled={!picked || busy}>
        {picked ? `Choose the ${petSpeciesLabels[picked]} egg` : "Pick an egg"}
      </button>
    </form>
  );
}

function PetStats({ pet }: { pet: PetView }) {
  if (pet.stage === "egg") {
    // A ready egg's hint sits under the egg itself.
    if (pet.eggStreakDays >= pet.eggHatchDays) return null;
    return (
      <>
        <Meter
          label={`Day ${pet.eggStreakDays} of ${pet.eggHatchDays}`}
          value={pet.eggStreakDays}
          max={pet.eggHatchDays}
        />
        <p className="pet-note">
          Open Zoption every day until it is ready to hatch. Missing a day starts the count over.
        </p>
      </>
    );
  }
  const stageStart = PET_STAGE_THRESHOLDS[pet.stage];
  return (
    <>
      {pet.nextStagePoints === null ? (
        <p>{pet.points} points. Your pet is fully grown.</p>
      ) : (
        <Meter
          label={`${pet.points} of ${pet.nextStagePoints} points to grow`}
          value={pet.points - stageStart}
          max={pet.nextStagePoints - stageStart}
        />
      )}
      <Meter label={`Health ${pet.health ?? 0} of 100`} value={pet.health ?? 0} max={100} />
      <Meter
        label={`Today ${pet.pointsToday} of ${PET_DAILY_POINT_CEILING} points`}
        value={pet.pointsToday}
        max={PET_DAILY_POINT_CEILING}
      />
      {pet.healthState === "sick" || pet.healthState === "fading" ? (
        <p className="pet-warning" role="alert">
          {pet.healthState === "sick"
            ? "Your pet is sick. Log something today and it will eat points to heal."
            : "Your pet is fading. If nothing is logged within 72 hours of the last activity, it passes away."}
        </p>
      ) : null}
    </>
  );
}

/** The pet companion on the web: the same pet as the phone app, from the sidebar. */
export function PetPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const pet = usePet(workspace);
  const chooseEgg = useChoosePetEgg(workspace);
  const setEnabled = useSetPetEnabled(workspace);
  const hatch = useHatchPet(workspace);
  // Set once this visit hatches the egg, so the Baby springs out instead of just appearing.
  const [justHatched, setJustHatched] = useState(false);
  const busy = chooseEgg.isPending || setEnabled.isPending;
  const writeError = chooseEgg.error ?? setEnabled.error;

  return (
    <AppShell>
      <div className="dashboard-page pet-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Companion</p>
            <h1>Your pet</h1>
          </div>
        </header>

        {pet.isPending ? (
          <p className="pet-note">Finding your pet…</p>
        ) : pet.isError ? (
          <div className="pet-panel">
            <p className="page-error" role="alert">
              Zoption could not load your pet. Try again shortly.
            </p>
            <button className="button secondary" type="button" onClick={() => void pet.refetch()}>
              Try again
            </button>
          </div>
        ) : !pet.data.enabled ? (
          <div className="pet-panel">
            <p>
              Your pet companion is turned off. Turn it on to raise a pet as you log money every
              day.
            </p>
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={() => setEnabled.mutate(true)}
            >
              Turn on my pet
            </button>
          </div>
        ) : pet.data.species === null ? (
          <div className="pet-panel">
            <h2>{pet.data.diedAt ? "Pick a new egg" : "Meet your pet"}</h2>
            <p className="pet-note">
              {pet.data.diedAt
                ? "Your last pet passed away after three days with nothing logged. Every egg starts fresh."
                : "Pick an egg. Open Zoption seven days in a row and it is ready to hatch, then it grows as you log money."}
            </p>
            <EggPicker busy={busy} onChoose={(species) => chooseEgg.mutate(species)} />
          </div>
        ) : (
          <div className="pet-panel pet-hero">
            {pet.data.stage === "egg" && pet.data.eggStreakDays >= pet.data.eggHatchDays ? (
              <HatchEgg
                species={pet.data.species}
                days={pet.data.eggStreakDays}
                hatch={async (beforeShow) => {
                  await hatch.mutateAsync(beforeShow);
                  setJustHatched(true);
                }}
              />
            ) : (
              <PetSvg
                className={justHatched ? "pet-pop" : undefined}
                art={petArt(pet.data.species, pet.data.stage, pet.data.eggStreakDays)}
                mood={petMood(pet.data)}
                size={220}
              />
            )}
            <h2>
              {petSpeciesLabels[pet.data.species]} · {petStageLabels[pet.data.stage]}
            </h2>
            <div className="pet-stats">
              <PetStats pet={pet.data} />
            </div>
          </div>
        )}

        {writeError ? (
          <p className="page-error" role="alert">
            {writeError.message}
          </p>
        ) : null}

        <section className="pet-panel">
          <h2>How to earn points</h2>
          <dl className="pet-earning">
            {petEarningRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  {row.rule.points} pts, {row.rule.dailyCount}× a day
                </dd>
              </div>
            ))}
          </dl>
          <p className="pet-note">
            Doing three different things in a day adds a 10 point bonus. A day earns at most{" "}
            {PET_DAILY_POINT_CEILING} points.
          </p>
          {pet.data?.enabled ? (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => setEnabled.mutate(false)}
            >
              Turn off my pet
            </button>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
