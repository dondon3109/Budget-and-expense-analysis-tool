import { describe, expect, it } from "vitest";
import { renderVoiceCaptionContent } from "../src/components/assistant/renderVoiceCaption";

describe("renderVoiceCaptionContent", () => {
  it("returns empty array for empty string", () => {
    expect(renderVoiceCaptionContent("")).toEqual([]);
  });

  it("returns plain text unchanged when no bold markers are present", () => {
    expect(renderVoiceCaptionContent("Hello world")).toEqual(["Hello world"]);
  });

  it("parses single bold tag into strong element", () => {
    const parts = renderVoiceCaptionContent("You spent **PHP 1,250** this month.");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("You spent ");
    expect(parts[1]).toMatchObject({
      type: "strong",
      props: {
        className: "assistant-voice-bold",
        children: "PHP 1,250",
      },
    });
    expect(parts[2]).toBe(" this month.");
  });

  it("parses multiple bold tags correctly", () => {
    const parts = renderVoiceCaptionContent("**Total:** **$50.00** across **3** items");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toMatchObject({
      type: "strong",
      props: { children: "Total:" },
    });
    expect(parts[1]).toBe(" ");
    expect(parts[2]).toMatchObject({
      type: "strong",
      props: { children: "$50.00" },
    });
    expect(parts[3]).toBe(" across ");
    expect(parts[4]).toMatchObject({
      type: "strong",
      props: { children: "3" },
    });
    expect(parts[5]).toBe(" items");
  });

  it("handles unclosed bold tag during typewriter streaming without showing raw asterisks", () => {
    const parts = renderVoiceCaptionContent("You spent **PHP 1,▍");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("You spent ");
    expect(parts[1]).toMatchObject({
      type: "strong",
      props: { children: "PHP 1,▍" },
    });
  });

  it("cleans up solitary asterisk delimiter slice before caret", () => {
    const parts = renderVoiceCaptionContent("You spent *▍");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("You spent ");
    expect(parts[1]).toBe("▍");
  });
});
