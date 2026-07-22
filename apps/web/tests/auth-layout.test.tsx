// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthLayout } from "../src/components/auth/AuthLayout";
import { ThemeProvider } from "../src/theme/ThemeProvider";

describe("AuthLayout", () => {
  it("offers the shared appearance switch on authentication screens", () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthLayout eyebrow="Welcome" title="Sign in" description="Continue to your workspace.">
            <form>Authentication form</form>
          </AuthLayout>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /switch to (dark|light) mode/i }),
    ).toBeInTheDocument();
  });
});
