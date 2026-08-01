import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { PublicOnly, RequireAuth } from "./auth/RouteGuards";
import { useAuth } from "./auth/AuthProvider";
import { FullPageLoadingStatus } from "./components/layout/FullPageLoadingStatus";
import { syncVerifiedIdentity } from "./lib/api";
import { userWorkspace } from "./lib/workspace";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { publicRouteElements } from "./PublicRoutes";
import { SeoHead } from "./seo/SeoHead";
const DashboardPage = lazy(async () => {
  const module = await import("./pages/DashboardPage");
  return { default: module.DashboardPage };
});
const AssistantPage = lazy(async () => {
  const module = await import("./pages/AssistantPage");
  return { default: module.AssistantPage };
});
const CalendarPage = lazy(async () => {
  const module = await import("./pages/CalendarPage");
  return { default: module.CalendarPage };
});
const TransactionsPage = lazy(async () => {
  const module = await import("./pages/TransactionsPage");
  return { default: module.TransactionsPage };
});
const ImportPage = lazy(async () => {
  const module = await import("./pages/ImportPage");
  return { default: module.ImportPage };
});
const BudgetsPage = lazy(async () => {
  const module = await import("./pages/BudgetsPage");
  return { default: module.BudgetsPage };
});
const SubscriptionsPage = lazy(async () => {
  const module = await import("./pages/SubscriptionsPage");
  return { default: module.SubscriptionsPage };
});
const SettingsPage = lazy(async () => {
  const module = await import("./pages/SettingsPage");
  return { default: module.SettingsPage };
});
const LoginPage = lazy(async () => {
  const module = await import("./pages/LoginPage");
  return { default: module.LoginPage };
});
const SignupPage = lazy(async () => {
  const module = await import("./pages/SignupPage");
  return { default: module.SignupPage };
});
const ForgotPasswordPage = lazy(async () => {
  const module = await import("./pages/ForgotPasswordPage");
  return { default: module.ForgotPasswordPage };
});
const UpdatePasswordPage = lazy(async () => {
  const module = await import("./pages/UpdatePasswordPage");
  return { default: module.UpdatePasswordPage };
});
const AuthCallbackPage = lazy(async () => {
  const module = await import("./pages/AuthCallbackPage");
  return { default: module.AuthCallbackPage };
});
export function RootRoute() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const hasAuthError =
    searchParams.has("error") ||
    searchParams.has("error_code") ||
    hashParams.has("error") ||
    hashParams.has("error_code");

  if (hasAuthError) {
    return <Navigate to="/auth/callback?next=%2Fupdate-password" replace />;
  }

  const code = searchParams.get("code")?.trim();
  if (code) {
    const callbackParams = new URLSearchParams({ code });
    return <Navigate to={`/auth/callback?${callbackParams.toString()}`} replace />;
  }

  return <LandingPage />;
}

function Private({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

function SignedOutOnly({ children }: { children: React.ReactNode }) {
  return <PublicOnly>{children}</PublicOnly>;
}

function VerifiedIdentitySync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void syncVerifiedIdentity(userWorkspace(user)).catch(() => {
      // The next signed-in request can retry identity synchronization. A failure must not log out a user.
    });
  }, [user]);

  return null;
}

export function App() {
  return (
    <>
      <SeoHead />
      <VerifiedIdentitySync />
      <Suspense
        fallback={
          <FullPageLoadingStatus
            title="Loading Zoption"
            description="Bringing your workspace into view."
          />
        }
      >
        <Routes>
          {publicRouteElements(<RootRoute />)}
          <Route
            path="/login"
            element={
              <SignedOutOnly>
                <LoginPage />
              </SignedOutOnly>
            }
          />
          <Route
            path="/signup"
            element={
              <SignedOutOnly>
                <SignupPage />
              </SignedOutOnly>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <SignedOutOnly>
                <ForgotPasswordPage />
              </SignedOutOnly>
            }
          />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/update-password"
            element={
              <Private>
                <UpdatePasswordPage />
              </Private>
            }
          />
          <Route
            path="/app"
            element={
              <Private>
                <DashboardPage />
              </Private>
            }
          />
          <Route
            path="/app/assistant"
            element={
              <Private>
                <AssistantPage />
              </Private>
            }
          />
          <Route
            path="/app/accounts"
            element={
              <Private>
                <Navigate to="/app" replace />
              </Private>
            }
          />
          <Route
            path="/app/calendar"
            element={
              <Private>
                <CalendarPage />
              </Private>
            }
          />
          <Route
            path="/app/transactions"
            element={
              <Private>
                <TransactionsPage />
              </Private>
            }
          />
          <Route
            path="/app/import"
            element={
              <Private>
                <ImportPage />
              </Private>
            }
          />
          <Route
            path="/app/budgets"
            element={
              <Private>
                <BudgetsPage />
              </Private>
            }
          />
          <Route
            path="/app/subscriptions"
            element={
              <Private>
                <SubscriptionsPage />
              </Private>
            }
          />
          <Route
            path="/app/settings"
            element={
              <Private>
                <SettingsPage />
              </Private>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
