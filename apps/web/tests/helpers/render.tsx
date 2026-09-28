import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

/** Retries are off so a rejected API mock surfaces as an error state on the first attempt. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/**
 * Renders `ui` inside a fresh query client and a memory router, and returns the client so a test
 * can read or seed the cache.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    route = "/",
    ...options
  }: { queryClient?: QueryClient; route?: string } & Omit<RenderOptions, "wrapper"> = {},
): RenderResult & { queryClient: QueryClient } {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
    options,
  );
  return { ...result, queryClient };
}
