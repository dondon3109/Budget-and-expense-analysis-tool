import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { FullPageLoadingStatus } from "../components/layout/FullPageLoadingStatus";

import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();

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
