import { type ReactElement } from "react";
import { Route, Routes } from "react-router-dom";

import { CookiePolicyPage } from "./pages/legal/CookiePolicyPage";
import { FaqPage } from "./pages/faq/FaqPage";
import { PrivacyPolicyPage } from "./pages/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "./pages/legal/TermsOfServicePage";
import { LandingPage } from "./pages/LandingPage";
import { InstallPage } from "./pages/InstallPage";
import { ChangelogPage } from "./pages/changelog/ChangelogPage";
import { PricingPage } from "./pages/pricing/PricingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
