import { petViewSchema, type PetColor, type PetEggChoice, type PetView } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

const PATH = "/api/app/pet";

/** Records that the app was opened today (the login that readies eggs) and returns the pet. */
export async function checkInPet(workspace: AuthenticatedWorkspace): Promise<PetView> {
  return petViewSchema.parse(await requestJson(workspace, `${PATH}/check-in`, { method: "POST" }));
}

export async function choosePetEgg(
  workspace: AuthenticatedWorkspace,
  choice: PetEggChoice,
): Promise<PetView> {
  return petViewSchema.parse(
    await requestJson(workspace, `${PATH}/egg`, {
      method: "PUT",
      body: JSON.stringify(choice),
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

/** Recolors the pet. The Worker answers 409 when there is no pet or egg. */
export async function setPetColor(
  workspace: AuthenticatedWorkspace,
  color: PetColor,
): Promise<PetView> {
  return petViewSchema.parse(
    await requestJson(workspace, `${PATH}/color`, {
      method: "PUT",
      body: JSON.stringify({ color }),
    }),
  );
}

/** Breaks open a ready egg after its last click. The Worker answers 409 when it is not ready. */
export async function hatchPet(workspace: AuthenticatedWorkspace): Promise<PetView> {
  return petViewSchema.parse(await requestJson(workspace, `${PATH}/hatch`, { method: "POST" }));
}
