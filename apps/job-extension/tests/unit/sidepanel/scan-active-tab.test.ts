import { describe, expect, it, vi } from "vitest";
import { readJobContext } from "../../../src/sidepanel/scan-active-tab";
import { JOB_DESCRIPTION } from "../support/job-context-fixtures";

function mockContextInjection(result: unknown) {
  const executeScript = vi.fn(async () => [{ frameId: 8, result: "Unrelated frame" }, { frameId: 0, result }]);
  const query = vi.fn().mockResolvedValue([{ id: 7 }]);
  const get = vi.fn().mockResolvedValue({ id: 7, url: "https://jobs.example.com/job" });
  vi.stubGlobal("chrome", { tabs: { query, get }, scripting: { executeScript } });
  return { executeScript, query, get };
}

describe("readJobContext", () => {
  it("injects the context script and attaches source metadata to the main-frame text", async () => {
    const { executeScript, query } = mockContextInjection(` ${JOB_DESCRIPTION} `);
    const context = await readJobContext(7);
    expect(context).toEqual({ jobDescription: JOB_DESCRIPTION, sourceUrl: "https://jobs.example.com/job", lastPageUrl: "https://jobs.example.com/job", capturedAt: expect.any(String) });
    expect(Number.isFinite(Date.parse(context?.capturedAt ?? ""))).toBe(true);
    expect(executeScript).toHaveBeenCalledExactlyOnceWith({ target: { tabId: 7 }, files: ["context-script.js"] });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("returns null for empty captured text", async () => {
    mockContextInjection(" \n ");
    await expect(readJobContext(7)).resolves.toBeNull();
  });

  it.each([null, { jobDescription: "Some text" }, "x".repeat(20_001)])("rejects invalid or oversized script output", async (result: unknown) => {
    mockContextInjection(result);
    await expect(readJobContext(7)).rejects.toThrow();
  });

  it("rejects context when the active tab changes during injection", async () => {
    const { query } = mockContextInjection(JOB_DESCRIPTION);
    query.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([{ id: 9 }]);
    await expect(readJobContext(7)).rejects.toThrow("active tab changed");
  });

  it("rejects context when the source URL changes during injection", async () => {
    const { get } = mockContextInjection(JOB_DESCRIPTION);
    get.mockResolvedValueOnce({ id: 7, url: "https://jobs.example.com/job" }).mockResolvedValueOnce({ id: 7, url: "https://jobs.example.com/other" });
    await expect(readJobContext(7)).rejects.toThrow("page changed");
  });

  it("rejects unsupported pages before injecting a script", async () => {
    const { get, executeScript } = mockContextInjection(JOB_DESCRIPTION);
    get.mockResolvedValue({ id: 7, url: "chrome://extensions" });
    await expect(readJobContext(7)).rejects.toThrow("regular web page");
    expect(executeScript).not.toHaveBeenCalled();
  });
});
