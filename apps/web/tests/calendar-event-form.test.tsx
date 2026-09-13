// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarEventForm } from "../src/components/calendar/CalendarEventForm";

afterEach(() => {
  cleanup();
  // The portal regression test injects its own #root; never let it leak into sibling tests.
  document.getElementById("root")?.remove();
});

describe("CalendarEventForm", () => {
  it("creates an all-day event for the selected date", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarEventForm
        initialDate="2026-08-05"
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Date")).toHaveValue("2026-08-05");
    expect(screen.getByRole("checkbox", { name: /All day/i })).toBeChecked();
    await user.type(screen.getByLabelText("Event title"), "Dentist");
    await user.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Dentist",
        date: "2026-08-05",
        startTime: null,
        endTime: null,
        notes: null,
      }),
    );
  });

  it("validates and submits a timed event", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarEventForm
        initialDate="2026-08-05"
        busy={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Event title"), "Planning session");
    await user.click(screen.getByRole("checkbox", { name: /All day/i }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "10:00" } });
    await user.click(screen.getByRole("button", { name: "Add event" }));

    expect(screen.getByRole("alert")).toHaveTextContent("later than the start time");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "12:00" } });
    await user.type(screen.getByLabelText(/Notes/), "Bring the agenda");
    await user.click(screen.getByRole("button", { name: "Add event" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: "Planning session",
        date: "2026-08-05",
        startTime: "11:00",
        endTime: "12:00",
        notes: "Bring the agenda",
      }),
    );
  });

  it("prefills an event for editing", () => {
    render(
      <CalendarEventForm
        initialDate="2026-08-05"
        item={{
          id: "event-1",
          title: "Project review",
          date: "2026-08-06",
          startTime: "14:00",
          endTime: null,
          notes: "Review milestones",
        }}
        busy={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit event" })).toBeVisible();
    expect(screen.getByLabelText("Event title")).toHaveValue("Project review");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-08-06");
    expect(screen.getByRole("checkbox", { name: /All day/i })).not.toBeChecked();
    expect(screen.getByLabelText("Starts")).toHaveValue("14:00");
    expect(screen.getByLabelText(/Notes/)).toHaveValue("Review milestones");
  });

  it("keeps Tab inside the dialog and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CalendarEventForm
        initialDate="2026-08-05"
        busy={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add event" });
    const close = screen.getByRole("button", { name: "Close event form" });
    const submit = screen.getByRole("button", { name: "Add event" });

    expect(screen.getByLabelText("Event title")).toHaveFocus();

    submit.focus();
    fireEvent.keyDown(submit, { key: "Tab" });
    expect(close).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores Escape while the event is saving", () => {
    const onClose = vi.fn();
    render(
      <CalendarEventForm initialDate="2026-08-05" busy onSubmit={vi.fn()} onClose={onClose} />,
    );

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Add event" }), { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders outside the application root so the root lock cannot disable it", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    render(
      <CalendarEventForm
        initialDate="2026-08-05"
        busy={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
      { container: root },
    );

    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root.inert ?? false).toBe(true);
    expect(root.contains(screen.getByRole("dialog", { name: "Add event" }))).toBe(false);
  });
});
