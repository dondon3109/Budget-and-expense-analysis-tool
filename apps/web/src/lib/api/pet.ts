import { petViewSchema, type PetSpecies, type PetView } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

const PATH = "/api/app/pet";

/** Records that the app was opened today (the login that hatches eggs) and returns the pet. */
export async function checkInPet(workspace: AuthenticatedWorkspace): Promise<PetView> {
  return petViewSchema.parse(await requestJson(workspace, `${PATH}/check-in`, { method: "POST" }));
}

export async function choosePetEgg(
  workspace: AuthenticatedWorkspace,
  species: PetSpecies,
): Promise<PetView> {
  return petViewSchema.parse(
    await requestJson(workspace, `${PATH}/egg`, {
      method: "PUT",
      body: JSON.stringify({ species }),
    }),
  );
}

export async function setPetEnabled(
  workspace: AuthenticatedWorkspace,
  enabled: boolean,
): Promise<PetView> {
  return petViewSchema.parse(
    await requestJson(workspace, `${PATH}/settings`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  );
}
