import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { captureFunnelEvent } from "../../analytics/funnel";
import { useAuth } from "../../auth/AuthProvider";
import { useBodyScrollLock } from "../../hooks/useRootLock";
import { useInitialDashboardExperience } from "../dashboard/InitialDashboardExperienceProvider";

import { FullPageLoadingStatus, type LoadingPhase } from "./FullPageLoadingStatus";
import { InlineLoader } from "./InlineLoader";

/** Last resort so a stalled session restore, chunk fetch, or summary query cannot trap the app. */
const PRIVATE_STARTUP_SAFEGUARD_MS = 4000;

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
  const [committedLocationKey, setCommittedLocationKey] = useState<string>();
  const [dashboardSettled, setDashboardSettled] = useState(false);
  const [safeguardUserId, setSafeguardUserId] = useState<string>();
  const safeguardRef = useRef<number>(undefined);

  const startupActive = !hasCompletedInitialDashboardExperience;
  const isDashboardRoute = location.pathname === "/app" || location.pathname === "/app/";
  const routeCommitted = committedLocationKey === location.key;
  const routeReady = routeCommitted && (!isDashboardRoute || dashboardSettled);

  // The loader reports the work it is actually waiting on, so the bar reflects
  // real steps instead of a timer.
  const startupPhase: LoadingPhase = loading ? "session" : routeCommitted ? "summary" : "workspace";
  const startupProgress = 1 + (routeCommitted ? 1 : 0);

  useBodyScrollLock(startupActive);

  const reportDashboardSettled = useCallback((settled: boolean) => {
    setDashboardSettled(settled);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    // The client cannot tell a new account from a returning one, so this step
    // only marks that an app session started; activation is the first import.
    captureFunnelEvent("app_session_started", {});
  }, [loading, user]);

  // Safeguard: the loader leaves as soon as the route and its data are ready. If
  // either stalls, ask the splash to hand over anyway, so the exit still plays
  // instead of the surface being cut mid fade. Keyed by user, so one account's
  // safeguard cannot hand the next account's half loaded workspace over early.
  useEffect(() => {
    if (!startupActive || !user) return;
    const userId = user.id;
    safeguardRef.current = window.setTimeout(
      () => setSafeguardUserId(userId),
      PRIVATE_STARTUP_SAFEGUARD_MS,
    );
    return () => window.clearTimeout(safeguardRef.current);
  }, [startupActive, user]);

  // The splash owns the handover: it plays its exit once the route and its data
  // are ready, then reports back so the workspace underneath can be revealed.
  const startupReady = Boolean(user) && (routeReady || safeguardUserId === user?.id);

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
          phase={startupPhase}
          progress={startupProgress}
          ready={startupReady}
          onComplete={completeInitialDashboardExperience}
        />
      )}
    </PrivateAppStartupReadinessContext.Provider>
  );
}
