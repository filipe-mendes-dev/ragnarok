import { afterEach, describe, expect, it, vi } from "vitest";
import { isJobContext, loadLearnedActions, saveLearnedAction } from "../../../src/sidepanel/discovery-storage";

afterEach(() => { vi.unstubAllGlobals(); });

describe("discovery storage", () => {
  it("rejects oversized descriptions, invalid sources, and invalid capture times", () => {
    const context = { jobDescription: "Build software.", sourceUrl: "https://jobs.example.com/job", lastPageUrl: "https://jobs.example.com/job/application", capturedAt: "2026-10-01T10:00:00Z" };
    expect(isJobContext(context)).toBe(true);
    expect(isJobContext({ ...context, jobDescription: "x".repeat(20_001) })).toBe(false);
    expect(isJobContext({ ...context, sourceUrl: "javascript:void(0)" })).toBe(false);
    expect(isJobContext({ ...context, capturedAt: "invalid" })).toBe(false);
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
