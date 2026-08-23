// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollToTop } from "../src/components/layout/ScrollToTop";

describe("ScrollToTop", () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("scrolls to the top of the page when navigating between routes without a hash", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ScrollToTop />
        <Routes>
          <Route
            path="/"
            element={
              <div>
                <h1>Landing Page</h1>
                <Link to="/install">Download Android APK</Link>
              </div>
            }
          />
          <Route
            path="/install"
            element={
              <div>
                <h1>Install Page</h1>
                <Link to="/">Back Home</Link>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    // Initial mount on "/"
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    scrollToSpy.mockClear();

    // Navigate to "/install" by clicking the download link
    fireEvent.click(screen.getByRole("link", { name: "Download Android APK" }));

    expect(screen.getByRole("heading", { name: "Install Page" })).toBeInTheDocument();
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("scrolls to the targeted anchor element when navigating with a hash", () => {
    const targetElement = document.createElement("section");
    targetElement.id = "instructions";
    const scrollIntoViewSpy = vi.fn();
    targetElement.scrollIntoView = scrollIntoViewSpy;
    document.body.appendChild(targetElement);

    render(
      <MemoryRouter initialEntries={["/install#instructions"]}>
        <ScrollToTop />
        <Routes>
          <Route
            path="/install"
            element={
              <div>
                <h1>Install Page</h1>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(scrollIntoViewSpy).toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();

    document.body.removeChild(targetElement);
  });

  it("falls back to scrolling to the top if the hash target does not exist in the DOM", () => {
    render(
      <MemoryRouter initialEntries={["/install#non-existent"]}>
        <ScrollToTop />
        <Routes>
          <Route
            path="/install"
            element={
              <div>
                <h1>Install Page</h1>
              </div>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });
});
