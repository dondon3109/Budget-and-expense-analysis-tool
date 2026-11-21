// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThankYouDialog } from "../src/components/common/ThankYouDialog";
import { thankYouCopy, type ThankYouFlow } from "../src/lib/thankYou";

afterEach(() => {
  cleanup();
});

describe("ThankYouDialog", () => {
  it.each(Object.keys(thankYouCopy) as ThankYouFlow[])("shows its own message for %s", (flow) => {
    render(<ThankYouDialog flow={flow} onClose={() => undefined} />);

    expect(screen.getByRole("dialog", { name: thankYouCopy[flow].title })).toBeInTheDocument();
    expect(screen.getByText(thankYouCopy[flow].description)).toBeInTheDocument();
  });

  it("closes from Continue", () => {
    const onClose = vi.fn();
    render(<ThankYouDialog flow="pro" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
