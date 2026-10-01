import {
  extractVoiceTransaction,
  extractVoiceTransactionFromTranscript,
  extractVoiceTransactionsFromTranscript,
} from "./ai-entry";
import { ApiTransportError } from "./authenticated";

const mockDelete = jest.fn();

jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.example.test" },
}));

jest.mock("expo-file-system", () => ({
  File: class MockExpoFile extends Blob {
    constructor(uri: string) {
      super([uri], { type: "audio/mp4" });
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

describe("mobile AI-entry voice transport", () => {
  beforeEach(() => mockDelete.mockClear());

  it("uploads one temporary recording and validates the editable draft", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        transcript: "Spent 250 pesos on lunch today",
        description: "Lunch",
        date: "2026-08-20",
        amountMinor: 25_000,
        currency: "PHP",
        kind: "expense",
        categoryName: "Food",
      }),
    );
    const draft = await extractVoiceTransaction(
      "token",
      { uri: "file:///recording.m4a", fileName: "voice-entry.m4a" },
      fetchMock,
    );
    expect(draft.description).toBe("Lunch");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/api/app/entry/voice")).toBe(true);
    expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
    expect((init.body as FormData).get("audio")).toBeInstanceOf(Blob);
    expect((init.body as FormData).get("lang")).toBe("auto");
    expect(mockDelete).toHaveBeenCalledTimes(1);

    const fetchMockLang = jest.fn(async () =>
      jsonResponse({
        transcript: "Gumastos ng 250",
        description: "Tanghalian",
        date: "2026-08-20",
        amountMinor: 25_000,
        currency: "PHP",
        kind: "expense",
      }),
    );
    await extractVoiceTransaction(
      "token",
      { uri: "file:///recording.m4a", fileName: "voice-entry.m4a" },
      fetchMockLang,
      { language: "fil" },
    );
    const [, initLang] = fetchMockLang.mock.calls[0] as unknown as [string, RequestInit];
    expect((initLang.body as FormData).get("lang")).toBe("fil");
  });

  it("discards a recording after the Worker rejects it", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: "entry_voice_unavailable", message: "Try again." }, 503),
    );

    await expect(
      extractVoiceTransaction(
        "token",
        { uri: "file:///recording.m4a", fileName: "voice-entry.m4a" },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "unavailable" });

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("submits transcript directly without uploading a file", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        transcript: "Spent 250 pesos on lunch today",
        description: "Lunch",
        date: "2026-08-20",
        amountMinor: 25_000,
        currency: "PHP",
        kind: "expense",
        categoryName: "Food",
      }),
    );
    const draft = await extractVoiceTransactionFromTranscript(
      "token",
      "Spent 250 pesos on lunch today",
      fetchMock,
    );
    expect(draft.description).toBe("Lunch");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/api/app/entry/voice")).toBe(true);
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      transcript: "Spent 250 pesos on lunch today",
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("submits categories in the json body when provided", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        transcript: "Spent 250 pesos on lunch today",
        description: "Lunch",
        date: "2026-08-20",
        amountMinor: 25_000,
        currency: "PHP",
        kind: "expense",
        categoryName: "Food & dining",
      }),
    );
    await extractVoiceTransactionFromTranscript(
      "token",
      "Spent 250 pesos on lunch today",
      fetchMock,
      ["Food & dining", "Transport"],
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // A direct transcript is not transcribed again, so it carries no language.
    expect(JSON.parse(init.body as string)).toEqual({
      transcript: "Spent 250 pesos on lunch today",
      categories: ["Food & dining", "Transport"],
    });
  });
});

describe("mobile AI-entry multi-entry transport", () => {
  const draft = (description: string, amountMinor: number) => ({
    transcript: "Spent 250 on lunch and 2,000 on groceries",
    description,
    date: "2026-10-01",
    amountMinor,
    currency: "PHP",
    kind: "expense",
  });

  it("posts the transcript with categories and validates every draft", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ drafts: [draft("Lunch", 25_000), draft("Groceries", 200_000)] }),
    );
    const drafts = await extractVoiceTransactionsFromTranscript(
      "token",
      "Spent 250 on lunch and 2,000 on groceries",
      fetchMock,
      ["Groceries"],
    );
    expect(drafts.map((item) => item.amountMinor)).toEqual([25_000, 200_000]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/app/entry/voice/entries");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
    expect(JSON.parse(init.body as string)).toEqual({
      transcript: "Spent 250 on lunch and 2,000 on groceries",
      categories: ["Groceries"],
    });
  });

  it("rejects a response that carries a transfer or no drafts", async () => {
    await expect(
      extractVoiceTransactionsFromTranscript(
        "token",
        "x",
        jest.fn(async () => jsonResponse({ drafts: [] })),
      ),
    ).rejects.toThrow();
    await expect(
      extractVoiceTransactionsFromTranscript(
        "token",
        "x",
        jest.fn(async () =>
          jsonResponse({ drafts: [{ ...draft("Move", 5_000), kind: "transfer" }] }),
        ),
      ),
    ).rejects.toThrow();
  });

  it("keeps the server error code so the widget can explain consent", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: "entry_consent_required", message: "Accept the notice." }, 409),
    );
    await expect(
      extractVoiceTransactionsFromTranscript("token", "x", fetchMock),
    ).rejects.toMatchObject({
      name: ApiTransportError.name,
      serverCode: "entry_consent_required",
    });
  });
});
