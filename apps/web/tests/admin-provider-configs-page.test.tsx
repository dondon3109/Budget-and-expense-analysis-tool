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
  deleteProviderConfig: vi.fn(),
  deleteProviderCredential: vi.fn(),
  getProviderConfigAudits: vi.fn(),
  getProviderConfigs: vi.fn(),
  getProviderCredentials: vi.fn(),
  getProviderHealth: vi.fn(),
  reorderProviderConfigs: vi.fn(),
  testProviderCredential: vi.fn(),
  previewProviderModels: vi.fn(),
  listCredentialModels: vi.fn(),
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
        {
          id: "cfg-google-inactive",
          service: "stt",
          provider: "google",
          model: "gemini-3.5-transcribe-live",
          displayName: "Google Gemini 3.5 Transcribe Live",
          credentialId: "cred-google-1",
          enabled: true,
          priority: 2,
          isActive: false,
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

  it("allows entering a new API key directly when adding a configuration", async () => {
    renderPage();
    await screen.findByText("Voice Input · STT");

    // Click "Add configuration" in STT section
    const addButtons = screen.getAllByRole("button", { name: /Add configuration/i });
    fireEvent.click(addButtons[1]!);

    expect(await screen.findByText("Add stt configuration")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");

    // Select provider = google
    const providerSelect = within(dialog).getByLabelText(/^Provider/i);
    fireEvent.change(providerSelect, { target: { value: "google" } });

    // Click "Enter API key" tab button
    const enterKeyTab = within(dialog).getByRole("button", { name: /Enter API key/i });
    fireEvent.click(enterKeyTab);

    // Fill in Key Name and API Key / Secret
    const keyNameInput = within(dialog).getByLabelText(/Key Name \/ Label/i);
    fireEvent.change(keyNameInput, { target: { value: "Google Realtime Key" } });

    const secretInput = within(dialog).getByPlaceholderText(/AIzaSy\.\.\./i);
    fireEvent.change(secretInput, { target: { value: "AIzaSySecretVoiceKey12345" } });

    apiMocks.createProviderCredential.mockResolvedValue({
      id: "cred-google-new",
      provider: "google",
      name: "Google Realtime Key",
      apiKeyLast4: "2345",
      usedBy: [],
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      updatedBy: "admin-1",
    });

    apiMocks.createProviderConfig.mockResolvedValue({
      id: "cfg-google-stream",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe-live",
      displayName: "google / gemini-3.5-transcribe-live",
      credentialId: "cred-google-new",
      enabled: true,
      priority: 3,
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

    expect(apiMocks.createProviderCredential).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: "google",
        name: "Google Realtime Key",
        secret: "AIzaSySecretVoiceKey12345",
      }),
    );

    expect(apiMocks.createProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        service: "stt",
        provider: "google",
        credentialId: "cred-google-new",
      }),
    );
  });

  it("reports a failed save inside the add dialog", async () => {
    renderPage();
    await screen.findByText("Voice Input · STT");

    const addButtons = screen.getAllByRole("button", { name: /Add configuration/i });
    fireEvent.click(addButtons[1]!);

    const dialog = await screen.findByRole("dialog");

    // A saved Google credential exists, so the dialog opens in "existing" mode.
    // Switch to entering a key so the credential endpoint is exercised.
    fireEvent.click(within(dialog).getByRole("button", { name: /Enter API key/i }));
    fireEvent.change(within(dialog).getByPlaceholderText(/AIzaSy\.\.\./i), {
      target: { value: "AIzaSySecretVoiceKey12345" },
    });

    apiMocks.createProviderCredential.mockRejectedValue(
      new Error("Credential encryption is not configured. Set PROVIDER_CREDENTIAL_ENCRYPTION_KEY."),
    );

    const submitBtn = within(dialog).getByRole("button", { name: "Add configuration" });
    expect(submitBtn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Regression: the dialog is a full-viewport scrim, so an error rendered at
    // page level sits underneath it and the save looks like a dead click. The
    // reason must be reachable from inside the still-open dialog.
    const openDialog = screen.getByRole("dialog");
    expect(
      within(openDialog).getByText(/Credential encryption is not configured/i),
    ).toBeInTheDocument();
    expect(apiMocks.createProviderConfig).not.toHaveBeenCalled();
  });

  it("allows entering a custom model ID when adding an assistant configuration", async () => {
    renderPage();
    await screen.findByText("AI Assistant");

    // First "Add configuration" button is the assistant section (tab = all)
    const addButtons = screen.getAllByRole("button", { name: /Add configuration/i });
    fireEvent.click(addButtons[0]!);

    expect(await screen.findByText("Add assistant configuration")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");

    // Switch the model dropdown to manual entry and type an unlisted model
    const modelSelect = within(dialog).getByLabelText(/^Model/i);
    fireEvent.change(modelSelect, { target: { value: "__custom" } });

    const customInput = within(dialog).getByLabelText(/Custom model ID/i);
    fireEvent.change(customInput, { target: { value: "gpt-4o-next-unlisted" } });

    // Entering a key enables saving (assistant has no saved credentials mocked)
    const secretInput = within(dialog).getByPlaceholderText("sk-...");
    fireEvent.change(secretInput, { target: { value: "sk-test-custom-key-1234" } });

    apiMocks.createProviderCredential.mockResolvedValue({
      id: "cred-openai-new",
      provider: "deepseek",
      name: "DeepSeek Key",
      apiKeyLast4: "1234",
      usedBy: [],
      createdAt: "2026-08-27T00:00:00Z",
      updatedAt: "2026-08-27T00:00:00Z",
      updatedBy: "admin-1",
    });
    apiMocks.createProviderConfig.mockResolvedValue({
      id: "cfg-custom-new",
      service: "assistant",
      provider: "deepseek",
      model: "gpt-4o-next-unlisted",
      displayName: "deepseek / gpt-4o-next-unlisted",
      credentialId: "cred-openai-new",
      enabled: true,
      priority: 1,
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
        service: "assistant",
        provider: "deepseek",
        model: "gpt-4o-next-unlisted",
        credentialId: "cred-openai-new",
      }),
    );
  });

  it("allows deleting an inactive configuration and protects active configuration", async () => {
    renderPage();
    await screen.findByText("Cloudflare Whisper");
    await screen.findByText("Google Gemini 3.5 Transcribe Live");

    const deleteButtons = screen.getAllByRole("button", { name: /^Delete$/i });
    // cfg-whisper is active (first config row delete button should be disabled)
    // Note: credentials table also has a delete button for cred-google-1
    const configDeleteButtons = screen.getAllByRole("button", {
      name: /Delete configuration/i,
    });
    expect(configDeleteButtons.length).toBe(2);

    // Active configuration delete button must be disabled
    expect(configDeleteButtons[0]).toBeDisabled();
    expect(configDeleteButtons[0]).toHaveAttribute(
      "title",
      "Cannot delete active configuration. Activate another one first.",
    );

    // Inactive configuration delete button must be enabled
    expect(configDeleteButtons[1]).not.toBeDisabled();
    fireEvent.click(configDeleteButtons[1]!);

    // Confirmation dialog should open
    expect(
      await screen.findByRole("heading", { name: "Delete configuration" }),
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Google Gemini 3.5 Transcribe Live/i)).toBeInTheDocument();

    apiMocks.deleteProviderConfig.mockResolvedValue({
      id: "cfg-google-inactive",
      displayName: "Google Gemini 3.5 Transcribe Live",
    });

    const confirmDeleteBtn = within(dialog).getByRole("button", { name: "Delete configuration" });
    await act(async () => {
      fireEvent.click(confirmDeleteBtn);
    });

    expect(apiMocks.deleteProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      "cfg-google-inactive",
    );
  });
});
