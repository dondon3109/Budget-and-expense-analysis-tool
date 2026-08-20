import { extractVoiceTransaction } from "./ai-entry";

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
    expect(mockDelete).toHaveBeenCalledTimes(1);
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
});
