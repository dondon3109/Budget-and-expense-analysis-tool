import { type ReactElement } from "react";
import { Route, Routes } from "react-router-dom";

import { CookiePolicyPage } from "./pages/legal/CookiePolicyPage";
import { FaqPage } from "./pages/faq/FaqPage";
import { PrivacyPolicyPage } from "./pages/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "./pages/legal/TermsOfServicePage";
import { LandingPage } from "./pages/LandingPage";
import { InstallPage } from "./pages/InstallPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PUBLIC_ROUTE_PATHS, type PublicRoutePath } from "./seo/siteMetadata";

const PUBLIC_ROUTE_ELEMENTS: Record<PublicRoutePath, ReactElement> = {
  "/": <LandingPage />,
  "/terms-of-service": <TermsOfServicePage />,
  "/privacy-policy": <PrivacyPolicyPage />,
  "/cookie-policy": <CookiePolicyPage />,
  "/faq": <FaqPage />,
  "/install": <InstallPage />,
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
