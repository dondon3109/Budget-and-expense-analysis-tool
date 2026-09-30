import {
  DENIED_OPTIONAL_CONSENT,
  OPTIONAL_CONSENT_CATEGORIES,
  type ConsentPreferences,
  type OptionalConsentCategory,
} from "./consent";

type IntegrationCleanup = () => void | Promise<void>;
type IntegrationLoader = () => void | IntegrationCleanup | Promise<void | IntegrationCleanup>;
type ConsentListener = (preferences: Readonly<ConsentPreferences>) => void;

interface IntegrationRegistration {
  category: OptionalConsentCategory;
  loader: IntegrationLoader;
  cleanup?: IntegrationCleanup;
  generation: number;
  active: boolean;
}

let preferences: ConsentPreferences = { ...DENIED_OPTIONAL_CONSENT };
const registrations = new Set<IntegrationRegistration>();
const listeners = new Set<ConsentListener>();

function isEnabled(category: OptionalConsentCategory) {
  return preferences[category];
}

async function deactivate(registration: IntegrationRegistration) {
  registration.generation += 1;
  registration.active = false;
  const cleanup = registration.cleanup;
  registration.cleanup = undefined;
  if (cleanup) await cleanup();
}

async function activate(registration: IntegrationRegistration) {
  if (registration.active || !isEnabled(registration.category)) return;

  registration.active = true;
  const generation = ++registration.generation;

  try {
    const cleanup = await registration.loader();
    if (
      generation !== registration.generation ||
      !registration.active ||
      !isEnabled(registration.category)
    ) {
      if (typeof cleanup === "function") await cleanup();
      return;
    }
    registration.cleanup = typeof cleanup === "function" ? cleanup : undefined;
  } catch (error) {
    if (generation === registration.generation) registration.active = false;
    console.error("Optional integration failed to start after consent was granted.", error);
  }
}

export function updateConsentGate(nextPreferences: ConsentPreferences) {
  preferences = { ...nextPreferences };

  for (const category of OPTIONAL_CONSENT_CATEGORIES) {
    for (const registration of registrations) {
      if (registration.category !== category) continue;
      if (isEnabled(category)) void activate(registration);
      else void deactivate(registration);
    }
  }

  for (const listener of listeners) listener(preferences);
}

export function getConsentGatePreferences(): Readonly<ConsentPreferences> {
  return preferences;
}

export function registerOptionalIntegration(
  category: OptionalConsentCategory,
  loader: IntegrationLoader,
): () => void {
  const registration: IntegrationRegistration = {
    category,
    loader,
    generation: 0,
    active: false,
  };
  registrations.add(registration);
  if (isEnabled(category)) void activate(registration);

  return () => {
    registrations.delete(registration);
    void deactivate(registration);
  };
}

export function subscribeToConsentGate(listener: ConsentListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetConsentGateForTests() {
  preferences = { ...DENIED_OPTIONAL_CONSENT };
  for (const registration of registrations) void deactivate(registration);
  registrations.clear();
  listeners.clear();
}
