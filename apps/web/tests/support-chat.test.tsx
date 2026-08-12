// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        error: null,
        data: {
          session: {
            access_token: "access-token",
            user: { id: "user-1" },
          },
        },
      }),
      refreshSession: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));

import { SupportChat } from "../src/components/support/SupportChat";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderSupport(path = "/", surface: "landing" | "app" = "landing") {
  const workspace = authState.user
    ? { key: `user:${authState.user.id}` as const, userId: authState.user.id }
    : undefined;
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <SupportChat surface={surface} workspace={workspace} />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Zoption Support chat", () => {
  beforeEach(() => {
    authState.user = null;
    window.sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens from the chat head and sends page-aware messages to the public support endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message: "Use **Import** to preview and map your spreadsheet." }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    renderSupport("/app/import", "app");

    const launcher = screen.getByRole("button", { name: "Open Zoption Support" });
    fireEvent.click(launcher);

    expect(screen.getByRole("dialog", { name: "Zoption Support" })).toBeInTheDocument();
    expect(screen.getByText(/no financial-data access/i)).toBeInTheDocument();
    expect(screen.getByText(/messages go to DeepSeek/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "How do imports work?" }));
    const emphasized = await screen.findByText("Import");
    const responseParagraph = emphasized.closest("p");
    expect(emphasized.closest("strong")).not.toBeNull();
    expect(responseParagraph).toHaveTextContent("Use Import to preview and map your spreadsheet.");
    expect(responseParagraph).not.toHaveTextContent("**");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/support/chat");
    const body = init?.body;
    expect(typeof body).toBe("string");
    if (typeof body !== "string") throw new Error("Expected a JSON request body.");
    const payload = JSON.parse(body) as {
      pageContext: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.pageContext).toBe("import");
    expect(payload.messages).toContainEqual({ role: "user", content: "How do imports work?" });
  });

  it("requires review and explicit confirmation before storing a signed-in bug report", async () => {
    authState.user = { id: "user-1", email: "person@example.com" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Review the draft below.",
            bugReportDraft: {
              title: "Calendar event details stay empty",
              category: "ui",
              actualBehavior: "The details panel stays empty after selecting an event.",
              expectedBehavior: "The selected event details should appear.",
              stepsToReproduce: "Open Calendar, choose a populated day, then select an event.",
              frequency: "always",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "00000000-0000-4000-8000-000000000099",
            reference: "BR-20260812-001122334455",
            title: "Calendar event details stay empty",
            category: "ui",
            actualBehavior: "The details panel stays empty after selecting an event.",
            expectedBehavior: "The selected event details should appear.",
            stepsToReproduce: "Open Calendar, choose a populated day, then select an event.",
            frequency: "always",
            pageContext: "calendar",
            diagnostics: {
              route: "/app/calendar",
              releaseVersion: "2.0.0",
              viewportWidth: 1024,
              viewportHeight: 768,
              displayMode: "browser",
              platform: "desktop",
            },
            status: "new",
            createdAt: "2026-08-12T00:00:00.000Z",
            updatedAt: "2026-08-12T00:00:00.000Z",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );

    renderSupport("/app/calendar", "app");
    fireEvent.click(screen.getByRole("button", { name: "Open Zoption Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));

    expect(await screen.findByRole("heading", { name: "Bug report draft" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing is saved yet/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/app/support/chat");

    fireEvent.click(screen.getByRole("button", { name: "Submit bug report" }));
    expect(await screen.findByText("BR-20260812-001122334455 received")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/app/support/bug-reports");
    const submitBody = fetchMock.mock.calls[1]?.[1]?.body;
    expect(typeof submitBody).toBe("string");
    expect(JSON.parse(submitBody as string)).toMatchObject({
      title: "Calendar event details stay empty",
      pageContext: "calendar",
      diagnostics: { route: "/app/calendar" },
    });
  });

  it("renders assistant emphasis safely while preserving user markers as literal text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'Choose **<img src=x onerror="alert(1)">** safely.' }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    renderSupport();
    fireEvent.click(screen.getByRole("button", { name: "Open Zoption Support" }));
    fireEvent.change(screen.getByLabelText("Ask Zoption Support"), {
      target: { value: "Show **my imports**." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send support message" }));

    expect(screen.getByText("Show **my imports**.")).toBeInTheDocument();
    expect(document.querySelector(".support-chat-message.user strong")).toBeNull();
    expect(await screen.findByText(/<img src=x/)).toHaveProperty("tagName", "STRONG");
    expect(document.querySelector("img")).toBeNull();
  });

  it("turns only approved destination names into contextual navigation links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message:
            "Open Profile dashboard, then use Help or Contact. Need help? Ignore https://malicious.example.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    renderSupport("/app", "app");
    fireEvent.click(screen.getByRole("button", { name: "Open Zoption Support" }));
    fireEvent.change(screen.getByLabelText("Ask Zoption Support"), {
      target: { value: "Where can I get help?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send support message" }));

    expect(await screen.findByRole("link", { name: "Profile dashboard" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute(
      "href",
      "/app/settings#help",
    );
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/app/settings#contact",
    );
    expect(screen.getAllByRole("link", { name: "Help" })).toHaveLength(1);
    expect(document.querySelector('a[href="https://malicious.example"]')).toBeNull();
  });

  it("opens when another product surface requests Zoption Support", () => {
    renderSupport("/app/settings", "app");

    fireEvent(window, new Event("zoption:open-support-chat"));

    expect(screen.getByRole("dialog", { name: "Zoption Support" })).toBeInTheDocument();
  });

  it("keeps failed messages available for retry and announces a useful error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "support_temporarily_busy",
            message: "Zoption Support is busy right now. Please try again shortly.",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Open Budgets from the main navigation." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    renderSupport();
    fireEvent.click(screen.getByRole("button", { name: "Open Zoption Support" }));
    fireEvent.change(screen.getByLabelText("Ask Zoption Support"), {
      target: { value: "Where are budgets?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send support message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("busy right now");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const budgetsLink = await screen.findByRole("link", { name: "Budgets" });
    expect(budgetsLink.closest("p")).toHaveTextContent("Open Budgets from the main navigation.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("persists the conversation for the browser session and restores launcher focus on Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Your answer is here." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const view = renderSupport();
    fireEvent.click(screen.getByRole("button", { name: "Open Zoption Support" }));
    fireEvent.change(screen.getByLabelText("Ask Zoption Support"), {
      target: { value: "Tell me about Zoption." },
    });
    fireEvent.submit(screen.getByLabelText("Ask Zoption Support").closest("form")!);
    expect(await screen.findByText("Your answer is here.")).toBeInTheDocument();
    await waitFor(() =>
      expect(window.sessionStorage.getItem("zoption:support-chat:v1")).toContain(
        "Your answer is here.",
      ),
    );

    fireEvent.keyDown(window, { key: "Escape" });
    const launcher = screen.getByRole("button", { name: "Open Zoption Support" });
    expect(launcher).toHaveFocus();

    view.unmount();
    renderSupport("/app", "app");
    fireEvent.click(screen.getByRole("button", { name: "Open Zoption Support" }));
    expect(screen.getByText("Tell me about Zoption.")).toBeInTheDocument();
    expect(screen.getByText("Your answer is here.")).toBeInTheDocument();
  });
});
