// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeChoiceDialog } from "../src/components/theme/ThemeChoiceDialog";
import { useRootLock } from "../src/hooks/useRootLock";
import { THEME_STORAGE_KEY, ThemeProvider } from "../src/theme/ThemeProvider";

function ExternalLock({ locked }: { locked: boolean }) {
  useRootLock(locked);
  return null;
}

function ThemeChoiceHarness({ externalLock = false }: { externalLock?: boolean }) {
  return (
    <ThemeProvider>
      <ExternalLock locked={externalLock} />
      <ThemeChoiceDialog />
      <button type="button">Underlying action</button>
    </ThemeProvider>
  );
}

function renderThemeChoiceDialog(externalLock = false) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Test root is missing.");

  return render(<ThemeChoiceHarness externalLock={externalLock} />, { container: root });
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  document.head.innerHTML = '<meta name="theme-color" content="#f4f1e9">';
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ThemeChoiceDialog", () => {
  it("shows three choices and focuses the prepainted theme on a fresh visit", () => {
    document.documentElement.dataset.theme = "dark";

    renderThemeChoiceDialog();

    expect(screen.getByRole("dialog", { name: "Choose how Zoption looks" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Preview Light theme" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Preview Dark theme" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Preview Dark theme" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Preview Coffee theme" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm Dark theme" })).toBeVisible();
    expect(document.getElementById("root")?.inert).toBe(true);
    expect(document.getElementById("root")).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("previews Coffee without saving or closing, then confirms it", async () => {
    const user = userEvent.setup();
    renderThemeChoiceDialog();

    await user.click(screen.getByRole("radio", { name: "Preview Coffee theme" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Preview Coffee theme" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "coffee");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#efe4d2",
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.getElementById("root")?.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Confirm Coffee theme" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("coffee");
    expect(document.getElementById("root")?.inert).toBe(false);
    expect(document.getElementById("root")).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("does not strand the root lock when a startup overlay releases first", async () => {
    const user = userEvent.setup();
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");
    const view = renderThemeChoiceDialog(true);

    view.rerender(<ThemeChoiceHarness externalLock={false} />);

    expect(root.inert).toBe(true);
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: "Confirm Light theme" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(root.inert).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("confirms the untouched system-derived selection", async () => {
    document.documentElement.dataset.theme = "dark";
    const user = userEvent.setup();
    renderThemeChoiceDialog();

    await user.click(screen.getByRole("button", { name: "Confirm Dark theme" }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("previews multiple choices without persisting an intermediate value", async () => {
    const user = userEvent.setup();
    renderThemeChoiceDialog();

    await user.click(screen.getByRole("radio", { name: "Preview Dark theme" }));
    await user.click(screen.getByRole("radio", { name: "Preview Light theme" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm Light theme" })).toBeVisible();
  });

  it("stays hidden for a returning Coffee user", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "coffee");

    renderThemeChoiceDialog();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "coffee");
  });

  it("stays hidden while migrating a legacy preference", () => {
    window.localStorage.setItem("clarity-theme", "dark");

    renderThemeChoiceDialog();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem("clarity-theme")).toBeNull();
  });

  it("shows when the stored value is invalid", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");

    renderThemeChoiceDialog();

    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("shows when storage reads fail", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    renderThemeChoiceDialog();

    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("closes for the current session when confirmation cannot be persisted", async () => {
    const user = userEvent.setup();
    renderThemeChoiceDialog();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    await user.click(screen.getByRole("radio", { name: "Preview Coffee theme" }));
    await user.click(screen.getByRole("button", { name: "Confirm Coffee theme" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "coffee");
  });

  it("supports arrow selection and traps focus through the Confirm action", async () => {
    const user = userEvent.setup();
    renderThemeChoiceDialog();

    const lightOption = screen.getByRole("radio", { name: "Preview Light theme" });
    expect(lightOption).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Preview Dark theme" })).toHaveFocus();
    await user.keyboard("{End}");
    const coffeeOption = screen.getByRole("radio", { name: "Preview Coffee theme" });
    expect(coffeeOption).toHaveFocus();

    await user.tab();
    const confirm = screen.getByRole("button", { name: "Confirm Coffee theme" });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(coffeeOption).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(confirm).toHaveFocus();
  });
});
