import { Route, Routes } from "react-router-dom";

import { CookiePolicyPage } from "./pages/legal/CookiePolicyPage";
import { PrivacyPolicyPage } from "./pages/legal/PrivacyPolicyPage";
import { TermsOfServicePage } from "./pages/legal/TermsOfServicePage";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/terms-of-service" element={<TermsOfServicePage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/cookie-policy" element={<CookiePolicyPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
