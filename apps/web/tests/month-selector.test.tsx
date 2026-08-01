// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MonthSelector } from "../src/components/month/MonthSelector";

afterEach(cleanup);

function ControlledSelector({ max }: { max?: string }) {
  const [month, setMonth] = useState("2026-07");
  return <MonthSelector label="Report month" value={month} max={max} onChange={setMonth} />;
}

describe("MonthSelector", () => {
  it("opens from its full-month trigger and returns focus after selection", () => {
    render(<ControlledSelector />);

    const trigger = screen.getByRole("button", { name: "Report month: July 2026" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Choose report month" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "June 2026" }));

    expect(screen.getByRole("button", { name: "Report month: June 2026" })).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Choose report month" })).not.toBeInTheDocument();
  });

  it("closes on Escape without changing the selected month", () => {
    render(<ControlledSelector />);

    const trigger = screen.getByRole("button", { name: "Report month: July 2026" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("disables months beyond its supplied maximum", () => {
    const onChange = vi.fn();
    render(<MonthSelector label="Report month" value="2026-07" max="2026-08" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Report month: July 2026" }));

    expect(screen.getByRole("button", { name: "September 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show 2027" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "August 2026" }));
    expect(onChange).toHaveBeenCalledWith("2026-08");
  });
});
