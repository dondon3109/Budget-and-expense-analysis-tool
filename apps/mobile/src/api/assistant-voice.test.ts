import {
  fetchMultipartWithTimeout,
  fetchWithTimeout,
  previewAssistantSpeech,
  transcribeVoice,
} from "./assistant-voice";

const token = "access-token";
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

function namedError(name: string): Error {
  const error = new Error("boom");
  Object.defineProperty(error, "name", { value: name });
  return error;
}

const RECORDING = {
  uri: "file:///data/user/0/app/cache/recording-123.m4a",
  mimeType: "audio/mp4",
  fileName: "voice-input.m4a",
};

describe("fetchWithTimeout error classification", () => {
  it("reports a genuine network rejection as a connectivity failure", async () => {
    const fetchImpl = jest.fn(async () => {
      throw namedError("TypeError");
    });
    await expect(
      fetchWithTimeout(fetchImpl, "https://api.example.test/x", {}),
    ).rejects.toMatchObject({
      code: "network",
      message: "Zoption could not be reached. Connect to the internet and retry.",
    });
  });

  it("reports a hard timeout as taking too long even when RN rejects the abort with a generic error (regression)", async () => {
    // React Native commonly rejects an aborted request with a generic
    // "Network request failed" error instead of an AbortError. This used to be
    // misclassified as a connectivity failure.
    const fetchImpl = jest.fn(
      async (_input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> => {
        const signal = init?.signal;
        if (!signal) throw new Error("expected an abort signal");
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(namedError("Network request failed")));
        });
      },
    );
    await expect(
      fetchWithTimeout(fetchImpl, "https://api.example.test/x", {}, 20),
    ).rejects.toMatchObject({
      code: "network",
      message:
        "Voice mode is taking too long. The provider may not be ready yet - try again shortly.",
    });
  });

  it("reports an AbortError timeout as taking too long", async () => {
    const fetchImpl = jest.fn(
      async (_input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> => {
        const signal = init?.signal;
        if (!signal) throw new Error("expected an abort signal");
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(namedError("AbortError")));
        });
      },
    );
    await expect(
      fetchWithTimeout(fetchImpl, "https://api.example.test/x", {}, 20),
    ).rejects.toMatchObject({
      message:
        "Voice mode is taking too long. The provider may not be ready yet - try again shortly.",
    });
  });

  it("rethrows an external (non-timeout) abort", async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(
      async (_input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> => {
        const signal = init?.signal;
        if (!signal) throw new Error("expected an abort signal");
        return await new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(namedError("AbortError")));
        });
      },
    );
    const pending = fetchWithTimeout(
      fetchImpl,
      "https://api.example.test/x",
      { signal: controller.signal },
      5000,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("fetchMultipartWithTimeout Android compatibility", () => {
  it("does not attach AbortSignal to a multipart fetch", async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(
      async (_input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> => {
        expect(init?.signal).toBeUndefined();
        return await new Promise<Response>(() => undefined);
      },
    );

    await expect(
      fetchMultipartWithTimeout(
        fetchImpl,
        "https://api.example.test/x",
        { body: new FormData(), signal: controller.signal },
        20,
      ),
    ).rejects.toMatchObject({
      message:
        "Voice mode is taking too long. The provider may not be ready yet - try again shortly.",
    });
  });
});

describe("transcribeVoice error mapping", () => {
  beforeEach(() => mockDelete.mockClear());

  it("decodes a successful transcription response", async () => {
    const controller = new AbortController();
    const fetchMock = jest.fn(async () =>
      jsonResponse({ text: "Where did my money go?", durationSeconds: 2, languageCode: "en" }),
    );
    const transcription = await transcribeVoice(
      { accessToken: token, fetchImpl: fetchMock, signal: controller.signal },
      RECORDING,
    );
    expect(transcription.text).toBe("Where did my money go?");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer " + token);
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
    expect(init.signal).toBeUndefined();
    const audio = (init.body as FormData).get("audio");
    expect(audio).toBeInstanceOf(Blob);
    expect((audio as globalThis.File).name).toBe(RECORDING.fileName);
    expect(mockDelete).toHaveBeenCalledWith(RECORDING.uri);
  });

  it("surfaces a server timeout (504) accurately instead of connectivity", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(
        { error: "assistant_voice_timeout", message: "Voice processing took too long. Try again." },
        504,
      ),
    );
    await expect(
      transcribeVoice({ accessToken: token, fetchImpl: fetchMock }, RECORDING),
    ).rejects.toMatchObject({
      message: "Voice processing took too long. Try again.",
    });
  });

  it("surfaces an oversized-audio rejection (400) accurately", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(
        { error: "invalid_voice_audio", message: "Record a voice clip up to 4 MB." },
        400,
      ),
    );
    await expect(
      transcribeVoice({ accessToken: token, fetchImpl: fetchMock }, RECORDING),
    ).rejects.toMatchObject({
      message: "Record a voice clip up to 4 MB.",
    });
  });

  it("surfaces an expired session as session_expired", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: "unauthorized", message: "Session expired" }, 401),
    );
    await expect(
      transcribeVoice({ accessToken: token, fetchImpl: fetchMock }, RECORDING),
    ).rejects.toMatchObject({
      code: "session_expired",
    });
  });
});

describe("previewAssistantSpeech", () => {
  it("requests the authenticated curated preview for the selected voice", async () => {
    const fetchMock = jest.fn(async () => new Response(new Uint8Array([1, 2, 3])));

    const preview = await previewAssistantSpeech(
      { accessToken: token, fetchImpl: fetchMock },
      "bright",
    );

    expect(preview.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/api/app/assistant/voice/preview")).toBe(true);
    expect(init.headers).toMatchObject({
      Accept: "audio/mpeg",
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe(JSON.stringify({ voice: "bright" }));
  });
});
