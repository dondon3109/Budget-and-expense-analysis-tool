import { monthLabel, parseEventForm, type EventFormValues } from "./event-form";

function validValues(): EventFormValues {
  return {
    title: "Birthday dinner",
    date: "2026-08-20",
    startTime: "18:00",
    endTime: "20:00",
    notes: "With family",
  };
}

describe("calendar event form", () => {
  it("parses a valid event", () => {
    const result = parseEventForm(validValues());
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input).toEqual({
      title: "Birthday dinner",
      date: "2026-08-20",
      startTime: "18:00",
      endTime: "20:00",
      notes: "With family",
    });
  });

  it("allows an all-day event without times or notes", () => {
    const result = parseEventForm({
      ...validValues(),
      startTime: "",
      endTime: "",
      notes: "  ",
    });
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input.startTime).toBeNull();
    expect(result.input.endTime).toBeNull();
    expect(result.input.notes).toBeNull();
  });

  it("trims the title", () => {
    const result = parseEventForm({ ...validValues(), title: "  Party  " });
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input.title).toBe("Party");
  });

  it("rejects an empty title", () => {
    const result = parseEventForm({ ...validValues(), title: "   " });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.title).toBe("string");
  });

  it("rejects an invalid date", () => {
    const result = parseEventForm({ ...validValues(), date: "2026-02-30" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.date).toBe("string");
  });

  it("rejects an end time without a start time", () => {
    const result = parseEventForm({ ...validValues(), startTime: "" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.endTime).toBe("string");
  });

  it("rejects an end time earlier than the start time", () => {
    const result = parseEventForm({
      ...validValues(),
      startTime: "21:00",
      endTime: "20:00",
    });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.endTime).toBe("string");
  });

  it("rejects malformed times", () => {
    const result = parseEventForm({ ...validValues(), startTime: "6pm" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.startTime).toBe("string");
  });

  it("labels the month in long form", () => {
    expect(monthLabel("2026-08-01")).toContain("2026");
  });
});
