import { useState, type CSSProperties, type ReactNode } from "react";

import {
  PET_DAILY_POINT_CEILING,
  PET_NAME_MAX_LENGTH,
  PET_STAGE_THRESHOLDS,
  eggArt,
  petEarningRows,
  petGrowthLockedLine,
  petSpecies,
  petSpeciesLabels,
  petStageEmoji,
  petStageLabels,
  petStages,
  type PetSpecies,
  type PetView,
} from "@zoption/shared";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { HatchEgg, HatchShine } from "../components/pet/HatchEgg";
import { PetPicture } from "../components/pet/PetPicture";
import { PetSvg } from "../components/pet/PetSvg";
import { useBillingSummary } from "../hooks/useBillingSummary";
import { userWorkspace } from "../lib/workspace";
import { useChoosePetEgg, useHatchPet, usePet, useSetPetEnabled } from "../queries/pet";
import "./PetPage.css";

type MeterTone = "brand" | "health" | "sick" | "fading" | "sun";

function healthTone(state: PetView["healthState"]): MeterTone {
  if (state === "sick") return "sick";
  if (state === "fading" || state === "dead") return "fading";
  return "health";
}

function healthEmoji(state: PetView["healthState"]): string {
  if (state === "sick") return "🤒";
  if (state === "fading" || state === "dead") return "🥀";
  return "💚";
}

