// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SmsQuickPasteModal } from "../src/components/transactions/SmsQuickPasteModal";

function renderModal(isOpen = true) {
  const onClose = vi.fn();
  const onApply = vi.fn();
  render(<SmsQuickPasteModal isOpen={isOpen} onClose={onClose} onApply={onApply} />);
  return { onClose, onApply };
}

afterEach(cleanup);

describe("SmsQuickPasteModal", () => {
  it("renders nothing while closed", () => {
    renderModal(false);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves focus into the paste field and closes on Escape", () => {
    const { onClose } = renderModal();

    const dialog = screen.getByRole("dialog", { name: "Quick Paste from SMS / Alert" });
    expect(document.activeElement).toBe(screen.getByLabelText("Paste SMS or Notification Text"));

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside the dialog", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Quick Paste from SMS / Alert" });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
    const apply = screen.getByRole("button", { name: "Apply Transaction" });

    apply.focus();
    fireEvent.keyDown(apply, { key: "Tab" });

    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("renders outside the application root so the root lock cannot disable it", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    render(<SmsQuickPasteModal isOpen onClose={vi.fn()} onApply={vi.fn()} />, {
      container: root,
    });

    expect(root).toHaveAttribute("aria-hidden", "true");
    const dialog = screen.getByRole("dialog", { name: "Quick Paste from SMS / Alert" });
    expect(root.contains(dialog)).toBe(false);
  });

  it("applies the edited transaction and closes", () => {
    const { onApply, onClose } = renderModal();

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "42.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply Transaction" }));

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ amount: 42.5 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
