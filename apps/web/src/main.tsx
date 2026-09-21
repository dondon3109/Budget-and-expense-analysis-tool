import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { PostHogAnalytics } from "./analytics/PostHogAnalytics";
import { App } from "./App";
import { AssistantSessionProvider } from "./assistant/AssistantSessionProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { CookieConsentExperience } from "./components/consent/CookieConsentExperience";
import { InitialDashboardExperienceProvider } from "./components/dashboard/InitialDashboardExperienceProvider";
import { AppErrorBoundary } from "./components/layout/AppErrorBoundary";
import { ReleaseNotesExperience } from "./components/releases/ReleaseNotesExperience";
import { ThemeChoiceDialog } from "./components/theme/ThemeChoiceDialog";
import { CookieConsentProvider } from "./consent/CookieConsentProvider";
import { ImportDraftProvider } from "./import/ImportDraftProvider";
import { isApiRequestError } from "./lib/api";
import { InstallationProvider } from "./pwa/installation";
import { registerZoptionServiceWorker } from "./pwa/registerServiceWorker";
import "./styles/foundation.css";
import { ThemeProvider } from "./theme/ThemeProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // The API client already repeats a timed-out read once with a pause, so retrying the same
      // timeout here as well would only double how long the user waits before the error surfaces.
      retry: (failureCount, error) =>
        failureCount < 1 && !(isApiRequestError(error) && error.code === "request_timeout"),
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
      <PostHogAnalytics />
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
                {/* The router stays outside the identity-keyed providers below: they reset
                    themselves by remounting when the signed-in user changes, and restarting
                    the router would discard the location that a sign-in callback is reading. */}
                <BrowserRouter>
                  <AppErrorBoundary>
                    <InitialDashboardExperienceProvider>
                      <AssistantSessionProvider>
                        <ImportDraftProvider>
                          <App />
                          <ClientExperiences />
                        </ImportDraftProvider>
                      </AssistantSessionProvider>
                    </InitialDashboardExperienceProvider>
                  </AppErrorBoundary>
                </BrowserRouter>
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
