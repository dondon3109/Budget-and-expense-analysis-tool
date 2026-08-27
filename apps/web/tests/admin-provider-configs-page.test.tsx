// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  activateProviderConfig: vi.fn(),
  createProviderConfig: vi.fn(),
  createProviderCredential: vi.fn(),
  deleteProviderCredential: vi.fn(),
  getProviderConfigAudits: vi.fn(),
  getProviderConfigs: vi.fn(),
  getProviderCredentials: vi.fn(),
  getProviderHealth: vi.fn(),
  reorderProviderConfigs: vi.fn(),
  testProviderCredential: vi.fn(),
  updateProviderConfig: vi.fn(),
  updateProviderCredential: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "admin-1", email: "admin@example.com" },
  }),
}));

vi.mock("../src/hooks/useBillingSummary", () => ({
  useBillingSummary: () => ({
    data: { canManageSponsoredSeats: true },
    isPending: false,
    isError: false,
  }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import { AdminProviderConfigsPage } from "../src/pages/AdminProviderConfigsPage";

describe("AdminProviderConfigsPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    apiMocks.getProviderConfigs.mockResolvedValue({
      configs: [
        {
          id: "cfg-whisper",
          service: "stt",
          provider: "cloudflare_workers_ai",
          model: "@cf/openai/whisper-large-v3-turbo",
          displayName: "Cloudflare Whisper",
          credentialId: null,
          enabled: true,
          priority: 1,
          isActive: true,
          createdAt: "2026-08-27T00:00:00Z",
          updatedAt: "2026-08-27T00:00:00Z",
          updatedBy: null,
        },
      ],
    });
    apiMocks.getProviderCredentials.mockResolvedValue({
      credentials: [
        {
          id: "cred-google-1",
          provider: "google",
          name: "My Google AI Key",
          apiKeyLast4: "9876",
          usedBy: [],
          createdAt: "2026-08-27T00:00:00Z",
          updatedAt: "2026-08-27T00:00:00Z",
          updatedBy: null,
        },
      ],
    });
    apiMocks.getProviderConfigAudits.mockResolvedValue({ audits: [] });
    apiMocks.getProviderHealth.mockResolvedValue({
      health: [
        {
          service: "stt",
          provider: "cloudflare_workers_ai",
          model: "@cf/openai/whisper-large-v3-turbo",
          configId: "cfg-whisper",
          hasCredential: true,
          credentialSource: "binding",
          details: "Workers AI binding ready",
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminProviderConfigsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders credentials with name and masked last4", async () => {
    renderPage();
    expect(await screen.findByText("My Google AI Key")).toBeInTheDocument();
    expect(screen.getByText("••••9876")).toBeInTheDocument();
  });

  it("allows opening add configuration and selecting a Google credential", async () => {
    renderPage();
    await screen.findByText("Voice Input · STT");

    // Click "Add configuration" in STT section
    const addButtons = screen.getAllByRole("button", { name: /Add configuration/i });
    fireEvent.click(addButtons[1]!); // Second section is STT

    expect(await screen.findByText("Add stt configuration")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");

    // Select provider = google
    const providerSelect = within(dialog).getByLabelText(/^Provider/i);
    fireEvent.change(providerSelect, { target: { value: "google" } });

    // Verify Google model dropdown contains gemini-3.5-transcribe
    const modelSelect = within(dialog).getByLabelText(/^Model/i);
    expect(modelSelect).toHaveTextContent("gemini-3.5-transcribe");

    // Verify credential dropdown is visible and offers the Google credential
    const credSelect = within(dialog).getByLabelText(/Credential \(Google API key or OAuth\)/i);
    expect(credSelect).toBeInTheDocument();
    expect(credSelect).toHaveTextContent("My Google AI Key ••••9876");

    // Select the credential and submit
    fireEvent.change(credSelect, { target: { value: "cred-google-1" } });

    apiMocks.createProviderConfig.mockResolvedValue({
      id: "cfg-google-new",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe",
      displayName: "google / gemini-3.5-transcribe",
      credentialId: "cred-google-1",
      enabled: true,
      priority: 2,
      isActive: false,
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      updatedBy: "admin-1",
    });

    const submitBtn = within(dialog).getByRole("button", { name: "Add configuration" });
    expect(submitBtn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(apiMocks.createProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        service: "stt",
        provider: "google",
        model: "gemini-3.5-transcribe",
        credentialId: "cred-google-1",
      }),
    );
  });

  it("opens edit configuration dialog to update display name or credential", async () => {
    renderPage();
    await screen.findByText("Cloudflare Whisper");

    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    // Look for edit button in configuration table
    const configEditBtn = editButtons.find((b) =>
      b.getAttribute("title")?.includes("Edit display name"),
    );
    expect(configEditBtn).toBeDefined();
    fireEvent.click(configEditBtn!);

    expect(await screen.findByText(/Edit configuration — Cloudflare Whisper/i)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");

    const nameInput = within(dialog).getByLabelText(/^Display name/i);
    fireEvent.change(nameInput, { target: { value: "Cloudflare Whisper Turbo" } });

    apiMocks.updateProviderConfig.mockResolvedValue({
      id: "cfg-whisper",
      displayName: "Cloudflare Whisper Turbo",
    });

    const saveBtn = within(dialog).getByRole("button", { name: "Save configuration" });
    expect(saveBtn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(apiMocks.updateProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      "cfg-whisper",
      expect.objectContaining({
        displayName: "Cloudflare Whisper Turbo",
      }),
    );
  });
});
