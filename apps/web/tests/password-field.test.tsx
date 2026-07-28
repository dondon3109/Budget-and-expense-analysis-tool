// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PasswordField } from "../src/components/auth/PasswordField";

describe("PasswordField", () => {
  afterEach(cleanup);

  it("reveals and hides a password with an accessible toggle", () => {
    render(
      <PasswordField
        id="password"
        label="Password"
        autoComplete="new-password"
        value="Budgeting-2026!"
        onChange={() => undefined}
        aria-describedby="password-guidance"
        aria-invalid={true}
        required
      />,
    );

    const input = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("Budgeting-2026!");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toHaveAttribute("aria-describedby", "password-guidance");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("supports keyboard activation and mirrors disabled state", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PasswordField id="current-password" label="Current password" value="secret" onChange={() => undefined} />,
    );

    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Current password")).toHaveAttribute("type", "text");

    rerender(
      <PasswordField
        id="current-password"
        label="Current password"
        value="secret"
        onChange={() => undefined}
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: "Hide current password" })).toBeDisabled();
  });
});
