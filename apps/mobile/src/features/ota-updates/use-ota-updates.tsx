import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { InteractionManager } from "react-native";

import { expoOtaUpdateClient } from "./expo-ota-client";
import { checkAndDownloadOtaUpdate, type OtaUpdateClient } from "./ota-update-service";

export type OtaUpdateStatus =
  "idle" | "checking" | "downloading" | "current" | "ready" | "error" | "restarting";

export interface OtaUpdateController {
  supported: boolean;
  status: OtaUpdateStatus;
  error: string | null;
  check: () => Promise<void>;
  restart: () => Promise<void>;
}

const OtaUpdateContext = createContext<OtaUpdateController | null>(null);

export function OtaUpdateProvider({
  children,
  client = expoOtaUpdateClient,
}: PropsWithChildren<{ client?: OtaUpdateClient }>) {
  const controller = useOtaUpdateController(client);
  return <OtaUpdateContext.Provider value={controller}>{children}</OtaUpdateContext.Provider>;
}

export function useOptionalOtaUpdates(): OtaUpdateController | null {
  return useContext(OtaUpdateContext);
}

export function useOtaUpdateController(client: OtaUpdateClient): OtaUpdateController {
  const supported = !__DEV__ && client.isEnabled;
  const [status, setStatus] = useState<OtaUpdateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const runCheck = useCallback(
    async (quiet: boolean) => {
      if (!supported) return;
      if (inFlight.current) {
        await inFlight.current;
        return;
      }

      setError(null);
      const work = (async () => {
        try {
          const result = await checkAndDownloadOtaUpdate(client, setStatus);
          setStatus(result.status);
        } catch {
          setStatus(quiet ? "idle" : "error");
          if (!quiet) {
            setError(
              "Zoption could not check for a quick update. Your installed app is unchanged.",
            );
          }
        }
      })();
      inFlight.current = work;
      try {
        await work;
      } finally {
        inFlight.current = null;
      }
    },
    [client, supported],
  );

  const check = useCallback(() => runCheck(false), [runCheck]);

  const restart = useCallback(async () => {
    if (!supported || status !== "ready") return;
    setStatus("restarting");
    setError(null);
    try {
      await client.reloadAsync();
    } catch {
      setStatus("error");
      setError(
        "Zoption could not restart. Close and reopen the app to apply the downloaded update.",
      );
    }
  }, [client, status, supported]);

  useEffect(() => {
    if (!supported) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      void runCheck(true);
    });
    return () => handle.cancel();
  }, [runCheck, supported]);

  return useMemo(
    () => ({
      supported,
      status,
      error,
      check,
      restart,
    }),
    [check, error, restart, status, supported],
  );
}
