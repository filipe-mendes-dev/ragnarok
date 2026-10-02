import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserDiscoveryPort } from "../../../src/sidepanel/browser-discovery-port";
import { assertActiveTab, scanTab } from "../../../src/sidepanel/scan-active-tab";
import { makeFormScan, makeScan } from "../support/application-fixtures";

vi.mock("../../../src/sidepanel/scan-active-tab", () => ({ assertActiveTab: vi.fn(), scanTab: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(assertActiveTab).mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("browser discovery readiness", () => {
  it("waits for changed and stable scans rather than a URL change alone", async () => {
    const before = makeScan();
    const after = makeFormScan();
    vi.mocked(scanTab).mockResolvedValueOnce(before).mockResolvedValue(after);
    const operation = createBrowserDiscoveryPort(7, new AbortController().signal).waitForChange(before);
    await vi.advanceTimersByTimeAsync(1600);
    await operation;
    expect(scanTab).toHaveBeenCalledTimes(4);
  });

  it("times out an action that makes no observable progress", async () => {
    const before = makeScan();
    vi.mocked(scanTab).mockResolvedValue(before);
    const operation = createBrowserDiscoveryPort(7, new AbortController().signal).waitForChange(before);
    const rejected = expect(operation).rejects.toThrow("no observable page change");
    await vi.advanceTimersByTimeAsync(12_000);
    await rejected;
  });

  it("stops waiting when the user switches tabs", async () => {
    vi.mocked(assertActiveTab).mockRejectedValue(new Error("The active tab changed."));
    const operation = createBrowserDiscoveryPort(7, new AbortController().signal).waitForChange(makeScan());
    const rejected = expect(operation).rejects.toThrow("active tab changed");
    await vi.advanceTimersByTimeAsync(400);
    await rejected;
    expect(scanTab).not.toHaveBeenCalled();
  });

  it("cancels pending waits without another scan", async () => {
    const controller = new AbortController();
    const operation = createBrowserDiscoveryPort(7, controller.signal).waitForChange(makeScan());
    const rejected = expect(operation).rejects.toThrow("cancelled");
    controller.abort();
    await rejected;
    expect(scanTab).not.toHaveBeenCalled();
  });
});
