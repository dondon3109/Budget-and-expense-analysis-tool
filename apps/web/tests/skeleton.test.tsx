// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Skeleton, SkeletonStatus, SkeletonTableRows } from "../src/components/common/Skeleton";

afterEach(cleanup);

describe("Skeleton", () => {
  it("renders a decorative bar that assistive technology ignores", () => {
    const { container } = render(<Skeleton width={120} height={14} />);
    const bar = container.querySelector<HTMLElement>(".skeleton")!;

    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar.style.width).toBe("120px");
    expect(bar.style.height).toBe("14px");
  });

  it("passes string lengths through untouched", () => {
    const { container } = render(<Skeleton width="60%" height="14px" />);
    const bar = container.querySelector<HTMLElement>(".skeleton")!;

    expect(bar.style.width).toBe("60%");
    expect(bar.style.height).toBe("14px");
  });
});

describe("SkeletonStatus", () => {
  it("announces the loading label while the bars stay hidden", () => {
    render(
      <SkeletonStatus label="Loading transaction records">
        <Skeleton />
      </SkeletonStatus>,
    );

    const status = screen.getByRole("status", { name: "Loading transaction records" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.querySelectorAll(".skeleton[aria-hidden='true']")).toHaveLength(1);
    expect(screen.getByText("Loading transaction records")).toHaveClass("sr-only");
  });
});

describe("SkeletonTableRows", () => {
  it("renders the requested rows and columns inside a table body", () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRows rows={3} columns={7} />
        </tbody>
      </table>,
    );

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.querySelectorAll("td")).toHaveLength(7);
      expect(row.querySelectorAll(".skeleton")).toHaveLength(7);
    }
  });

  it("defaults to five rows when none are requested", () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRows columns={2} />
        </tbody>
      </table>,
    );

    expect(screen.getAllByRole("row")).toHaveLength(5);
  });
});
