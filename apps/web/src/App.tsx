import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { PublicOnly, RequireAuth } from "./auth/RouteGuards";

const LandingPage = lazy(async () => {
  const module = await import("./pages/LandingPage");
  return { default: module.LandingPage };
});
const DashboardPage = lazy(async () => {
  const module = await import("./pages/DashboardPage");
  return { default: module.DashboardPage };
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

function Private({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

function SignedOutOnly({ children }: { children: React.ReactNode }) {
  return <PublicOnly>{children}</PublicOnly>;
}

export function App() {
  return (
    <Suspense fallback={<div className="full-page-status">Loading Clarity…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo" element={<DashboardPage mode="demo" />} />
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
              <DashboardPage mode="user" />
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
        <Route path="/transactions" element={<Navigate to="/app/transactions" replace />} />
        <Route path="/import" element={<Navigate to="/app/import" replace />} />
        <Route path="/budgets" element={<Navigate to="/app/budgets" replace />} />
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