function Meter({
  label,
  icon,
  value,
  max,
  tone,
}: {
  label: string;
  icon: string;
  value: number;
  max: number;
  tone: MeterTone;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 1;
  return (
    <div className="pet-meter" data-tone={tone}>
      <span>
        <span aria-hidden="true">{icon}</span> {label}
      </span>
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

function eggButtonLabel(picked: PetSpecies | undefined, name: string): string {
  if (!picked) return "Pick an egg";
  if (!name) return "Give it a name";
  return `Choose the ${petSpeciesLabels[picked]} egg`;
}

function EggPicker({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (species: PetSpecies, name: string) => void;
}) {
  const [picked, setPicked] = useState<PetSpecies>();
  const [name, setName] = useState("");
  const trimmed = name.trim();
  return (
    <form
      className="pet-egg-picker"
      onSubmit={(event) => {
        event.preventDefault();
        if (picked && trimmed) onChoose(picked, trimmed);
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
            <PetSvg art={eggArt(species)} size={96} still />
            <span>{petSpeciesLabels[species]}</span>
          </label>
        ))}
      </fieldset>
      <label className="pet-name-field">
        <span>Name your pet</span>
        <input
          type="text"
          value={name}
          maxLength={PET_NAME_MAX_LENGTH}
          placeholder={picked ? petSpeciesLabels[picked] : "Pingu"}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button className="button primary" type="submit" disabled={!picked || !trimmed || busy}>
        {eggButtonLabel(picked, trimmed)}
      </button>
    </form>
  );
}

/** Egg to Legend as a path of badges, lit up to the pet's current stage. */
function GrowthPath({ stage }: { stage: PetView["stage"] }) {
  const reached = petStages.indexOf(stage);
  return (
    <ol className="pet-path" aria-label="Growth path">
      {petStages.map((step, index) => (
        <li
          key={step}
          className="pet-path-step"
          data-state={index < reached ? "done" : index === reached ? "now" : "next"}
          aria-current={index === reached ? "step" : undefined}
        >
          <span className="pet-path-badge" aria-hidden="true">
            <span>{petStageEmoji[step]}</span>
          </span>
          <span className="pet-path-label">{petStageLabels[step]}</span>
          <small>{step === "egg" ? "7 days" : `${PET_STAGE_THRESHOLDS[step]} pts`}</small>
        </li>
      ))}
    </ol>
  );
}

// Where each petting heart floats off to, as a horizontal drift in pixels.
const HEART_DRIFTS = [-46, -18, 12, 40];

/**
 * A hatched pet the user can pet: each click sends a little burst of hearts up from it. Purely a
 * delight on this page; nothing is sent to the Worker.
 */
function PettablePet({ name, children }: { name: string; children: ReactNode }) {
  const [pets, setPets] = useState(0);
  return (
    <button
      className="pet-pettable"
      type="button"
      aria-label={`Pet ${name}`}
      onClick={() => setPets((count) => count + 1)}
    >
      {children}
      {pets > 0 ? (
        <span key={pets} className="pet-hearts" aria-hidden="true">
          {HEART_DRIFTS.map((drift, index) => (
            <span
              key={drift}
              style={{ "--drift": `${drift}px`, "--delay": `${index * 60}ms` } as CSSProperties}
            >
              {index % 2 === 0 ? "💜" : "💖"}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

function PetChips({ pet }: { pet: PetView }) {
  if (pet.stage === "egg") {
    return (
      <ul className="pet-chips" aria-label="Egg status">
        <li data-tone="sun">
          🔥 {pet.eggStreakDays} day{pet.eggStreakDays === 1 ? "" : "s"} streak
        </li>
      </ul>
    );
  }
  return (
    <ul className="pet-chips" aria-label="Pet status">
      <li data-tone="brand">⭐ {pet.points} pts</li>
      <li data-tone={healthTone(pet.healthState)}>
        {healthEmoji(pet.healthState)} {pet.health ?? 0}% health
      </li>
      <li data-tone="sun">☀️ {pet.pointsToday} today</li>
    </ul>
  );
}

function PetStats({ pet, isFree }: { pet: PetView; isFree: boolean }) {
  if (pet.stage === "egg") {
    // A ready egg's hint sits under the egg itself.
    if (pet.eggStreakDays >= pet.eggHatchDays) return null;
    return (
      <>
        <Meter
          label={`Day ${pet.eggStreakDays} of ${pet.eggHatchDays}`}
          icon="🥚"
          value={pet.eggStreakDays}
          max={pet.eggHatchDays}
          tone="sun"
        />
        <p className="pet-note">
          Open Zoption every day until it is ready to hatch. Missing a day starts the count over.
        </p>
      </>
    );
  }
  const stageStart = PET_STAGE_THRESHOLDS[pet.stage];
  const lockedLine = isFree ? petGrowthLockedLine(pet) : null;
  return (
    <>
      {pet.nextStagePoints === null ? (
        <p>{pet.points} points. Your pet is fully grown.</p>
      ) : (
        <Meter
          label={`${pet.points} of ${pet.nextStagePoints} points to grow`}
          icon="🌱"
          value={pet.points - stageStart}
          max={pet.nextStagePoints - stageStart}
          tone="brand"
        />
      )}
      {lockedLine ? (
        <p className="pet-note">
          {lockedLine} <Link to="/app/settings#plan-and-billing">See Zoption Pro</Link>
        </p>
      ) : null}
      <Meter
        label={`Health ${pet.health ?? 0} of 100`}
        icon="❤️"
        value={pet.health ?? 0}
        max={100}
        tone={healthTone(pet.healthState)}
      />
      <Meter
        label={`Today ${pet.pointsToday} of ${PET_DAILY_POINT_CEILING} points`}
        icon="☀️"
        value={pet.pointsToday}
        max={PET_DAILY_POINT_CEILING}
        tone="sun"
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
  // Only a known Free plan shows the growth lock; the Worker enforces it either way.
  const billing = useBillingSummary(workspace);
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
            <EggPicker
              busy={busy}
              onChoose={(species, name) => chooseEgg.mutate({ species, name })}
            />
          </div>
        ) : (
          <div className="pet-panel pet-hero">
            <div className="pet-stage">
              <span className="pet-stage-sparkles" aria-hidden="true">
                <span>✦</span>
                <span>★</span>
                <span>✧</span>
                <span>♥</span>
              </span>
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
                <span className="pet-pop-wrap">
                  {justHatched ? <HatchShine className="pet-hatch-afterglow" /> : null}
                  <span className={justHatched ? "pet-pop" : undefined}>
                    {pet.data.stage === "egg" ? (
                      <PetSvg art={eggArt(pet.data.species, pet.data.eggStreakDays)} size={220} />
                    ) : (
                      <PettablePet name={pet.data.name ?? petSpeciesLabels[pet.data.species]}>
                        <PetPicture pet={{ ...pet.data, species: pet.data.species }} size={220} />
                      </PettablePet>
                    )}
                  </span>
                </span>
              )}
              <span className="pet-stage-ground" aria-hidden="true" />
            </div>
            <div className="pet-title">
              <h2>{pet.data.name ?? petSpeciesLabels[pet.data.species]}</h2>
              <p className="pet-note">
                {petSpeciesLabels[pet.data.species]} · {petStageLabels[pet.data.stage]}
              </p>
            </div>
            <PetChips pet={pet.data} />
            <div className="pet-stats">
              <PetStats pet={pet.data} isFree={billing.data?.plan === "free"} />
            </div>
            <GrowthPath stage={pet.data.stage} />
          </div>
        )}

        {writeError ? (
          <p className="page-error" role="alert">
            {writeError.message}
          </p>
        ) : null}

        <section className="pet-panel pet-earning-panel" aria-labelledby="pet-earning-title">
          <h2 id="pet-earning-title">How to earn points</h2>
          <ul className="pet-earning">
            {petEarningRows.map((row) => (
              <li key={row.label}>
                <span className="pet-earning-icon" aria-hidden="true">
                  {row.emoji}
                </span>
                <strong>{row.label}</strong>
                <span>
                  +{row.rule.points} pts · {row.rule.dailyCount}× a day
                </span>
              </li>
            ))}
          </ul>
          <p className="pet-note">
            Doing three different things in a day adds a 10 point bonus. A day earns at most{" "}
            {PET_DAILY_POINT_CEILING} points.
          </p>
        </section>

        {pet.data?.enabled ? (
          <button
            className="button secondary pet-turn-off"
            type="button"
            disabled={busy}
            onClick={() => setEnabled.mutate(false)}
          >
            Turn off my pet
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}
