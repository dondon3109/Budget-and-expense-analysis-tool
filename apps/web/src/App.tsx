import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { PublicOnly, RequireAuth } from "./auth/RouteGuards";

const LandingPage = lazy(async () => {
  const module = await import("./pages/LandingPage");
  return { default: module.LandingPage };
});
const DashboardPage = lazy(async () => {
  const module = await import("./pages/DashboardPage");
  return { default: module.DashboardPage };
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

export function App() {
  return (
    <Suspense fallback={<div className="full-page-status">Loading Zoption…</div>}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
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
        <Route path="/calendar" element={<Navigate to="/app/calendar" replace />} />
        <Route path="/transactions" element={<Navigate to="/app/transactions" replace />} />
        <Route path="/import" element={<Navigate to="/app/import" replace />} />
        <Route path="/budgets" element={<Navigate to="/app/budgets" replace />} />
        <Route path="/subscriptions" element={<Navigate to="/app/subscriptions" replace />} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
