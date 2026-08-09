// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useRootLock } from "../src/hooks/useRootLock";

function LockHolder({ locked }: { locked: boolean }) {
  useRootLock(locked);
  return null;
}

function LockPair({ first, second }: { first: boolean; second: boolean }) {
  return (
    <>
      <LockHolder locked={first} />
      <LockHolder locked={second} />
    </>
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  document.body.style.overflow = "";
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("useRootLock", () => {
  it("keeps the document locked until the last holder releases", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");

    const view = render(<LockPair first second />, { container: root });

    expect(root.inert).toBe(true);
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    view.rerender(<LockPair first={false} second />);

    expect(root.inert).toBe(true);
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    view.rerender(<LockPair first={false} second={false} />);

    expect(root.inert).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the document correctly in the opposite release order", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");

    const view = render(<LockPair first second />, { container: root });
    view.rerender(<LockPair first second={false} />);

    expect(root.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    view.rerender(<LockPair first={false} second={false} />);

    expect(root.inert).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the exact document state captured by the first holder", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");
    root.inert = true;
    root.setAttribute("aria-hidden", "legacy");
    document.body.style.overflow = "clip";

    const view = render(<LockPair first second />, { container: root });
    view.rerender(<LockPair first={false} second={false} />);

    expect(root.inert).toBe(true);
    expect(root).toHaveAttribute("aria-hidden", "legacy");
    expect(document.body.style.overflow).toBe("clip");
  });

  it("does not strand its refcount under StrictMode effect replay", () => {
    const root = document.getElementById("root");
    if (!root) throw new Error("Test root is missing.");

    const view = render(
      <StrictMode>
        <LockPair first second />
      </StrictMode>,
      { container: root },
    );

    view.rerender(
      <StrictMode>
        <LockPair first={false} second={false} />
      </StrictMode>,
    );
    expect(root.inert).toBe(false);
    expect(document.body.style.overflow).toBe("");

    view.rerender(
      <StrictMode>
        <LockPair first second={false} />
      </StrictMode>,
    );
    expect(root.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    view.rerender(
      <StrictMode>
        <LockPair first={false} second={false} />
      </StrictMode>,
    );
    expect(root.inert).toBe(false);
    expect(root).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });
});
