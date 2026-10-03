import { petViewSchema, type PetSpecies, type PetView } from "@zoption/shared";

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

export function choosePetEgg(api: PetApi, species: PetSpecies): Promise<PetView> {
  return apiRequest({
    ...api,
    path: `${PATH}/egg`,
    method: "PUT",
    body: { species },
    fallback: "Zoption could not save your egg. Try again shortly.",
    decode,
  });
}

export function setPetEnabled(api: PetApi, enabled: boolean): Promise<PetView> {
  return apiRequest({
    ...api,
    path: `${PATH}/settings`,
    method: "PUT",
    body: { enabled },
    fallback: "Zoption could not update your pet. Try again shortly.",
    decode,
  });
}
