import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserDiscoveryPort } from "../../../src/sidepanel/browser-discovery-port";
import { assertActiveTab, readJobContext, scanTab } from "../../../src/sidepanel/scan-active-tab";
import { makeAction, makeFormScan, makeScan } from "../support/page-scan-fixtures";
import { makeAcceptedContext } from "../support/job-context-fixtures";

vi.mock("../../../src/sidepanel/scan-active-tab", () => ({ assertActiveTab: vi.fn(), readJobContext: vi.fn(), scanTab: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(assertActiveTab).mockResolvedValue(undefined);
  vi.spyOn(console, "dir").mockImplementation(() => {});
});

describe("browser context observation", () => {
  it("does not inject after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createBrowserDiscoveryPort(7, controller.signal).readContext()).rejects.toThrow();
    expect(readJobContext).not.toHaveBeenCalled();
  });

  it("rejects results when cancellation occurs during injection", async () => {
    const controller = new AbortController();
    vi.mocked(readJobContext).mockImplementation(async () => { controller.abort(); return makeAcceptedContext(); });
    await expect(createBrowserDiscoveryPort(7, controller.signal).readContext()).rejects.toThrow();
    expect(scanTab).not.toHaveBeenCalled();
  });
});

describe("backend action selection", () => {
  beforeEach(() => { vi.stubGlobal("chrome", { runtime: { id: "extension-id" } }); });

  it("sends bounded candidate metadata with the existing web session credentials and returns the original action", async () => {
    const action = makeAction({ index: 4, label: "Join our team" });
    const page = makeScan({ pageTitle: "t".repeat(350), jobDescription: "Private job text", actions: [action] });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ actionIndex: 4, probability: 0.94 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await createBrowserDiscoveryPort(7, new AbortController().signal).selectActionWithLlm(page, [action]);
    expect(result).toBe(action);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/api/extension/select-action", expect.objectContaining({
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Ragnarok-Extension-Id": "extension-id" },
    }));
    const body = fetcher.mock.calls[0]?.[1]?.body;
    if (typeof body !== "string") throw new Error("Expected a JSON request body.");
    expect(JSON.parse(body) as unknown).toEqual({ pageTitle: "t".repeat(300), actions: [{ index: 4, label: action.label, kind: "link" }] });
    expect(body).not.toContain("Private job text");
  });

  it("returns null when no action passes the backend threshold", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ actionIndex: null, probability: 0.79 })));
    await expect(createBrowserDiscoveryPort(7, new AbortController().signal).selectActionWithLlm(makeScan(), [makeAction()])).resolves.toBeNull();
  });

  it.each([
    { actionIndex: 0, probability: 1.1 },
    { actionIndex: 0, confidence: 0.9 },
    { actionIndex: 99, probability: 0.9 },
  ])("rejects invalid probability data and indexes outside the supplied candidates", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response)));
    await expect(createBrowserDiscoveryPort(7, new AbortController().signal).selectActionWithLlm(makeScan(), [makeAction()])).rejects.toThrow();
  });

  it("keeps backend authentication and provider failures distinct and includes the request ID", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ errorMessage: "Signed out" }, { status: 401, headers: { "X-Request-Id": "auth-request" } }))
      .mockResolvedValueOnce(Response.json({ errorMessage: "Provider key expired." }, { status: 502, headers: { "X-Request-Id": "provider-request" } }));
    vi.stubGlobal("fetch", fetcher);
    const port = createBrowserDiscoveryPort(7, new AbortController().signal);
    await expect(port.selectActionWithLlm(makeScan(), [makeAction()])).rejects.toThrow("Sign in to RAGnarok");
    await expect(port.selectActionWithLlm(makeScan(), [makeAction()])).rejects.toThrow("Provider key expired. Request ID: provider-request.");
  });

  it("does not return a selected action after the user switches tabs during the request", async () => {
    vi.mocked(assertActiveTab).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("The active tab changed."));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ actionIndex: 0, probability: 0.9 })));
    await expect(createBrowserDiscoveryPort(7, new AbortController().signal).selectActionWithLlm(makeScan(), [makeAction()])).rejects.toThrow("active tab changed");
  });
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
