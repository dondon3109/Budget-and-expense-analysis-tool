// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectivityStatus } from "../src/pwa/ConnectivityStatus";

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "onLine");
});

describe("ConnectivityStatus", () => {
  it("announces that authenticated operations are not completed or saved while offline", async () => {
    setOnline(true);
    render(<ConnectivityStatus />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    setOnline(false);
    await act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("status")).toHaveTextContent("Internet connection required");
    expect(screen.getByRole("status")).toHaveTextContent(/cannot be completed or saved/i);

    setOnline(true);
    await act(() => window.dispatchEvent(new Event("online")));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
