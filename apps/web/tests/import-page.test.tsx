// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { ImportPreview } from "@budget/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { commitImport, getCategories, previewImport } from "../src/lib/api";
import type { WorkbookConversion } from "../src/lib/workbookParser";
import { ImportPage } from "../src/pages/ImportPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";

const workbook = vi.hoisted(() => ({
  inspect: vi.fn<(buffer: ArrayBuffer) => Promise<string[]>>(),
  convert: vi.fn<(worksheetName: string) => Promise<WorkbookConversion>>(),
  dispose: vi.fn<() => void>(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "test-user", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/lib/api", () => ({
  commitImport: vi.fn(),
  getCategories: vi.fn(),
  previewImport: vi.fn(),
}));

vi.mock("../src/lib/workbookImportClient", () => ({
  WorkbookImportClient: class {
    private disposed = false;

    async inspect(buffer: ArrayBuffer) {
      if (this.disposed) throw new Error("Choose the workbook again and retry.");
      const result = await workbook.inspect(buffer);
      if (this.disposed) throw new Error("The workbook import was cancelled.");
      return result;
    }

    async convert(worksheetName: string) {
      if (this.disposed) throw new Error("Choose the workbook again and retry.");
      const result = await workbook.convert(worksheetName);
      if (this.disposed) throw new Error("The workbook import was cancelled.");
      return result;
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      workbook.dispose();
    }
  },
}));

const preview: ImportPreview = {
  token: "preview-token",
  expiresAt: "2026-07-21T12:15:00.000Z",
  fileName: "transactions.csv",
  rowCount: 1,
  acceptedCount: 1,
  rejectedCount: 0,
  duplicateCount: 0,
  rows: [
    {
      rowNumber: 2,
      status: "ready",
      date: "2026-07-20",
      description: "Market",
      amountMinor: -5000,
      kind: "expense",
      categoryId: "food",
      categoryName: "Food & dining",
      categoryIsUncategorized: false,
      errors: [],
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ImportPage />
        </QueryClientProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

function fileWithBuffer(name: string, content: string, type: string): File {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => new TextEncoder().encode(content).buffer),
  });
  return file;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("File input was not rendered.");
  return input;
}

afterEach(cleanup);

describe("ImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCategories).mockResolvedValue([
      {
        id: "food",
        name: "Food & dining",
        kind: "expense",
        color: "#dc8b3f",
        archived: false,
        system: false,
      },
      {
        id: "uncategorized-expense",
        name: "Uncategorized",
        kind: "expense",
        color: "#6b7280",
        archived: false,
        system: true,
      },
    ]);
    vi.mocked(previewImport).mockResolvedValue(preview);
    vi.mocked(commitImport).mockResolvedValue({
      importId: "import-1",
      importedCount: 1,
      rejectedCount: 0,
    });
  });

  it("keeps CSV imports on the existing mapping and preview path", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = ["Date,Description,Amount,Category", "2026-07-20,Market,-50.00,Food & dining"].join(
      "\n",
    );

    await user.upload(fileInput(container), fileWithBuffer("transactions.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    expect(workbook.inspect).not.toHaveBeenCalled();
    expect(previewImport).toHaveBeenCalledWith(
      { key: "user:test-user", userId: "test-user" },
      {
        fileName: "transactions.csv",
        csvText: csv,
        headerRowNumber: 1,
        mapping: {
          date: "Date",
          description: "Description",
          amount: "Amount",
          category: "Category",
          kind: undefined,
          currency: undefined,
        },
      },
    );
  });

  it("uses one entered date and Uncategorized when Date and Category are absent", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = "Description,Amount\nMarket,-50.00";

    await user.upload(fileInput(container), fileWithBuffer("transactions.csv", csv, "text/csv"));
    const fallbackDate = screen.getByLabelText("Date for every row");
    await user.clear(fallbackDate);
    await user.type(fallbackDate, "2026-07-15");
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    const request = vi.mocked(previewImport).mock.calls[0]?.[1];
    expect(request).toMatchObject({
      fileName: "transactions.csv",
      csvText: csv,
      fallbackDate: "2026-07-15",
      mapping: { description: "Description", amount: "Amount" },
    });
    expect(request?.mapping.date).toBeUndefined();
    expect(request?.mapping.category).toBeUndefined();
  });

  it("requires a worksheet choice and previews only the selected worksheet", async () => {
    const user = userEvent.setup();
    workbook.inspect.mockResolvedValue(["Instructions", "Transactions"]);
    workbook.convert.mockResolvedValue({
      csvText: "Date,Description,Amount,Category\n2026-07-20,Market,-50.00,Food & dining",
      rowCount: 1,
      warnings: [
        "Formula cells use their last saved results and are not recalculated during import.",
      ],
    });
    const { container } = renderPage();
    const excel = fileWithBuffer(
      "bank-export.xlsx",
      "workbook bytes",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    await user.upload(fileInput(container), excel);
    const worksheet = await screen.findByLabelText("Worksheet");
    expect(workbook.convert).not.toHaveBeenCalled();

    await user.selectOptions(worksheet, "Transactions");
    expect(await screen.findByText(/Worksheet: Transactions · 1 data row/)).toBeInTheDocument();
    expect(screen.getByText(/Formula cells use their last saved results/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    expect(workbook.convert).toHaveBeenCalledWith("Transactions");
    const request = vi.mocked(previewImport).mock.calls[0]?.[1];
    expect(request?.fileName).toBe("bank-export.xlsx");
    expect(request?.csvText).toContain("2026-07-20,Market");
  });

  it("offers one date for a converted worksheet without Date or Category columns", async () => {
    const user = userEvent.setup();
    workbook.inspect.mockResolvedValue(["Transactions"]);
    workbook.convert.mockResolvedValue({
      csvText: "Description,Amount\nMarket,-50.00",
      rowCount: 1,
      warnings: [],
    });
    const { container } = renderPage();

    await user.upload(
      fileInput(container),
      fileWithBuffer(
        "bank.xlsx",
        "workbook bytes",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    );
    const fallbackDate = await screen.findByLabelText("Date for every row");
    await user.clear(fallbackDate);
    await user.type(fallbackDate, "2026-07-16");
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    expect(vi.mocked(previewImport).mock.calls[0]?.[1]).toMatchObject({
      fileName: "bank.xlsx",
      fallbackDate: "2026-07-16",
      mapping: { description: "Description", amount: "Amount" },
    });
  });

  it("automatically converts a single-sheet workbook and disposes it on unmount", async () => {
    const user = userEvent.setup();
    workbook.inspect.mockResolvedValue(["Transactions"]);
    workbook.convert.mockResolvedValue({
      csvText: "Date,Description,Amount,Category\n2026-07-20,Market,-50.00,Food & dining",
      rowCount: 1,
      warnings: [],
    });
    const { container, unmount } = renderPage();

    await user.upload(
      fileInput(container),
      fileWithBuffer("bank.xls", "workbook bytes", "application/vnd.ms-excel"),
    );

    expect(await screen.findByText(/Worksheet: Transactions · 1 data row/)).toBeInTheDocument();
    expect(workbook.convert).toHaveBeenCalledWith("Transactions");
    expect(workbook.dispose).not.toHaveBeenCalled();
    unmount();
    expect(workbook.dispose).toHaveBeenCalledOnce();
  });

  it("imports a dropped CSV through the same preview path", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = "Date,Description,Amount\n2026-07-20,Market,-50.00";
    const input = fileInput(container);
    const dropzone = input.closest("label")!;
    const file = fileWithBuffer("dropped.csv", csv, "text/csv");

    fireEvent.dragEnter(dropzone, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(dropzone).toHaveClass("drag-active");
    expect(screen.getByText("Drop one file to import")).toBeInTheDocument();
    fireEvent.dragLeave(dropzone, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(dropzone).not.toHaveClass("drag-active");
    fireEvent.dragEnter(dropzone, { dataTransfer: { files: [file], types: ["Files"] } });

    fireEvent.drop(dropzone, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(dropzone).not.toHaveClass("drag-active");
    expect(await screen.findByText("dropped.csv")).toBeInTheDocument();
    const previewButton = screen.getByRole("button", { name: "Preview import" });
    await waitFor(() => expect(previewButton).toBeEnabled());
    await user.click(previewButton);

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    expect(vi.mocked(previewImport).mock.calls[0]?.[1]).toMatchObject({
      fileName: "dropped.csv",
      csvText: csv,
      mapping: { date: "Date", description: "Description", amount: "Amount" },
    });
  });

  it("imports a dropped workbook through the existing worker path", async () => {
    workbook.inspect.mockResolvedValue(["Transactions"]);
    workbook.convert.mockResolvedValue({
      csvText: "Date,Description,Amount\n2026-07-20,Market,-50.00",
      rowCount: 1,
      warnings: [],
    });
    const { container } = renderPage();
    const input = fileInput(container);
    const dropzone = input.closest("label")!;
    const file = fileWithBuffer(
      "dropped.xlsx",
      "workbook bytes",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    fireEvent.drop(dropzone, { dataTransfer: { files: [file], types: ["Files"] } });

    expect(await screen.findByText(/Worksheet: Transactions · 1 data row/)).toBeInTheDocument();
    expect(workbook.inspect).toHaveBeenCalledOnce();
    expect(workbook.convert).toHaveBeenCalledWith("Transactions");
  });

  it("rejects multiple dropped files and keeps the native picker accessible", async () => {
    const { container } = renderPage();
    const input = screen.getByLabelText("Choose transaction file");
    expect(input).toHaveAttribute("accept", expect.stringContaining(".xlsx"));
    const dropzone = fileInput(container).closest("label")!;
    const first = fileWithBuffer("first.csv", "Date,Description,Amount", "text/csv");
    const second = fileWithBuffer("second.csv", "Date,Description,Amount", "text/csv");

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [first, second], types: ["Files"] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Drop one CSV, XLSX, or XLS file at a time.",
    );
    expect(previewImport).not.toHaveBeenCalled();
    expect(workbook.inspect).not.toHaveBeenCalled();
  });

  it("disposes a pending workbook when a replacement file is selected", async () => {
    const user = userEvent.setup();
    let resolveInspect!: (sheets: string[]) => void;
    workbook.inspect.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveInspect = resolve;
        }),
    );
    const { container } = renderPage();
    const input = fileInput(container);

    await user.upload(
      input,
      fileWithBuffer(
        "pending.xlsx",
        "workbook bytes",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    );
    expect(await screen.findByText("Reading workbook…")).toBeInTheDocument();

    await user.upload(
      input,
      fileWithBuffer(
        "replacement.csv",
        "Date,Description,Amount\n2026-07-20,Market,-50.00",
        "text/csv",
      ),
    );
    expect(workbook.dispose).toHaveBeenCalledOnce();
    await screen.findByText("replacement.csv");
    await act(async () => resolveInspect(["Old worksheet"]));
    expect(screen.queryByLabelText("Worksheet")).not.toBeInTheDocument();
  });

  it("detects an introductory BPI header and maps Debit and Credit", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = [
      "BPI Statement of Account",
      "Account,1234",
      "Transaction Date,Description,Debit,Credit",
      "7/20/2026,Market,50.00,",
    ].join("\n");

    await user.upload(fileInput(container), fileWithBuffer("bpi-export.csv", csv, "text/csv"));

    expect(await screen.findByLabelText("Header row")).toHaveValue("3");
    expect(screen.getByLabelText("Amount format")).toHaveValue("debit-credit");
    expect(screen.getByText("Ignoring 2 introductory rows")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preview import" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    expect(vi.mocked(previewImport).mock.calls[0]?.[1]).toMatchObject({
      headerRowNumber: 3,
      mapping: {
        date: "Transaction Date",
        description: "Description",
        debit: "Debit",
        credit: "Credit",
      },
    });
  });

  it("requires explicit PHP confirmation for a Chase export without a PHP currency column", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const csv = "Posting Date,Description,Amount\n7/20/2026,Market,-50.00";

    await user.upload(fileInput(container), fileWithBuffer("Chase1234.csv", csv, "text/csv"));

    expect(screen.getByText("PHP-only import")).toBeInTheDocument();
    const previewButton = screen.getByRole("button", { name: "Preview import" });
    expect(previewButton).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Store these numeric values as PHP without currency conversion",
      }),
    );
    expect(previewButton).toBeEnabled();
  });

  it("ignores a preview response after the file changes", async () => {
    const user = userEvent.setup();
    let resolvePreview!: (value: ImportPreview) => void;
    vi.mocked(previewImport).mockImplementationOnce(
      () =>
        new Promise<ImportPreview>((resolve) => {
          resolvePreview = resolve;
        }),
    );
    const { container } = renderPage();
    const firstCsv = "Date,Description,Amount\n2026-07-20,First,-50.00";
    const secondCsv = "Date,Description,Amount\n2026-07-21,Second,-25.00";

    await user.upload(fileInput(container), fileWithBuffer("first.csv", firstCsv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await waitFor(() => expect(previewImport).toHaveBeenCalledOnce());
    await user.upload(fileInput(container), fileWithBuffer("second.csv", secondCsv, "text/csv"));
    await screen.findByText("second.csv");
    await act(async () => resolvePreview(preview));

    await waitFor(() =>
      expect(screen.getByText("Your row-by-row preview will appear here.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Import 1 ready rows" })).not.toBeInTheDocument();
  });

  it("selects Uncategorized rows across preview pages and commits category overrides", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 101 }, (_, index) => ({
      rowNumber: index + 2,
      status: "ready" as const,
      date: "2026-07-20",
      description: `Transaction ${index + 1}`,
      amountMinor: -100,
      kind: "expense" as const,
      categoryId: "uncategorized-expense",
      categoryName: "Uncategorized",
      categoryIsUncategorized: true,
      errors: [],
    }));
    vi.mocked(previewImport).mockResolvedValueOnce({
      ...preview,
      rowCount: rows.length,
      acceptedCount: rows.length,
      rows,
    });
    const { container } = renderPage();
    const csv = "Date,Description,Amount\n2026-07-20,Market,-50.00";

    await user.upload(fileInput(container), fileWithBuffer("transactions.csv", csv, "text/csv"));
    await user.click(screen.getByRole("button", { name: "Preview import" }));
    await screen.findByText("Categorize Uncategorized rows");
    await user.click(screen.getByRole("button", { name: "Select all 101" }));
    await user.selectOptions(screen.getByLabelText("New category"), "food");
    await user.click(screen.getByRole("button", { name: "Apply to 101 selected" }));

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Transaction 101")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import 101 ready rows" }));

    await waitFor(() => expect(commitImport).toHaveBeenCalledOnce());
    const request = vi.mocked(commitImport).mock.calls[0]?.[1];
    expect(request?.token).toBe("preview-token");
    expect(request?.categoryOverrides).toHaveLength(101);
    expect(request?.categoryOverrides[0]).toEqual({ rowNumber: 2, categoryId: "food" });
  });
});
