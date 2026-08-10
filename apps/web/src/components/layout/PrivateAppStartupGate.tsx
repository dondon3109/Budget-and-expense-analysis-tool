import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthProvider";
import { useBodyScrollLock } from "../../hooks/useRootLock";
import { useInitialDashboardExperience } from "../dashboard/InitialDashboardExperienceProvider";

import { FullPageLoadingStatus } from "./FullPageLoadingStatus";
import { InlineLoader } from "./InlineLoader";

const PRIVATE_STARTUP_DURATION_MS = 3000;

const noop = () => undefined;

const PrivateAppStartupReadinessContext = createContext<(settled: boolean) => void>(noop);

/** Reports whether the dashboard's primary summary request has loaded or failed. */
export function usePrivateAppStartupReadiness(): (settled: boolean) => void {
  return useContext(PrivateAppStartupReadinessContext);
}

type RouteCommitReporterProps = {
  locationKey: string;
  onCommit: (locationKey: string) => void;
};

function RouteCommitReporter({ locationKey, onCommit }: RouteCommitReporterProps) {
  useEffect(() => {
    onCommit(locationKey);
  }, [locationKey, onCommit]);

  return null;
}

/**
 * Persistent layout for the authenticated application. It owns the one startup
 * experience while lazy route code and the initial dashboard request load
 * concurrently behind it.
 */
export function PrivateAppStartupGate() {
  const { loading, user } = useAuth();
  const location = useLocation();
  const { hasCompletedInitialDashboardExperience, completeInitialDashboardExperience } =
    useInitialDashboardExperience();
  const [minimumDurationElapsed, setMinimumDurationElapsed] = useState(false);
  const [committedLocationKey, setCommittedLocationKey] = useState<string>();
  const [dashboardSettled, setDashboardSettled] = useState(false);

  const startupActive = !hasCompletedInitialDashboardExperience;
  const isDashboardRoute = location.pathname === "/app" || location.pathname === "/app/";
  const routeCommitted = committedLocationKey === location.key;
  const routeReady = routeCommitted && (!isDashboardRoute || dashboardSettled);

  useBodyScrollLock(startupActive);

  const handleMinimumDurationComplete = useCallback(() => {
    setMinimumDurationElapsed(true);
  }, []);

  const reportDashboardSettled = useCallback((settled: boolean) => {
    setDashboardSettled(settled);
  }, []);

  useEffect(() => {
    if (!startupActive || !user || !minimumDurationElapsed || !routeReady) return;
    completeInitialDashboardExperience();
  }, [completeInitialDashboardExperience, minimumDurationElapsed, routeReady, startupActive, user]);

  const readinessValue = useMemo(() => reportDashboardSettled, [reportDashboardSettled]);
  const handleRouteCommit = useCallback((locationKey: string) => {
    setCommittedLocationKey(locationKey);
  }, []);

  if (!loading && !user) {
    const redirectTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} replace />;
  }

  return (
    <PrivateAppStartupReadinessContext.Provider value={readinessValue}>
      <div
        className="private-app-startup-content"
        aria-hidden={startupActive || undefined}
        inert={startupActive || undefined}
      >
        {!loading && user && (
          <Suspense
            fallback={
              hasCompletedInitialDashboardExperience ? (
                <InlineLoader label="Loading your workspace" />
              ) : null
            }
          >
            <Outlet />
            <RouteCommitReporter locationKey={location.key} onCommit={handleRouteCommit} />
          </Suspense>
        )}
      </div>

      {startupActive && (
        <FullPageLoadingStatus
          title="Restoring your workspace"
          description="Checking your secure session and preferences."
          durationMs={PRIVATE_STARTUP_DURATION_MS}
          onComplete={handleMinimumDurationComplete}
        />
      )}
    </PrivateAppStartupReadinessContext.Provider>
  );
}
