import { ApiTransportError } from "./authenticated";
import { extractReceipt } from "./receipt-scan";

jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.example.test" },
}));

jest.mock("@/telemetry/telemetry", () => ({
  telemetry: { capture: jest.fn() },
}));

jest.mock("expo-file-system", () => ({
  File: class MockExpoFile extends Blob {
    constructor(uri: string) {
      super([uri], { type: "image/jpeg" });
    }
  },
}));

const sampleImage = {
  uri: "file:///receipt.jpg",
  fileName: "receipt.jpg",
  mimeType: "image/jpeg" as const,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mobile receipt scan transport", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("sends the payment detail opt-in and decodes a valid receipt draft", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        merchant: "Jollibee",
        date: "2026-09-30",
        amountMinor: 28_500,
        currency: "PHP",
        kind: "expense",
        rawText: "JOLLIBEE 285.00",
      }),
    );

    const draft = await extractReceipt({ accessToken: "token", fetchImpl: fetchMock }, sampleImage);

    expect(draft.merchant).toBe("Jollibee");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/app/receipts/extract");
    expect((init.body as FormData).get("detail")).toBe("payment");
    expect((init.body as FormData).get("image")).toBeInstanceOf(Blob);
  });

  it("fails the promise with a timeout error when the upload hangs", async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn(() => new Promise<Response>(() => undefined));

    const request = extractReceipt({ accessToken: "token", fetchImpl: fetchMock }, sampleImage);
    const assertion = expect(request).rejects.toMatchObject({
      code: "network",
      message: "Reading the receipt is taking too long. Try again with a clearer photo.",
    });
    await jest.advanceTimersByTimeAsync(45_000);
    await assertion;
  });

  it("wraps invalid response payloads as ApiTransportError", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ merchant: "Jollibee", amountMinor: 0 }));

    await expect(
      extractReceipt({ accessToken: "token", fetchImpl: fetchMock }, sampleImage),
    ).rejects.toBeInstanceOf(ApiTransportError);
    await expect(
      extractReceipt({ accessToken: "token", fetchImpl: fetchMock }, sampleImage),
    ).rejects.toMatchObject({ code: "invalid_response", status: 200 });
  });
});
