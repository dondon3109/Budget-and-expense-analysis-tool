import * as Updates from "expo-updates";

import type { OtaUpdateClient } from "./ota-update-service";

/** Thin adapter keeps Expo's native module replaceable in focused tests. */
export const expoOtaUpdateClient: OtaUpdateClient = {
  get isEnabled() {
    return Updates.isEnabled;
  },
  checkForUpdateAsync: () => Updates.checkForUpdateAsync(),
  fetchUpdateAsync: () => Updates.fetchUpdateAsync(),
  reloadAsync: () => Updates.reloadAsync(),
};
