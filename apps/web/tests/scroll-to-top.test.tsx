// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollToTop } from "../src/components/layout/ScrollToTop";

// Mirrors HASH_TARGET_POLL_MS and HASH_TARGET_DEADLINE_MS in the component.
const POLL_INTERVAL_MS = 50;
const RETRY_DEADLINE_MS = 1000;

const createdTargets: HTMLElement[] = [];

function hashTarget(id: string) {
  const element = document.createElement("section");
  element.id = id;
  const scrollIntoView = vi.fn();
  element.scrollIntoView = scrollIntoView;
  createdTargets.push(element);
  return { element, scrollIntoView };
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ScrollToTop />
      <Routes>
        <Route path="/install" element={<h1>Install Page</h1>} />
        <Route
          path="/settings"
          element={
            <div>
              <h1>Settings</h1>
              <Link to="/install">Install</Link>
            </div>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ScrollToTop", () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const target of createdTargets.splice(0)) target.remove();
    delete (window as unknown as Record<string, unknown>).scrollY;
  });

  it("scrolls to the top of the page when navigating between routes without a hash", () => {
    renderApp("/settings");

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    scrollToSpy.mockClear();

    fireEvent.click(screen.getByRole("link", { name: "Install" }));

    expect(screen.getByRole("heading", { name: "Install Page" })).toBeInTheDocument();
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("scrolls to a hash target that already exists without jumping to the top", () => {
    const { element, scrollIntoView } = hashTarget("instructions");
    document.body.append(element);

    renderApp("/settings#instructions");

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("scrolls once the hash target mounts on a later tick", () => {
    vi.useFakeTimers();
    // Mirrors the settings page, which reveals the hashed section one render after the location
    // changes. The element is created up front and attached by an async tick.
    const { element, scrollIntoView } = hashTarget("plan-and-billing");
    window.setTimeout(() => document.body.append(element), 0);

    renderApp("/settings#plan-and-billing");
    expect(scrollToSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).not.toHaveBeenCalled();

    // The retry window must stop once it has scrolled, or the deadline fallback would later yank
    // the reader back to the top of the page they just landed on.
    act(() => {
      vi.advanceTimersByTime(RETRY_DEADLINE_MS);
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("falls back to the top when the hash target never appears", () => {
    vi.useFakeTimers();

    renderApp("/settings#plan-and-billing");
    expect(scrollToSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(RETRY_DEADLINE_MS + POLL_INTERVAL_MS);
    });

    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("keeps a page's own reveal instead of yanking it back to the top", () => {
    vi.useFakeTimers();
    // SettingsPage answers an alias such as #voice-settings itself, by scrolling to its own
    // section in a frame, so the target id this component looks for never exists.
    let scrollY = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });

    renderApp("/settings#voice-settings");
    expect(scrollToSpy).not.toHaveBeenCalled();

    act(() => {
      scrollY = 640;
      vi.advanceTimersByTime(RETRY_DEADLINE_MS + POLL_INTERVAL_MS);
    });

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("does not scroll a stale hash target after navigating away", () => {
    vi.useFakeTimers();
    const { element, scrollIntoView } = hashTarget("plan-and-billing");
    window.setTimeout(() => document.body.append(element), 0);

    renderApp("/settings#plan-and-billing");
    fireEvent.click(screen.getByRole("link", { name: "Install" }));
    expect(screen.getByRole("heading", { name: "Install Page" })).toBeInTheDocument();
    scrollToSpy.mockClear();

    act(() => {
      vi.advanceTimersByTime(RETRY_DEADLINE_MS + POLL_INTERVAL_MS);
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});
