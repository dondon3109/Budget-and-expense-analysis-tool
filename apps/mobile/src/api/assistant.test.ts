import {
  createAssistantThreadTurn,
  deleteAssistantThread,
  getAssistantMemory,
  getAssistantPreferences,
  listAssistantThreads,
  sendAssistantTurn,
  updateAssistantMemoryPreferences,
  updateAssistantPreferences,
} from "./assistant";

const token = "access-token";
const apiBase = "https://api.example.test";
jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.example.test" },
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("assistant api transport", () => {
  it("decodes preferences and sends the bearer token", async () => {
    const payload = {
      consentedAt: "2026-05-01T08:00:00.000Z",
      consentVersion: 5,
      retentionDays: 90,
      assistantName: "Zoe",
      userPreferredName: "Don",
      responseDetail: "standard",
      coachingStyle: "direct",
    };
    const fetchMock = jest.fn(async () => jsonResponse(payload));
    const preferences = await getAssistantPreferences({
      accessToken: token,
      fetchImpl: fetchMock,
    });
    expect(preferences.assistantName).toBe("Zoe");
    expect(preferences.consentVersion).toBe(5);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(apiBase + "/api/app/assistant/preferences");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer " + token);
  });

  it("rejects responses that fail the schema", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ consentedAt: "yesterday", consentVersion: "five" }),
    );
    await expect(
      getAssistantPreferences({ accessToken: token, fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ name: "ApiTransportError" });
  });

  it("grants consent with a PATCH to /preferences", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        consentedAt: "2026-05-01T08:00:00.000Z",
        consentVersion: 5,
        retentionDays: 90,
        assistantName: null,
        userPreferredName: null,
        responseDetail: "concise",
        coachingStyle: "gentle",
      }),
    );
    await updateAssistantPreferences(
      { accessToken: token, fetchImpl: fetchMock },
      { consented: true },
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(apiBase + "/api/app/assistant/preferences");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ consented: true });
  });

  it("creates a thread turn with a clientRequestId", async () => {
    const thread = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Where does my money go?",
      lastMessageAt: "2026-05-01T08:00:10.000Z",
      createdAt: "2026-05-01T08:00:00.000Z",
    };
    const message = {
      id: "22222222-2222-4222-8222-222222222222",
      threadId: thread.id,
      role: "assistant",
      content: "Most of May went to food and rent.",
      status: "completed",
      createdAt: "2026-05-01T08:00:05.000Z",
    };
    const fetchMock = jest.fn(async () =>
      jsonResponse({ thread, userMessage: { ...message, role: "user", content: "Where does my money go?" }, assistantMessage: message }, 201),
    );
    const result = await createAssistantThreadTurn(
      { accessToken: token, fetchImpl: fetchMock },
      { message: "Where does my money go?", clientRequestId: "33333333-3333-4333-8333-333333333333" },
    );
    expect(result.thread.id).toBe(thread.id);
    expect(result.assistantMessage.status).toBe("completed");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(apiBase + "/api/app/assistant/threads");
    expect(init.method).toBe("POST");
  });

  it("sends a follow-up turn to the thread messages path", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const thread = { id: threadId, title: "Budget check", lastMessageAt: "2026-05-01T08:00:00.000Z", createdAt: "2026-05-01T08:00:00.000Z" };
    const message = { id: "44444444-4444-4444-8444-444444444444", threadId, role: "assistant", content: "ok", status: "completed", createdAt: "2026-05-01T08:00:05.000Z" };
    const fetchMock = jest.fn(async () =>
      jsonResponse({ thread, userMessage: { ...message, role: "user", content: "and food?" }, assistantMessage: message }),
    );
    await sendAssistantTurn(
      { accessToken: token, fetchImpl: fetchMock },
      threadId,
      { message: "and food?", clientRequestId: "55555555-5555-4555-8555-555555555555" },
    );
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(apiBase + "/api/app/assistant/threads/" + threadId + "/messages");
  });

  it("serializes thread list query parameters", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ items: [], nextCursor: null }));
    await listAssistantThreads(
      { accessToken: token, fetchImpl: fetchMock },
      { cursor: "2026-05-01T08:00:00.000Z", limit: 10 },
    );
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("/api/app/assistant/threads?");
    expect(url).toContain("cursor=2026-05-01T08%3A00%3A00.000Z");
    expect(url).toContain("limit=10");
  });

  it("maps a 14-day cycle limit rejection to plan_limit", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse(
        {
          error: "assistant_cycle_limit_reached",
          message: "No AI questions remaining this cycle.",
          details: { feature: "assistant_question", used: 4, limit: 4 },
        },
        402,
      ),
    );
    await expect(
      getAssistantPreferences({ accessToken: token, fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ code: "plan_limit" });
  });

  it("deletes an assistant conversation with a DELETE to the thread path", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = jest.fn(async () => new Response(null, { status: 204 }));
    await deleteAssistantThread({ accessToken: token, fetchImpl: fetchMock }, threadId);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(apiBase + "/api/app/assistant/threads/" + threadId);
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer " + token);
  });

  it("maps an already-absent conversation to not_found so callers can treat it as the reached end state", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = jest.fn(async () =>
      jsonResponse(
        {
          error: "assistant_thread_not_found",
          message: "The assistant chat was not found.",
        },
        404,
      ),
    );
    await expect(
      deleteAssistantThread({ accessToken: token, fetchImpl: fetchMock }, threadId),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("surfaces a genuine server failure on delete instead of hiding it", async () => {
    const threadId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: "internal_error", message: "Something broke." }, 500),
    );
    await expect(
      deleteAssistantThread({ accessToken: token, fetchImpl: fetchMock }, threadId),
    ).rejects.toMatchObject({ code: "unavailable", status: 500 });
  });

  it("decodes memory items and debt-strategy preference updates", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse([
        {
          id: "mem-1",
          kind: "preference",
          key: "debt_strategy",
          value: "avalanche",
          source: "user_stated",
          createdAt: "2026-05-01T08:00:00.000Z",
          updatedAt: "2026-05-01T08:00:00.000Z",
        },
      ]),
    );
    const memory = await getAssistantMemory({ accessToken: token, fetchImpl: fetchMock });
    expect(memory).toHaveLength(1);
    expect(memory[0]?.value).toBe("avalanche");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ debtStrategy: "avalanche", responseDetail: "concise", coachingStyle: "gentle" }),
    );
    const preferences = await updateAssistantMemoryPreferences(
      { accessToken: token, fetchImpl: fetchMock },
      { debtStrategy: "avalanche" },
    );
    expect(preferences.debtStrategy).toBe("avalanche");
  });
});
