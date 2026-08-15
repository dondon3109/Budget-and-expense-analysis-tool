import { requestAccountDeletion } from "./account";

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

describe("account api transport", () => {
  it("sends the high-friction deletion payload and decodes a deleted status", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ status: "deleted" }));
    const status = await requestAccountDeletion(
      { accessToken: token, fetchImpl: fetchMock },
      { confirmation: "DELETE", password: "hunter2-example" },
    );
    expect(status).toBe("deleted");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/app/account");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ confirmation: "DELETE", password: "hunter2-example" });
  });

  it("decodes a cleanup_pending status", async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ status: "cleanup_pending" }, 202));
    await expect(
      requestAccountDeletion(
        { accessToken: token, fetchImpl: fetchMock },
        { confirmation: "DELETE", password: "hunter2-example" },
      ),
    ).resolves.toBe("cleanup_pending");
  });

  it("surfaces an invalid password without leaking request details", async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({ error: "invalid_current_password", message: "The current password could not be verified." }, 400),
    );
    await expect(
      requestAccountDeletion(
        { accessToken: token, fetchImpl: fetchMock },
        { confirmation: "DELETE", password: "wrong" },
      ),
    ).rejects.toMatchObject({ code: "invalid_request", message: "The current password could not be verified." });
  });
});
