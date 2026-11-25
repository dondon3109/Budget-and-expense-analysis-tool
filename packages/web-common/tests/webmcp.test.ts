// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  isAgentSubmit,
  readFormText,
  respondToAgent,
  webMcpFormProps,
  webMcpParamProps,
} from "../src/webmcp/declarative";

describe("declarative WebMCP helpers", () => {
  it("builds form and parameter attributes with optional autosubmit", () => {
    expect(
      webMcpFormProps({
        name: "filter-transactions",
        description: "Filter transactions.",
        autoSubmit: true,
      }),
    ).toEqual({
      toolname: "filter-transactions",
      tooldescription: "Filter transactions.",
      toolautosubmit: "",
    });

    expect(
      webMcpFormProps({
        name: "save-debt",
        description: "Prepare a debt.",
      }),
    ).toEqual({
      toolname: "save-debt",
      tooldescription: "Prepare a debt.",
    });

    expect(webMcpParamProps("Start date in YYYY-MM-DD format.")).toEqual({
      toolparamdescription: "Start date in YYYY-MM-DD format.",
    });
  });

  it("reads agentInvoked and calls respondWith across DOM and React-like events", async () => {
    const respondWith = vi.fn();
    const domEvent = Object.assign(new Event("submit"), {
      agentInvoked: true,
      respondWith,
    });

    expect(isAgentSubmit(domEvent)).toBe(true);
    expect(isAgentSubmit({ nativeEvent: domEvent })).toBe(true);

    respondToAgent({ nativeEvent: domEvent }, { total: 3 });

    expect(respondWith).toHaveBeenCalledOnce();
    await expect(respondWith.mock.calls[0]![0]).resolves.toEqual({ total: 3 });
  });

  it("treats ordinary submits without agentInvoked as human submits", () => {
    const humanEvent = new Event("submit");
    expect(isAgentSubmit(humanEvent)).toBe(false);
    expect(() => respondToAgent(humanEvent, { ok: true })).not.toThrow();
  });

  it("reads string entries safely from FormData and skips non-string files", () => {
    const formData = new FormData();
    formData.set("title", "Dentist");
    formData.set("receipt", new File(["data"], "receipt.txt"));

    expect(readFormText(formData, "title")).toBe("Dentist");
    expect(readFormText(formData, "missing", "fallback")).toBe("fallback");
    expect(readFormText(formData, "receipt", "fallback")).toBe("fallback");
  });
});
