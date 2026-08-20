import { ImportTransportError, commitImport, previewImport, previewPdfImport } from "./imports";

const mockDelete = jest.fn();

jest.mock("expo-file-system", () => ({
  File: class MockExpoFile extends Blob {
    constructor(uri: string) {
      super([uri], { type: "application/pdf" });
    }

    delete() {
      mockDelete();
    }
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const validPreview = {
  token: "3f5f9d85-1d6e-4f6b-9f7d-1c2b3a4d5e6f",
  expiresAt: "2026-08-13T08:00:00.000Z",
  fileName: "history.csv",
  rowCount: 3,
  acceptedCount: 2,
  rejectedCount: 1,
  duplicateCount: 0,
  rows: [
    {
      rowNumber: 2,
      status: "ready",
      date: "2026-07-20",
      description: "Groceries",
      amountMinor: -125050,
      kind: "expense",
      errors: [],
    },
    {
      rowNumber: 3,
      status: "ready",
      date: "2026-07-21",
      description: "Salary",
      amountMinor: 800000,
      kind: "income",
      errors: [],
    },
    { rowNumber: 4, status: "invalid", errors: ["The date is invalid."] },
  ],
};

const previewInput = {
  fileName: "history.csv",
  csvText: "Date,Description,Amount\n2026-07-20,Groceries,-1250.50",
  headerRowNumber: 1,
  mapping: { date: "Date", description: "Description", amount: "Amount" },
};

describe("mobile import transport", () => {
  beforeEach(() => mockDelete.mockClear());

  it("previews and decodes the server response", async () => {
    const fetchMock = jest.fn(async () => jsonResponse(validPreview));
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const preview = await previewImport({
      accessToken: "token",
      input: previewInput,
      fetchImpl,
    });
    expect(preview.acceptedCount).toBe(2);
    expect(preview.rows[0]?.categoryId).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/api/app/imports/preview")).toBe(true);
    expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
  });

  it("rejects previews that do not match the contract", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ ...validPreview, token: "not-a-uuid" }),
    ) as unknown as typeof fetch;
    await expect(
      previewImport({ accessToken: "token", input: previewInput, fetchImpl }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("sends a PDF for the same server-side preview contract", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ ...validPreview, fileName: "statement.pdf" }),
    );
    const preview = await previewPdfImport({
      accessToken: "token",
      file: { uri: "file:///statement.pdf", fileName: "statement.pdf" },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(preview.fileName).toBe("statement.pdf");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/api/app/entry/pdf-preview")).toBe(true);
    expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
    expect((init.body as FormData).get("pdf")).toBeInstanceOf(Blob);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("tells the caller when PDF AI-entry consent is required", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse(
        { error: "entry_consent_required", message: "Accept the AI entry notice first." },
        409,
      ),
    ) as unknown as typeof fetch;
    await expect(
      previewPdfImport({
        accessToken: "token",
        file: { uri: "file:///statement.pdf", fileName: "statement.pdf" },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "entry_consent_required" });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("maps 401 responses to session expiry", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "invalid_token", message: "expired" }, 401),
    ) as unknown as typeof fetch;
    await expect(
      previewImport({ accessToken: "token", input: previewInput, fetchImpl }),
    ).rejects.toMatchObject({ code: "session_expired", status: 401 });
  });

  it("maps monthly limit rejections to plan limits", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "monthly_limit_reached", message: "Import quota reached." }, 402),
    ) as unknown as typeof fetch;
    await expect(
      previewImport({ accessToken: "token", input: previewInput, fetchImpl }),
    ).rejects.toMatchObject({ code: "plan_limit", message: "Import quota reached." });
  });

  it("maps network failures without tokens or rows in the error", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(
      previewImport({ accessToken: "token", input: previewInput, fetchImpl }),
    ).rejects.toMatchObject({ code: "network" });
  });

  it("commits overrides and decodes the result", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(
        { importId: "11111111-2222-4333-8444-555555555555", importedCount: 2, rejectedCount: 1 },
        201,
      ),
    );
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const result = await commitImport({
      accessToken: "token",
      input: {
        token: validPreview.token,
        categoryOverrides: [{ rowNumber: 2, categoryId: "cat-1" }],
        kindOverrides: [],
      },
      fetchImpl,
    });
    expect(result.importedCount).toBe(2);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url.endsWith("/api/app/imports/commit")).toBe(true);
  });

  it("surfaces expired previews on commit", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "preview_expired", message: "Preview again." }, 400),
    ) as unknown as typeof fetch;
    await expect(
      commitImport({
        accessToken: "token",
        input: { token: validPreview.token, categoryOverrides: [], kindOverrides: [] },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "preview_expired" });
  });

  it("maps rate limiting", async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: "rate_limited", message: "slow down" }, 429),
    ) as unknown as typeof fetch;
    await expect(
      commitImport({
        accessToken: "token",
        input: { token: validPreview.token, categoryOverrides: [], kindOverrides: [] },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("keeps ImportTransportError instances intact", () => {
    const error = new ImportTransportError("msg", "plan_limit", 402);
    expect(error).toBeInstanceOf(ImportTransportError);
    expect(error.name).toBe("ImportTransportError");
  });
});
