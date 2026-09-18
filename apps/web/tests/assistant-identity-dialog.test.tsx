// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantIdentityDialog } from "../src/components/assistant/AssistantIdentityDialog";

afterEach(cleanup);

describe("AssistantIdentityDialog", () => {
  it("keeps Tab inside the dialog and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <AssistantIdentityDialog
        required={false}
        busy={false}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Edit assistant names" });
    const close = screen.getByRole("button", { name: "Close assistant name editor" });
    const save = screen.getByRole("button", { name: "Save changes" });

    expect(screen.getByLabelText("Your assistant's name")).toHaveFocus();

    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(close).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the blocking gate open on Escape and confines Tab", () => {
    const onClose = vi.fn();
    render(<AssistantIdentityDialog required busy={false} onSubmit={vi.fn()} onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Make this assistant yours" });
    const name = screen.getByLabelText("Your assistant's name");
    const continueButton = screen.getByRole("button", { name: "Continue" });

    expect(name).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Close assistant name editor" }),
    ).not.toBeInTheDocument();

    continueButton.focus();
    fireEvent.keyDown(continueButton, { key: "Tab" });
    expect(name).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
