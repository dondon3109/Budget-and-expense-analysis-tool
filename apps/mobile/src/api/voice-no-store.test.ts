import { extractVoiceTransaction } from "./ai-entry";
import { transcribeVoice } from "./assistant-voice";

const mockDelete = jest.fn();

jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.example.test" },
}));

jest.mock("expo-file-system", () => ({
  File: class MockExpoFile extends Blob {
    readonly uri: string;

    constructor(uri: string) {
      super([new Uint8Array([1, 2, 3])], { type: "audio/mp4" });
      this.uri = uri;
    }

    delete() {
      mockDelete(this.uri);
    }
  },
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RECORDING = {
  uri: "file:///data/user/0/app/cache/recording-123.m4a",
  mimeType: "audio/mp4",
  fileName: "voice-input.m4a",
};

function requestHeaders(fetchMock: jest.Mock): Record<string, string> {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return init.headers as Record<string, string>;
}

describe("in-flight no-store audio path", () => {
  beforeEach(() => mockDelete.mockClear());

  it("transcribeVoice sends no-store headers when opted in", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ text: "hello", durationSeconds: 1 }),
    );
    await transcribeVoice({ accessToken: "token", fetchImpl: fetchMock }, RECORDING, {
      noStore: true,
    });
    expect(requestHeaders(fetchMock)).toMatchObject({
      Authorization: "Bearer token",
      "Cache-Control": "no-store",
      "X-Zoption-No-Store": "1",
    });
    expect(mockDelete).toHaveBeenCalledWith(RECORDING.uri);
  });

  it("transcribeVoice omits no-store headers by default", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ text: "hello", durationSeconds: 1 }),
    );
    await transcribeVoice({ accessToken: "token", fetchImpl: fetchMock }, RECORDING);
    const headers = requestHeaders(fetchMock);
    expect(headers["Cache-Control"]).toBeUndefined();
    expect(headers["X-Zoption-No-Store"]).toBeUndefined();
  });

  it("extractVoiceTransaction sends no-store headers when opted in", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        transcript: "Spent 250 pesos on lunch",
        description: "Lunch",
        date: "2026-09-07",
        amountMinor: 25000,
        currency: "PHP",
        kind: "expense",
      }),
    );
    await extractVoiceTransaction(
      "token",
      { uri: "file:///recording.m4a", fileName: "voice-entry.m4a" },
      fetchMock,
      { noStore: true },
    );
    expect(requestHeaders(fetchMock)).toMatchObject({
      Authorization: "Bearer token",
      "Cache-Control": "no-store",
      "X-Zoption-No-Store": "1",
    });
  });

  it("extractVoiceTransaction omits no-store headers by default", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        transcript: "Spent 250 pesos on lunch",
        description: "Lunch",
        date: "2026-09-07",
        amountMinor: 25000,
        currency: "PHP",
        kind: "expense",
      }),
    );
    await extractVoiceTransaction(
      "token",
      { uri: "file:///recording.m4a", fileName: "voice-entry.m4a" },
      fetchMock,
    );
    const headers = requestHeaders(fetchMock);
    expect(headers["Cache-Control"]).toBeUndefined();
    expect(headers["X-Zoption-No-Store"]).toBeUndefined();
  });
});
