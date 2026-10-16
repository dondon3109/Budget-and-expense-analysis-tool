import { petViewSchema, type PetColor, type PetSpecies, type PetView } from "@zoption/shared";

import { telemetry } from "@/telemetry/telemetry";

import { apiRequest } from "./authenticated";

export interface PetApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const PATH = "/api/app/pet";
const decode = (value: unknown) => petViewSchema.parse(value);

/** The pet, after the Worker credits activity recorded since the last read. */
export function getPet(api: PetApi): Promise<PetView> {
  return apiRequest({
    ...api,
    path: PATH,
    method: "GET",
    fallback: "Zoption could not load your pet. Try again shortly.",
    decode,
  });
}

/** Records that the app was opened today: the login that hatches eggs and earns daily points. */
export function checkInPet(api: PetApi): Promise<PetView> {
  return apiRequest({
    ...api,
    path: `${PATH}/check-in`,
    method: "POST",
    fallback: "Zoption could not reach your pet. Try again shortly.",
    decode,
  });
}

export async function choosePetEgg(
  api: PetApi,
  species: PetSpecies,
  name: string,
  color: PetColor,
): Promise<PetView> {
  const view = await apiRequest({
    ...api,
    path: `${PATH}/egg`,
    method: "PUT",
    body: { species, name, color },
    fallback: "Zoption could not save your egg. Try again shortly.",
    decode,
  });
  void telemetry.capture("pet_egg_chosen");
  return view;
}

/** Recolors the pet. The Worker answers 409 when there is no pet or egg. */
export async function setPetColor(api: PetApi, color: PetColor): Promise<PetView> {
  const view = await apiRequest({
    ...api,
    path: `${PATH}/color`,
    method: "PUT",
    body: { color },
    fallback: "Zoption could not recolor your pet. Try again shortly.",
    decode,
  });
  void telemetry.capture("pet_color_set");
  return view;
}

export async function setPetEnabled(api: PetApi, enabled: boolean): Promise<PetView> {
  const view = await apiRequest({
    ...api,
    path: `${PATH}/settings`,
    method: "PUT",
    body: { enabled },
    fallback: "Zoption could not update your pet. Try again shortly.",
    decode,
  });
  void telemetry.capture("pet_enabled_set", { enabled });
  return view;
}

/** Breaks open a ready egg after its last tap. The Worker answers 409 when the egg is not ready. */
export async function hatchPet(api: PetApi): Promise<PetView> {
  const view = await apiRequest({
    ...api,
    path: `${PATH}/hatch`,
    method: "POST",
    fallback: "Couldn't hatch your egg. Try again.",
    decode,
  });
  void telemetry.capture("pet_hatched");
  return view;
}
