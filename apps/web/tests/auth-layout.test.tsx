// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthLayout } from "../src/components/auth/AuthLayout";
import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { ThemeProvider } from "../src/theme/ThemeProvider";

describe("AuthLayout", () => {
  it("offers the shared appearance switch on authentication screens", () => {
    render(
      <ThemeProvider>
        <CookieConsentProvider>
          <MemoryRouter>
            <AuthLayout eyebrow="Welcome" title="Sign in" description="Continue to your workspace.">
              <form>Authentication form</form>
            </AuthLayout>
          </MemoryRouter>
        </CookieConsentProvider>
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose theme\. current theme: (light|dark|coffee)/i }),
    ).toBeInTheDocument();
  });
});
