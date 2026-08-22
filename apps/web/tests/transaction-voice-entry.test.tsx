// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TransactionVoiceEntry,
  type TransactionVoiceEntryProps,
} from "../src/components/transactions/TransactionVoiceEntry";

const apiMocks = vi.hoisted(() => ({
  getReceiptPreferences: vi.fn(),
  grantReceiptConsent: vi.fn(),
  extractVoiceTransaction: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

const workspace = { key: "user:test-user" as const, userId: "test-user" };

const consentedPreferences = {
  enabled: true,
  consentedAt: "2026-08-13T00:00:00.000Z",
  consentVersion: 2,
  visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
};

const draft = {
  transcript: "Spent 250 pesos on lunch today",
  description: "Lunch",
  date: "2026-08-22",
  amountMinor: 25_000,
  currency: "PHP" as const,
  kind: "expense" as const,
  categoryName: "Food & dining",
};

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() {
    return true;
  }
  state = "inactive";
  mimeType = "audio/webm";
  onData?: (event: { data: Blob }) => void;
  onStop?: () => void;
  constructor(public stream: unknown) {
    FakeMediaRecorder.instances.push(this);
  }
  addEventListener(event: string, listener: () => void) {
    if (event === "dataavailable") this.onData = listener;
    if (event === "stop") this.onStop = listener;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onData?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onStop?.();
  }
}

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] };
}

function renderEntry(props: Partial<TransactionVoiceEntryProps> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionVoiceEntry workspace={workspace} onDraft={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
  apiMocks.grantReceiptConsent.mockResolvedValue(consentedPreferences);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("TransactionVoiceEntry", () => {
  it("asks for one-time AI entry consent before recording", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue({
      ...consentedPreferences,
      consentedAt: null,
      consentVersion: 0,
    });
    const onDraft = vi.fn();
    const user = userEvent.setup();
    renderEntry({ onDraft });

    await user.click(await screen.findByRole("button", { name: /Enable AI voice entry/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Enable AI-assisted entry?");
    expect(screen.getByText(/Nothing saves until you review/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept and enable" }));

    await waitFor(() => expect(apiMocks.grantReceiptConsent).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop and review" })).toBeEnabled(),
    );
    expect(apiMocks.extractVoiceTransaction).not.toHaveBeenCalled();
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("keeps consent closed and records nothing when dismissed", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue({
      ...consentedPreferences,
      consentedAt: null,
      consentVersion: 0,
    });
    const user = userEvent.setup();
    renderEntry();

    await user.click(await screen.findByRole("button", { name: /Enable AI voice entry/ }));
    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("fills the form draft after recording stops", async () => {
    apiMocks.extractVoiceTransaction.mockResolvedValue(draft);
    const onDraft = vi.fn();
    const user = userEvent.setup();
    renderEntry({ onDraft });

    await user.click(await screen.findByRole("button", { name: "Speak a transaction" }));
    expect(await screen.findByRole("button", { name: "Stop and review" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Stop and review" }));

    await waitFor(() => expect(apiMocks.extractVoiceTransaction).toHaveBeenCalledOnce());
    expect(onDraft).toHaveBeenCalledWith(draft);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Draft filled from: “Spent 250 pesos on lunch today”",
    );
  });

  it("surfaces extraction failures without calling onDraft", async () => {
    apiMocks.extractVoiceTransaction.mockRejectedValue(new Error("AI voice entry failed."));
    const onDraft = vi.fn();
    const user = userEvent.setup();
    renderEntry({ onDraft });

    await user.click(await screen.findByRole("button", { name: "Speak a transaction" }));
    await user.click(await screen.findByRole("button", { name: "Stop and review" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AI voice entry failed.");
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("offers a retry when the readiness check fails", async () => {
    apiMocks.getReceiptPreferences.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderEntry();

    await user.click(await screen.findByRole("button", { name: "Retry AI voice entry" }));

    expect(await screen.findByRole("button", { name: "Speak a transaction" })).toBeEnabled();
    expect(apiMocks.getReceiptPreferences).toHaveBeenCalledTimes(2);
  });

  it("does not record while disabled", async () => {
    const user = userEvent.setup();
    renderEntry({ disabled: true });

    const button = await screen.findByRole("button", { name: "Speak a transaction" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
