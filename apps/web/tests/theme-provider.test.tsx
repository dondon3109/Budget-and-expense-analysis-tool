// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "../src/components/theme/ThemeToggle";
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "../src/theme/ThemeProvider";

function renderThemeToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

function ThemeStateProbe() {
  const { theme, hasThemePreference, previewTheme, setTheme, toggleTheme } = useTheme();

  return (
    <div>
      <span data-testid="theme-state">
        {theme}:{hasThemePreference ? "chosen" : "unselected"}
      </span>
      <button type="button" onClick={() => previewTheme("coffee")}>
        Preview coffee
      </button>
      <button type="button" onClick={() => setTheme("dark")}>
        Choose dark
      </button>
      <button type="button" onClick={toggleTheme}>
        Cycle theme
      </button>
    </div>
  );
}

function renderThemeStateProbe() {
  return render(
    <ThemeProvider>
      <ThemeStateProbe />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  document.head.innerHTML = '<meta name="theme-color" content="#f4f1e9">';
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ThemeProvider", () => {
  it("uses a stored Coffee preference and persists direct menu changes", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "coffee");
    const user = userEvent.setup();
    renderThemeToggle();

    const trigger = screen.getByRole("button", {
      name: "Choose theme. Current theme: Coffee",
    });
    expect(trigger).not.toHaveAttribute("aria-pressed");
    expect(document.documentElement).toHaveAttribute("data-theme", "coffee");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#efe4d2",
    );

    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));

    expect(
      screen.getByRole("button", { name: "Choose theme. Current theme: Light" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("supports keyboard navigation and Escape in the persistent theme menu", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    renderThemeToggle();

    const trigger = screen.getByRole("button", {
      name: "Choose theme. Current theme: Light",
    });
    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveFocus(),
    );

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("falls back to the system preference when storage is missing or invalid", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

    renderThemeToggle();

    expect(
      screen.getByRole("button", { name: "Choose theme. Current theme: Dark" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("sepia");
  });

  it("uses the prepaint document theme before storage or system values", () => {
    document.documentElement.dataset.theme = "coffee";
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

    renderThemeToggle();

    expect(
      screen.getByRole("button", { name: "Choose theme. Current theme: Coffee" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "coffee");
  });

  it("still switches themes when storage access fails", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const user = userEvent.setup();

    renderThemeToggle();
    await user.click(screen.getByRole("button", { name: /current theme: light/i }));
    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: /current theme: dark/i })).toBeInTheDocument();
  });

  it("does not treat a system fallback as an explicit preference", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));

    renderThemeStateProbe();

    expect(screen.getByTestId("theme-state")).toHaveTextContent("dark:unselected");
  });

  it("previews Coffee without persisting or confirming it", async () => {
    const user = userEvent.setup();
    renderThemeStateProbe();

    await user.click(screen.getByRole("button", { name: "Preview coffee" }));

    expect(screen.getByTestId("theme-state")).toHaveTextContent("coffee:unselected");
    expect(document.documentElement).toHaveAttribute("data-theme", "coffee");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#efe4d2",
    );
  });

  it("recognizes and migrates a legacy preference", () => {
    window.localStorage.setItem("clarity-theme", "dark");

    renderThemeStateProbe();

    expect(screen.getByTestId("theme-state")).toHaveTextContent("dark:chosen");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem("clarity-theme")).toBeNull();
  });

  it("marks the current session as chosen when persistence fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const user = userEvent.setup();

    renderThemeStateProbe();
    await user.click(screen.getByRole("button", { name: "Choose dark" }));

    expect(screen.getByTestId("theme-state")).toHaveTextContent("dark:chosen");
  });

  it("accepts a Coffee preference from another tab", () => {
    renderThemeStateProbe();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "coffee" }),
      );
    });

    expect(screen.getByTestId("theme-state")).toHaveTextContent("coffee:chosen");
    expect(document.documentElement).toHaveAttribute("data-theme", "coffee");
  });

  it("cycles Light to Dark to Coffee to Light", async () => {
    const user = userEvent.setup();
    renderThemeStateProbe();
    const cycle = screen.getByRole("button", { name: "Cycle theme" });

    await user.click(cycle);
    expect(screen.getByTestId("theme-state")).toHaveTextContent("dark:chosen");
    await user.click(cycle);
    expect(screen.getByTestId("theme-state")).toHaveTextContent("coffee:chosen");
    await user.click(cycle);
    expect(screen.getByTestId("theme-state")).toHaveTextContent("light:chosen");
  });
});
