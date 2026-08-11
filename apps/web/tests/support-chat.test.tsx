// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupportChat } from "../src/components/support/SupportChat";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderSupport(path = "/", surface: "landing" | "app" = "landing") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <SupportChat surface={surface} />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Zoption Support chat", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
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
    expect(screen.getByText(/no account access/i)).toBeInTheDocument();
    expect(screen.getByText(/messages go to DeepSeek/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "How do imports work?" }));
    const emphasized = await screen.findByText("Import");
    const responseParagraph = emphasized.closest("p");
    expect(emphasized).toHaveProperty("tagName", "STRONG");
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
    expect(await screen.findByText("Open Budgets from the main navigation.")).toBeInTheDocument();
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
