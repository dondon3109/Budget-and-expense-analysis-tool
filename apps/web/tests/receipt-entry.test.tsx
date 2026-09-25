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
  consentVersion: 2,
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

    expect(
      await screen.findByText("Use AI to draft. You approve every field."),
    ).toBeInTheDocument();
    expect(screen.getByText("Source files are never stored")).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose receipt photo")).not.toBeInTheDocument();
    expect(apiMocks.extractReceipt).not.toHaveBeenCalled();
  });

  it("enables capture after the user accepts the notice", async () => {
    renderEntry();

    fireEvent.click(await screen.findByRole("button", { name: "Accept and enable AI entry" }));

    expect(await screen.findByLabelText("Choose receipt photo")).toBeInTheDocument();
    expect(apiMocks.grantReceiptConsent).toHaveBeenCalledOnce();
  });

  it("tells the user each photo reads one receipt until they dismiss the notice", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
    renderEntry();

    expect(await screen.findByText("One receipt per photo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss one receipt per photo notice" }));
    expect(screen.queryByText("One receipt per photo.")).not.toBeInTheDocument();
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
      date: "2026-08-13",
      kind: "expense",
      lines: [{ description: "Jollibee", amountMinor: 30000, categoryName: "Food & dining" }],
    });
  });

  it("turns each receipt line into its own preview row once the items match the total", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
    apiMocks.extractReceipt.mockResolvedValue({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: -28500,
      currency: "PHP",
      kind: "expense",
      categoryName: "Groceries",
      items: [
        { description: "Chickenjoy", amountMinor: 18500, categoryName: "Food & dining" },
        { description: "Peach mango pie", amountMinor: 9000 },
      ],
      rawText: "JOLLIBEE TOTAL 285.00",
    });
    const onContinue = vi.fn();
    renderEntry(onContinue);

    await choosePhoto();
    fireEvent.click(await screen.findByRole("button", { name: "Read receipt" }));

    expect(await screen.findByLabelText("Item 1 description")).toHaveValue("Chickenjoy");
    expect(screen.getByLabelText("Item 2 amount (₱)")).toHaveValue("90.00");

    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The items add to");
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Item 2 amount (₱)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(onContinue).toHaveBeenCalledWith({
      date: "2026-08-13",
      kind: "expense",
      lines: [
        { description: "Jollibee · Chickenjoy", amountMinor: 18500, categoryName: "Food & dining" },
        {
          description: "Jollibee · Peach mango pie",
          amountMinor: 10000,
          categoryName: "Uncategorized",
        },
      ],
    });
  });

  it("keeps a transfer receipt as one signed total instead of itemizing it", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
    apiMocks.extractReceipt.mockResolvedValue({
      merchant: "GCash",
      date: "2026-08-13",
      amountMinor: -50000,
      currency: "PHP",
      kind: "expense",
      items: [{ description: "Send money", amountMinor: 40000 }],
      rawText: "",
    });
    const transferCategory: CategoryRecord = {
      id: "transfer",
      name: "Transfer",
      kind: "transfer",
      color: "#999999",
      archived: false,
      system: true,
      origin: "system",
      requiredPlan: "free",
      locked: false,
    };
    const onContinue = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ReceiptEntry
          workspace={workspace}
          categories={[...categories, transferCategory]}
          onContinue={onContinue}
        />
      </QueryClientProvider>,
    );

    await choosePhoto();
    fireEvent.click(await screen.findByRole("button", { name: "Read receipt" }));
    fireEvent.change(await screen.findByLabelText("Type"), { target: { value: "transfer" } });
    fireEvent.change(screen.getByLabelText("Amount (₱)"), { target: { value: "-500.00" } });
    expect(screen.queryByLabelText("Item 1 description")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "transfer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(onContinue).toHaveBeenCalledWith({
      date: "2026-08-13",
      kind: "transfer",
      lines: [{ description: "GCash", amountMinor: -50000, categoryName: "Transfer" }],
    });
  });

  it("can collapse unreconciled items into one receipt total", async () => {
    apiMocks.getReceiptPreferences.mockResolvedValue(consentedPreferences);
    apiMocks.extractReceipt.mockResolvedValue({
      merchant: "Market",
      date: "2026-08-13",
      amountMinor: -24500,
      currency: "PHP",
      kind: "expense",
      items: [{ description: "Vegetables", amountMinor: 12000 }],
      rawText: "",
    });
    const onContinue = vi.fn();
    renderEntry(onContinue);

    await choosePhoto();
    fireEvent.click(await screen.findByRole("button", { name: "Read receipt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as one total" }));
    expect(screen.queryByLabelText("Item 1 description")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue to preview" }));

    expect(onContinue).toHaveBeenCalledWith({
      date: "2026-08-13",
      kind: "expense",
      lines: [{ description: "Market", amountMinor: 24500, categoryName: "Uncategorized" }],
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
