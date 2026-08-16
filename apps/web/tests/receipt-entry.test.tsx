// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { CategoryRecord } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptEntry, type ReceiptEntryDraft } from "../src/components/receipts/ReceiptEntry";

const apiMocks = vi.hoisted(() => ({
  getReceiptPreferences: vi.fn(),
  grantReceiptConsent: vi.fn(),
  extractReceipt: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

const workspace = { key: "user:test-user" as const, userId: "test-user" };

const categories: CategoryRecord[] = [
  {
    id: "food",
    name: "Food & dining",
    kind: "expense",
    color: "#dc8b3f",
    archived: false,
    system: false,
    origin: "custom",
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "uncategorized-expense",
    name: "Uncategorized",
    kind: "expense",
    color: "#999999",
    archived: false,
    system: true,
    origin: "system",
    requiredPlan: "free",
    locked: false,
  },
  {
    id: "uncategorized-income",
    name: "Uncategorized",
    kind: "income",
    color: "#999999",
    archived: false,
    system: true,
    origin: "system",
    requiredPlan: "free",
    locked: false,
  },
];

const consentedPreferences = {
  enabled: true,
  consentedAt: "2026-08-13T00:00:00.000Z",
  consentVersion: 1,
  visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
};

function renderEntry(onContinue: (draft: ReceiptEntryDraft) => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceiptEntry workspace={workspace} categories={categories} onContinue={onContinue} />
    </QueryClientProvider>,
  );
}

async function choosePhoto(name = "receipt.jpg") {
  const input = await screen.findByLabelText("Choose receipt photo");
  fireEvent.change(input, {
    target: { files: [new File(["photo"], name, { type: "image/jpeg" })] },
  });
}

beforeEach(() => {
  apiMocks.getReceiptPreferences.mockResolvedValue({
    ...consentedPreferences,
    consentedAt: null,
    consentVersion: 0,
  });
  apiMocks.grantReceiptConsent.mockResolvedValue(consentedPreferences);
  apiMocks.extractReceipt.mockResolvedValue({
    merchant: "Jollibee",
    date: "2026-08-13",
    amountMinor: -28500,
    currency: "PHP",
    kind: "expense",
    categoryName: "Food & dining",
    rawText: "JOLLIBEE TOTAL 285.00",
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:receipt-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReceiptEntry", () => {
  it("shows the one-time consent notice before any capture UI", async () => {
    renderEntry();

    expect(await screen.findByText("Snap a receipt. You approve every field.")).toBeInTheDocument();
    expect(screen.getByText("Photos are never stored")).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose receipt photo")).not.toBeInTheDocument();
    expect(apiMocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("enables capture after the user accepts the notice", async () => {
    renderEntry();

    fireEvent.click(
      await screen.findByRole("button", { name: "Accept and enable receipt scanning" }),
    );

    expect(await screen.findByLabelText("Choose receipt photo")).toBeInTheDocument();
    expect(apiMocks.grantReceiptConsent).toHaveBeenCalledOnce();
  });

  it("reads a photo into an editable draft and continues with the corrected fields", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
    const onContinue = vi.fn();
    renderEntry(onContinue);

    await choosePhoto();
    fireEvent.click(await screen.findByRole("button", { name: "Read receipt" }));

    await waitFor(() => expect(apiMocks.extractReceipt).toHaveBeenCalledOnce());
    expect(await screen.findByLabelText("Merchant")).toHaveValue("Jollibee");
    expect(screen.getByLabelText("Amount (₱)")).toHaveValue("285.00");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-08-13");
    expect(screen.getByLabelText("Category")).toHaveValue("food");

    fireEvent.change(screen.getByLabelText("Amount (₱)"), { target: { value: "300.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(onContinue).toHaveBeenCalledWith({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: 30000,
      kind: "expense",
      categoryId: "food",
      categoryName: "Food & dining",
    });
  });

  it("rejects an unparseable amount before continuing", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
    const onContinue = vi.fn();
    renderEntry(onContinue);

    await choosePhoto();
    fireEvent.click(await screen.findByRole("button", { name: "Read receipt" }));
    await waitFor(() => expect(apiMocks.extractReceipt).toHaveBeenCalledOnce());

    fireEvent.change(await screen.findByLabelText("Amount (₱)"), {
      target: { value: "not-money" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(
      screen.getByText("Enter a plain amount with up to two decimal places."),
    ).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("surfaces provider failures as an alert and offers no draft", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
    apiMocks.extractReceipt.mockRejectedValue(
      new Error("The receipt could not be read. Try a clearer photo."),
    );
    renderEntry();

    await choosePhoto();
    fireEvent.click(await screen.findByRole("button", { name: "Read receipt" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The receipt could not be read.");
    expect(screen.queryByRole("button", { name: "Continue to preview" })).not.toBeInTheDocument();
  });
});
