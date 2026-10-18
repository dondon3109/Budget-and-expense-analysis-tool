// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { FamilyEntryView } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock([
    "getFamily",
    "getFamilyComments",
    "addFamilyComment",
    "getFamilyEntryHistory",
    "getFamilyDeletedEntries",
    "restoreFamilyEntry",
    "getFamilyReceipt",
    "uploadFamilyReceipt",
    "removeFamilyReceipt",
  ]),
);

import { FamilyThreadDialog } from "../src/components/family/FamilyThreadDialog";
import { RecentlyDeletedEntries } from "../src/components/family/RecentlyDeletedEntries";
import {
  addFamilyComment,
  getFamily,
  getFamilyComments,
  getFamilyDeletedEntries,
  getFamilyEntryHistory,
  getFamilyReceipt,
  removeFamilyReceipt,
  restoreFamilyEntry,
  uploadFamilyReceipt,
} from "../src/lib/api";
import { familyWorkspace } from "../src/lib/workspace";
import { renderWithProviders } from "./helpers/render";

afterEach(cleanup);

const RICE: FamilyEntryView = {
  date: "2026-10-17",
  description: "Rice",
  amountMinor: -120_000,
  currency: "PHP",
  kind: "expense",
  categoryName: "Food",
  accountName: "Cash",
  notes: null,
};

function familyAs(userId: string, role: "owner" | "member") {
  vi.mocked(getFamily).mockResolvedValue({
    role,
    closesAt: null,
    members: [{ userId: "kuya", email: "kuya@example.com" }],
  } as never);
  vi.mocked(getFamilyReceipt).mockResolvedValue(null);
  return familyWorkspace({ id: userId } as never, "family:santos");
}

describe("family entry thread", () => {
  it("names who changed an entry and only the fields that changed", async () => {
    const family = familyAs("mama", "owner");
    vi.mocked(getFamilyComments).mockResolvedValue([]);
    vi.mocked(getFamilyEntryHistory).mockResolvedValue([
      {
        action: "updated",
        userId: "kuya",
        at: "2026-10-17T10:00:00.000Z",
        before: RICE,
        after: { ...RICE, amountMinor: -150_000 },
      },
    ]);

    renderWithProviders(
      <FamilyThreadDialog
        family={family}
        subject={{ kind: "transaction", subjectId: "rice" }}
        title="Rice"
        onClose={() => undefined}
      />,
    );

    expect(await screen.findByText(/kuya@example.com changed it/u)).toBeInTheDocument();
    expect(screen.getByText("Amount: ₱1,200 → ₱1,500")).toBeInTheDocument();
    expect(screen.queryByText(/^Category:/u)).not.toBeInTheDocument();
  });

  it("posts a comment on the entry", async () => {
    const family = familyAs("mama", "owner");
    vi.mocked(getFamilyEntryHistory).mockResolvedValue([]);
    vi.mocked(getFamilyComments).mockResolvedValue([]);
    vi.mocked(addFamilyComment).mockResolvedValue({} as never);
    const subject = { kind: "transaction", subjectId: "rice" } as const;

    renderWithProviders(
      <FamilyThreadDialog
        family={family}
        subject={subject}
        title="Rice"
        onClose={() => undefined}
      />,
    );
    fireEvent.change(await screen.findByPlaceholderText("Add a comment"), {
      target: { value: "  Which store?  " },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Post" }));

    await vi.waitFor(() =>
      expect(addFamilyComment).toHaveBeenCalledWith(family, subject, "Which store?"),
    );
  });

  it("offers a member Restore only for what they deleted", async () => {
    const family = familyAs("kuya", "member");
    const deleted = (transactionId: string, deletedByUserId: string) => ({
      transactionId,
      entry: { ...RICE, description: transactionId },
      deletedByUserId,
      deletedAt: "2026-10-17T10:00:00.000Z",
      restoreUntil: "2026-11-16T10:00:00.000Z",
    });
    vi.mocked(getFamilyDeletedEntries).mockResolvedValue([
      deleted("Mine", "kuya"),
      deleted("Mama's", "mama"),
    ]);
    vi.mocked(restoreFamilyEntry).mockResolvedValue(undefined);

    renderWithProviders(<RecentlyDeletedEntries family={family} />);
    await screen.findByText(/Mama's/u);
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[0]!);

    expect(restoreButtons).toHaveLength(1);
    await vi.waitFor(() => expect(restoreFamilyEntry).toHaveBeenCalledWith(family, "Mine"));
  });

  it("lets a member change the photo only on their own entry", async () => {
    const family = familyAs("kuya", "member");
    vi.mocked(getFamilyEntryHistory).mockResolvedValue([]);
    vi.mocked(getFamilyComments).mockResolvedValue([]);
    vi.mocked(getFamilyReceipt).mockResolvedValue(new Blob(["photo"], { type: "image/png" }));
    vi.mocked(uploadFamilyReceipt).mockResolvedValue(undefined);
    vi.mocked(removeFamilyReceipt).mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => "blob:receipt");
    URL.revokeObjectURL = vi.fn();
    const thread = (authorUserId: string) => (
      <FamilyThreadDialog
        family={family}
        subject={{ kind: "transaction", subjectId: "rice" }}
        title="Rice"
        authorUserId={authorUserId}
        onClose={() => undefined}
      />
    );

    const mamas = renderWithProviders(thread("mama"));
    expect(await screen.findByAltText("Receipt photo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Replace photo/u })).not.toBeInTheDocument();
    mamas.unmount();

    renderWithProviders(thread("kuya"));
    await screen.findByRole("button", { name: /Replace photo/u });
    const photo = new File(["new"], "receipt.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose receipt photo"), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole("button", { name: /Remove/u }));

    await vi.waitFor(() => expect(uploadFamilyReceipt).toHaveBeenCalledWith(family, "rice", photo));
    await vi.waitFor(() => expect(removeFamilyReceipt).toHaveBeenCalledWith(family, "rice"));
  });
});
