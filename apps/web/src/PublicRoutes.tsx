import { type ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { FINANCE_GUIDES } from "@zoption/shared";

import { CookiePolicyPage } from "./pages/legal/CookiePolicyPage";
import { FaqPage } from "./pages/faq/FaqPage";
import { PrivacyPolicyPage } from "./pages/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "./pages/legal/TermsOfServicePage";
import { LandingPage } from "./pages/LandingPage";
import { InstallPage } from "./pages/InstallPage";
import { ChangelogPage } from "./pages/changelog/ChangelogPage";
import { PricingPage } from "./pages/pricing/PricingPage";
import { GuidesIndexPage } from "./pages/guides/GuidesIndexPage";
import { GuideDetailPage } from "./pages/guides/GuideDetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SharedBudgetPage } from "./pages/shared/SharedBudgetPage";
import { ImportGuidePage } from "./pages/import/ImportGuidePage";
import { ImportHubPage } from "./pages/import/ImportHubPage";
import { PUBLIC_ROUTE_PATHS, type PublicRoutePath } from "./seo/siteMetadata";

const PUBLIC_ROUTE_ELEMENTS: Record<PublicRoutePath, ReactElement> = {
  "/": <LandingPage />,
  "/pricing": <PricingPage />,
  "/terms-of-service": <TermsOfServicePage />,
  "/privacy-policy": <PrivacyPolicyPage />,
  "/cookie-policy": <CookiePolicyPage />,
  "/faq": <FaqPage />,
  "/install": <InstallPage />,
  "/changelog": <ChangelogPage />,
  "/guides": <GuidesIndexPage />,
  ...Object.fromEntries(
    FINANCE_GUIDES.map((guide) => [
      `/guides/${guide.slug}`,
      <GuideDetailPage slug={guide.slug} key={guide.slug} />,
    ]),
  ),
  "/import": <ImportHubPage />,
  "/import/bdo-statement": <ImportGuidePage />,
  "/import/bpi-statement": <ImportGuidePage />,
  "/import/maribank-statement": <ImportGuidePage />,
  "/import/bank-of-america-statement": <ImportGuidePage />,
  "/import/jpmorgan-statement": <ImportGuidePage />,
};

export function publicRouteElements(rootElement = PUBLIC_ROUTE_ELEMENTS["/"]) {
  return PUBLIC_ROUTE_PATHS.map((path) => (
    <Route
      key={path}
      path={path}
      element={path === "/" ? rootElement : PUBLIC_ROUTE_ELEMENTS[path]}
    />
  ));
}

export function PublicRoutes() {
  return (
    <Routes>
      {publicRouteElements()}
      <Route path="/guides/:slug" element={<GuideDetailPage />} />
      <Route path="/shared/budget/:token" element={<SharedBudgetPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
