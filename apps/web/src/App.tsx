import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

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

export function App() {
  return (
    <Suspense fallback={<div className="full-page-status">Loading Clarity…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
