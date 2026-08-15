import { completeSupportChat, createBugReport, listBugReports } from "./support";

const token = "access-token";
jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.example.test" },
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("support api transport", () => {
  it("keeps the public chat free of Authorization headers", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ message: "You can find imports under More." }));
    const result = await completeSupportChat(
      { fetchImpl: fetchMock },
      { messages: [{ role: "user", content: "Where is import?" }], pageContext: "landing" },
    );
    expect(result.message).toContain("imports");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/support/chat");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("sends authenticated support chat to the app path", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ message: "Okay, here are steps." }));
    await completeSupportChat(
      { accessToken: token, fetchImpl: fetchMock },
      { messages: [{ role: "user", content: "Transfers fail." }], pageContext: "app" },
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/app/support/chat");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer " + token);
  });

  it("decodes a bug-report draft from the support reply", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        message: "I prepared a bug-report draft.",
        bugReportDraft: {
          title: "Import preview crashes",
          category: "import",
          actualBehavior: "App closes after mapping.",
          expectedBehavior: "Preview opens.",
          stepsToReproduce: "Pick a CSV, map, confirm.",
          frequency: "always",
        },
      }),
    );
    const result = await completeSupportChat(
      { accessToken: token, fetchImpl: fetchMock },
      { messages: [{ role: "user", content: "Import preview crashes" }], pageContext: "import" },
    );
    expect(result.bugReportDraft?.title).toBe("Import preview crashes");
    expect(result.bugReportDraft?.category).toBe("import");
  });

  it("submits a bug report with diagnostics and decodes the reference", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        id: "11111111-1111-4111-8111-111111111111",
        reference: "BUG-123",
        title: "Import preview crashes",
        category: "import",
        actualBehavior: "App closes after mapping.",
        expectedBehavior: "Preview opens.",
        stepsToReproduce: "Pick a CSV, map, confirm.",
        frequency: "always",
        pageContext: "import",
        diagnostics: {
          route: "/app/import",
          releaseVersion: "1.0.0",
          viewportWidth: 390,
          viewportHeight: 844,
          displayMode: "standalone",
          platform: "ios",
        },
        status: "new",
        createdAt: "2026-05-01T08:00:00.000Z",
        updatedAt: "2026-05-01T08:00:00.000Z",
      }, 201),
    );
    const report = await createBugReport(
      { accessToken: token, fetchImpl: fetchMock },
      {
        clientRequestId: "22222222-2222-4222-8222-222222222222",
        title: "Import preview crashes",
        category: "import",
        actualBehavior: "App closes after mapping.",
        expectedBehavior: "Preview opens.",
        stepsToReproduce: "Pick a CSV, map, confirm.",
        frequency: "always",
        pageContext: "import",
        diagnostics: {
          route: "/app/import",
          releaseVersion: "1.0.0",
          viewportWidth: 390,
          viewportHeight: 844,
          displayMode: "standalone",
          platform: "ios",
        },
      },
    );
    expect(report.reference).toBe("BUG-123");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.example.test/api/app/support/bug-reports");
  });

  it("lists submitted bug reports", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse([
        {
          id: "33333333-3333-4333-8333-333333333333",
          reference: "BUG-124",
          title: "Dashboard total wrong",
          category: "data",
          actualBehavior: "Total shows zero.",
          expectedBehavior: "Total matches entries.",
          stepsToReproduce: "Add an entry and open Dashboard.",
          frequency: "sometimes",
          pageContext: "dashboard",
          diagnostics: {
            route: "/app/dashboard",
            releaseVersion: "1.0.0",
            viewportWidth: 390,
            viewportHeight: 844,
            displayMode: "standalone",
            platform: "ios",
          },
          status: "new",
          createdAt: "2026-05-01T08:00:00.000Z",
          updatedAt: "2026-05-01T08:00:00.000Z",
        },
      ]),
    );
    const reports = await listBugReports({ accessToken: token, fetchImpl: fetchMock });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.status).toBe("new");
  });

  it("surfaces support_unavailable as an unavailable error", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: "support_unavailable", message: "Zoption Support did not return an answer." }, 503),
    );
    await expect(
      completeSupportChat(
        { fetchImpl: fetchMock },
        { messages: [{ role: "user", content: "hi" }], pageContext: "landing" },
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
