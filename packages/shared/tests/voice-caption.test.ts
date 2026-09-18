import { describe, expect, it } from "vitest";

import { splitVoiceCaption } from "../src/voiceCaption";

describe("splitVoiceCaption", () => {
  it("returns no segments for empty or marker-only content", () => {
    expect(splitVoiceCaption("")).toEqual([]);
    expect(splitVoiceCaption("**")).toEqual([]);
    expect(splitVoiceCaption("****")).toEqual([]);
  });

  it("keeps plain text whole, including newlines", () => {
    expect(splitVoiceCaption("Hello\nworld")).toEqual([{ kind: "text", text: "Hello\nworld" }]);
  });

  it("treats an unclosed marker as bold to the end of the stream", () => {
    expect(splitVoiceCaption("Paid **PHP 250")).toEqual([
      { kind: "text", text: "Paid " },
      { kind: "bold", text: "PHP 250" },
    ]);
  });

  it("reads an unbalanced trailing marker as the start of a new bold run", () => {
    expect(splitVoiceCaption("**a**b**")).toEqual([
      { kind: "bold", text: "a" },
      { kind: "text", text: "b" },
    ]);
    expect(splitVoiceCaption("***a***")).toEqual([
      { kind: "bold", text: "*a" },
      { kind: "text", text: "*" },
    ]);
  });

  it("drops the sliced asterisk before the caret and keeps the caret as text", () => {
    expect(splitVoiceCaption("*▍")).toEqual([{ kind: "text", text: "▍" }]);
    expect(splitVoiceCaption("**Total** *▍")).toEqual([
      { kind: "bold", text: "Total" },
      { kind: "text", text: " " },
      { kind: "text", text: "▍" },
    ]);
  });
});
