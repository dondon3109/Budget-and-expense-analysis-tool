import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AssistantSessionProvider } from "./assistant/AssistantSessionProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { ThemeChoiceDialog } from "./components/theme/ThemeChoiceDialog";
import { ImportDraftProvider } from "./import/ImportDraftProvider";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ThemeChoiceDialog />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AssistantSessionProvider>
            <ImportDraftProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </ImportDraftProvider>
          </AssistantSessionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
