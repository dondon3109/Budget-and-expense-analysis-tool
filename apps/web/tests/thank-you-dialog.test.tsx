// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThankYouDialog } from "../src/components/common/ThankYouDialog";
import {
  clearSignupThankYouPending,
  isSignupThankYouPending,
  markSignupThankYouPending,
  thankYouCopy,
  type ThankYouFlow,
} from "../src/lib/thankYou";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ThankYouDialog", () => {
  it.each(Object.keys(thankYouCopy) as ThankYouFlow[])("shows its own message for %s", (flow) => {
    render(<ThankYouDialog flow={flow} onClose={() => undefined} />);

    expect(screen.getByRole("dialog", { name: thankYouCopy[flow].title })).toBeInTheDocument();
    expect(screen.getByText(thankYouCopy[flow].description)).toBeInTheDocument();
  });

  it("closes from Continue", () => {
    const onClose = vi.fn();
    render(<ThankYouDialog flow="signup" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("remembers a new signup until the welcome is dismissed", () => {
    expect(isSignupThankYouPending()).toBe(false);
    markSignupThankYouPending();
    expect(isSignupThankYouPending()).toBe(true);
    clearSignupThankYouPending();
    expect(isSignupThankYouPending()).toBe(false);
  });
});
