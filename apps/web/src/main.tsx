import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { CloudflareAnalytics } from "./analytics/CloudflareAnalytics";
import { GoogleAnalytics } from "./analytics/GoogleAnalytics";
import { App } from "./App";
import { AssistantSessionProvider } from "./assistant/AssistantSessionProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { CookieConsentExperience } from "./components/consent/CookieConsentExperience";
import { InitialDashboardExperienceProvider } from "./components/dashboard/InitialDashboardExperienceProvider";
import { ReleaseNotesExperience } from "./components/releases/ReleaseNotesExperience";
import { ThemeChoiceDialog } from "./components/theme/ThemeChoiceDialog";
import { CookieConsentProvider } from "./consent/CookieConsentProvider";
import { ImportDraftProvider } from "./import/ImportDraftProvider";
import { InstallationProvider } from "./pwa/installation";
import { registerZoptionServiceWorker } from "./pwa/registerServiceWorker";
import "./styles/foundation.css";
import { ThemeProvider } from "./theme/ThemeProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ClientExperiences() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <ThemeChoiceDialog />
      <CookieConsentExperience />
      <ReleaseNotesExperience />
      <CloudflareAnalytics />
      <GoogleAnalytics />
    </>
  );
}

function BrowserApplication() {
  return (
    <StrictMode>
      <ThemeProvider>
        <InstallationProvider>
          <CookieConsentProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <InitialDashboardExperienceProvider>
                  <AssistantSessionProvider>
                    <ImportDraftProvider>
                      <BrowserRouter>
                        <App />
                        <ClientExperiences />
                      </BrowserRouter>
                    </ImportDraftProvider>
                  </AssistantSessionProvider>
                </InitialDashboardExperienceProvider>
              </AuthProvider>
            </QueryClientProvider>
          </CookieConsentProvider>
        </InstallationProvider>
      </ThemeProvider>
    </StrictMode>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Zoption could not find the application root.");

const application = <BrowserApplication />;
if (root.hasChildNodes()) {
  hydrateRoot(root, application);
} else {
  createRoot(root).render(application);
}

registerZoptionServiceWorker();
