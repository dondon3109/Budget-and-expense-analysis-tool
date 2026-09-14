// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UserAvatar } from "../src/components/profile/UserAvatar";
import { isSafeAvatarUrl } from "../src/lib/avatar";

afterEach(() => {
  cleanup();
});

describe("isSafeAvatarUrl", () => {
  it("accepts valid blob URLs", () => {
    expect(isSafeAvatarUrl("blob:http://localhost:5173/1234-5678")).toBe(true);
    expect(isSafeAvatarUrl("blob:https://zoption.site/abcd-efgh")).toBe(true);
  });

  it("accepts valid HTTPS and HTTP URLs", () => {
    expect(isSafeAvatarUrl("https://zoption.site/api/public/avatars/user/pic.png")).toBe(true);
    expect(isSafeAvatarUrl("http://localhost:8787/api/public/avatars/user/pic.png")).toBe(true);
  });

  it("accepts root-relative URLs", () => {
    expect(isSafeAvatarUrl("/api/public/avatars/user/pic.png")).toBe(true);
  });

  it("rejects undefined or empty strings", () => {
    expect(isSafeAvatarUrl(undefined)).toBe(false);
    expect(isSafeAvatarUrl("")).toBe(false);
  });

  it("rejects javascript: and other dangerous protocols", () => {
    expect(isSafeAvatarUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeAvatarUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeAvatarUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeAvatarUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("UserAvatar safe rendering", () => {
  it("renders img tag when imageUrl is safe", () => {
    const { container } = render(
      <UserAvatar
        previewUrl="blob:http://localhost:5173/preview-1"
        displayName="Alice Smith"
        alt="Alice"
      />,
    );
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "blob:http://localhost:5173/preview-1");
  });

  it("falls back to initials when imageUrl has dangerous protocol", () => {
    const { container } = render(
      <UserAvatar previewUrl="javascript:alert(1)" displayName="Alice Smith" alt="Alice" />,
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("AS")).toBeInTheDocument();
  });
});
