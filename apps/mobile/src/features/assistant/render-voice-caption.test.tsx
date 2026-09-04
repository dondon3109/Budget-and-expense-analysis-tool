import React from "react";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { renderMobileVoiceCaption } from "./render-voice-caption";

describe("renderMobileVoiceCaption", () => {
  const textStyle = { fontSize: 14 };
  const boldStyle = { fontWeight: "bold" as const };

  it("returns empty array for empty string", () => {
    expect(renderMobileVoiceCaption("", textStyle, boldStyle)).toEqual([]);
  });

  it("renders plain text in Text component", async () => {
    const parts = renderMobileVoiceCaption("Hello world", textStyle, boldStyle);
    await render(<Text>{parts}</Text>);
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("parses single bold tag into bold Text element", async () => {
    const parts = renderMobileVoiceCaption("You spent **PHP 1,250** this month.", textStyle, boldStyle);
    await render(<Text>{parts}</Text>);
    expect(screen.getByText("You spent ")).toBeTruthy();
    expect(screen.getByText("PHP 1,250")).toBeTruthy();
    expect(screen.getByText(" this month.")).toBeTruthy();
  });

  it("parses multiple bold tags correctly", async () => {
    const parts = renderMobileVoiceCaption("**Total:** **$50.00** across **3** items", textStyle, boldStyle);
    await render(<Text>{parts}</Text>);
    expect(screen.getByText("Total:")).toBeTruthy();
    expect(screen.getByText("$50.00")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("handles unclosed bold tag during typewriter streaming without showing raw asterisks", async () => {
    const parts = renderMobileVoiceCaption("You spent **PHP 1,▍", textStyle, boldStyle);
    await render(<Text>{parts}</Text>);
    expect(screen.getByText("You spent ")).toBeTruthy();
    expect(screen.getByText("PHP 1,▍")).toBeTruthy();
  });

  it("cleans up solitary asterisk delimiter slice before caret", async () => {
    const parts = renderMobileVoiceCaption("You spent *▍", textStyle, boldStyle);
    await render(<Text>{parts}</Text>);
    expect(screen.getByText("You spent ")).toBeTruthy();
    expect(screen.getByText("▍")).toBeTruthy();
  });
});
