import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <div className="full-page-status">Restoring your workspace…</div>;
  if (!user) {
    const redirectTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} replace />;
  }
  return children;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <div className="full-page-status">Checking your session…</div>;
  if (user) return <Navigate to="/app" replace />;
  return children;
}
