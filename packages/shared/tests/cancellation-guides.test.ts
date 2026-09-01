import { describe, expect, it } from "vitest";
import { CANCELLATION_GUIDES, findCancellationGuide } from "../src/cancellationGuides";

describe("cancellation guides database and matching", () => {
  it("contains core Philippine and global providers", () => {
    expect(CANCELLATION_GUIDES.length).toBeGreaterThanOrEqual(10);
    expect(CANCELLATION_GUIDES.some((g) => g.id === "gcash")).toBe(true);
    expect(CANCELLATION_GUIDES.some((g) => g.id === "maya")).toBe(true);
    expect(CANCELLATION_GUIDES.some((g) => g.id === "netflix")).toBe(true);
    expect(CANCELLATION_GUIDES.some((g) => g.id === "spotify")).toBe(true);
    expect(CANCELLATION_GUIDES.some((g) => g.id === "apple")).toBe(true);
  });

  it("matches by exact or fuzzy service name", () => {
    expect(findCancellationGuide("Netflix Standard")?.id).toBe("netflix");
    expect(findCancellationGuide("Spotify Premium Duo")?.id).toBe("spotify");
    expect(findCancellationGuide("GCash AutoPay - App")?.id).toBe("gcash");
    expect(findCancellationGuide("Maya Subscriptions")?.id).toBe("maya");
    expect(findCancellationGuide("Apple iCloud 200GB")?.id).toBe("apple");
    expect(findCancellationGuide("Canva Pro Monthly")?.id).toBe("canva");
    expect(findCancellationGuide("Adobe Creative Cloud Photography")?.id).toBe("adobe");
    expect(findCancellationGuide("ChatGPT Plus")?.id).toBe("chatgpt");
  });

  it("returns null safely for unknown or empty subscriptions", () => {
    expect(findCancellationGuide("")).toBeNull();
    expect(findCancellationGuide("   ")).toBeNull();
    expect(findCancellationGuide("Unknown Super Rare Gym 9999")).toBeNull();
  });
});
