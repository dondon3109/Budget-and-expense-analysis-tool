import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { FullPageLoadingStatus } from "../components/layout/FullPageLoadingStatus";

import { useAuth } from "./AuthProvider";

/** How long the branded loading screen plays after a private session resolves. */
const PRIVATE_LOADING_DURATION_MS = 3000;

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  const [released, setReleased] = useState(false);

  // Restart the loading sequence whenever the signed-in identity changes so the
  // cinematic splash cues each new private session.
  useEffect(() => {
    setReleased(false);
  }, [user?.id]);

  if (loading) {
    return (
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking your secure session and preferences."
      />
    );
  }
  if (!user) {
    const redirectTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} replace />;
  }
  if (!released) {
    // Hold the award-winning loading screen while the workspace restores, then
    // reveal the dashboard on the exact frame the progress resolves.
    return (
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking your secure session and preferences."
        durationMs={PRIVATE_LOADING_DURATION_MS}
        onComplete={() => setReleased(true)}
      />
    );
  }
  return children;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <FullPageLoadingStatus
        title="Checking your session"
        description="Getting your secure sign-in ready."
      />
    );
  }
  if (user) return <Navigate to="/app" replace />;
  return children;
}
