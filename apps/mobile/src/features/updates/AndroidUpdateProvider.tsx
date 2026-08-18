import type { PropsWithChildren } from "react";

import { AndroidUpdateOverlay } from "./UpdatePrompt";
import { AndroidUpdateContextProvider, useAndroidUpdateController } from "./use-android-updates";
import type { UpdateServiceDependencies } from "./update-service";

export function AndroidUpdateProvider({
  children,
  dependencies,
}: PropsWithChildren<{ dependencies?: Partial<UpdateServiceDependencies> }>) {
  const controller = useAndroidUpdateController(dependencies);
  return (
    <AndroidUpdateContextProvider value={controller}>
      {children}
      <AndroidUpdateOverlay />
    </AndroidUpdateContextProvider>
  );
}
