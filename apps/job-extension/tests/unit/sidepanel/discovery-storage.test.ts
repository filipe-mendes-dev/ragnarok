import { afterEach, describe, expect, it, vi } from "vitest";
import { clearJobContext, isJobContext, loadJobContext, loadLearnedActions, saveJobContext, saveLearnedAction } from "../../../src/sidepanel/discovery-storage";
import { makeAcceptedContext } from "../support/job-context-fixtures";

afterEach(() => { vi.unstubAllGlobals(); });

describe("discovery storage", () => {
  it("rejects oversized descriptions, invalid sources, and invalid capture times", () => {
    const context = makeAcceptedContext();
    expect(isJobContext(context)).toBe(true);
    expect(isJobContext({ ...context, jobDescription: "x".repeat(20_001) })).toBe(false);
    expect(isJobContext({ ...context, sourceUrl: "javascript:void(0)" })).toBe(false);
    expect(isJobContext({ ...context, capturedAt: "invalid" })).toBe(false);
    expect(isJobContext({ ...context, jobDescription: " " })).toBe(false);
  });

  it("loads the current simple context shape without requiring removed acquisition evidence", async () => {
    const context = makeAcceptedContext();
    vi.stubGlobal("chrome", { storage: { session: { get: async () => ({ "jobContext:7": context }) } } });
    expect(await loadJobContext(7)).toEqual(context);
  });

  it("saves captured context and clears only the current tab's context", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { session: { set, remove } } });
    const context = makeAcceptedContext();
    await saveJobContext(7, context);
    await clearJobContext(7);
    expect(set).toHaveBeenCalledExactlyOnceWith({ "jobContext:7": context });
    expect(remove).toHaveBeenCalledExactlyOnceWith("jobContext:7");
  });

  it("does not reuse malformed or non-normalized learned labels", async () => {
    vi.stubGlobal("chrome", { storage: { local: { get: async () => ({ learnedApplicationActions: [
      { origin: "https://jobs.example.com", label: "join us" }, { origin: "https://jobs.example.com/path", label: "join us" },
      { origin: "https://jobs.example.com", label: "Join Us" }, { label: "apply" }, null,
    ] }) } } });
    expect(await loadLearnedActions()).toEqual([{ origin: "https://jobs.example.com", label: "join us" }]);
  });

  it("bounds saved labels and deduplicates exact origin-label pairs", async () => {
    const actions = Array.from({ length: 100 }, (_, index) => ({ origin: "https://jobs.example.com", label: `join ${index}` }));
    const set = vi.fn<(value: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { get: async () => ({ learnedApplicationActions: actions }), set } } });
    await saveLearnedAction({ origin: "https://jobs.example.com", label: "join 99" });
    expect(set).not.toHaveBeenCalled();
    await saveLearnedAction({ origin: "https://jobs.example.com", label: "join our team" });
    expect(set).toHaveBeenCalledExactlyOnceWith({ learnedApplicationActions: [...actions.slice(1), { origin: "https://jobs.example.com", label: "join our team" }] });
  });
});
