import { describe, expect, it, vi } from "vitest";
import { createDiscoveryGraph, MAX_DISCOVERY_CLICKS } from "../../../src/discovery/discovery-graph";
import { createDiscoverySession, type DiscoveryPort } from "../../../src/discovery/session";
import type { ApplicationForm } from "../../../src/shared/application-form";
import { pageFingerprint } from "../../../src/shared/discovery-rules";
import { makeAction, makeFormScan, makeScan } from "../support/application-fixtures";

function makePort(scans: ApplicationForm[]): DiscoveryPort {
  let index = 0;
  return {
    scan: vi.fn(async () => {
      const scan = scans[Math.min(index, scans.length - 1)];
      index += 1;
      if (!scan) throw new Error("No fixture scan available.");
      return scan;
    }),
    click: vi.fn<DiscoveryPort["click"]>().mockResolvedValue(undefined),
    waitForChange: vi.fn<DiscoveryPort["waitForChange"]>().mockResolvedValue(undefined),
    saveContext: vi.fn<DiscoveryPort["saveContext"]>().mockResolvedValue(undefined),
    learnAction: vi.fn<DiscoveryPort["learnAction"]>().mockResolvedValue(undefined),
  };
}

function runConfig() { return { configurable: { thread_id: crypto.randomUUID() }, recursionLimit: 50 }; }

describe("application discovery graph", () => {
  it("stops at an existing form without clicking any action", async () => {
    const port = makePort([makeFormScan({ actions: [makeAction({ label: "Submit application" })] })]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.status).toBe("found");
    expect(result.session.assessment?.cvIndex).toBe(2);
    expect(port.click).not.toHaveBeenCalled();
  });

  it("accepts complete form evidence before rejecting truncation, click limits, or visited states", async () => {
    const scan = makeFormScan({ truncated: true, actionsTruncated: true, actions: [makeAction()] });
    const port = makePort([scan]);
    const session = { ...createDiscoverySession(7), clicks: MAX_DISCOVERY_CLICKS, visited: [pageFingerprint(scan)] };
    const result = await createDiscoveryGraph(port).invoke({ session }, runConfig());
    expect(result.session.status).toBe("found");
    expect(result.session.assessment?.outcome).toBe("found");
    expect(port.click).not.toHaveBeenCalled();
  });

  it("retains the first description when a later application route has different job text", async () => {
    const overview = makeScan({ jobDescription: "Original job description.", actions: [makeAction()] });
    const application = makeFormScan({ jobDescription: "Application page text." });
    const port = makePort([overview, application]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.context).toMatchObject({
      jobDescription: overview.jobDescription,
      sourceUrl: overview.pageUrl,
      lastPageUrl: application.pageUrl,
    });
    expect(port.saveContext).toHaveBeenCalledTimes(2);
  });

  it("navigates deterministically and preserves the overview description on the form route", async () => {
    const overview = makeScan({ jobDescription: "Build systems for our engineering team.", actions: [makeAction()] });
    const port = makePort([overview, makeFormScan()]);
    const graph = createDiscoveryGraph(port);
    const stages: string[] = [];
    let description = "";
    const stream = await graph.stream({ session: createDiscoverySession(7) }, { ...runConfig(), streamMode: "values" });
    for await (const state of stream) {
      if (!("session" in state)) continue;
      stages.push(state.session.stage);
      description = state.session.context?.jobDescription ?? "";
    }
    expect(stages).toEqual(["start", "scan", "assess", "choose", "click", "wait", "scan", "assess", "assess"]);
    expect(description).toBe(overview.jobDescription);
    expect(port.click).toHaveBeenCalledExactlyOnceWith(overview, overview.actions[0]);
    expect(port.waitForChange).toHaveBeenCalledExactlyOnceWith(overview);
    expect(port.saveContext).toHaveBeenLastCalledWith(expect.objectContaining({ sourceUrl: overview.pageUrl, lastPageUrl: "https://jobs.example.com/job/application" }));
  });

  it("pauses for an unknown action and learns it only after resume directly reveals a form", async () => {
    const overview = makeScan({ actions: [makeAction({ label: "Join our team" })] });
    const port = makePort([overview, makeFormScan()]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const paused = await graph.invoke({ session: createDiscoverySession(7) }, config);
    expect((await graph.getState(config)).next).toEqual(["manual"]);
    expect(paused.session.status).toBe("paused");
    expect(port.click).not.toHaveBeenCalled();
    await graph.updateState(config, { session: { ...paused.session, manualResponse: 0 } });
    const result = await graph.invoke(null, config);
    expect(result.session.status).toBe("found");
    expect(result.session.clicks).toBe(1);
    expect(port.click).toHaveBeenCalledTimes(1);
    expect(port.learnAction).toHaveBeenCalledExactlyOnceWith({ origin: overview.pageOrigin, label: "join our team" });
  });

  it("rejects unknown action IDs on resume", async () => {
    const port = makePort([makeScan({ actions: [makeAction({ label: "Join us" })] })]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const paused = await graph.invoke({ session: createDiscoverySession(7) }, config);
    await graph.updateState(config, { session: { ...paused.session, manualResponse: 99 } });
    const result = await graph.invoke(null, config);
    expect(result.session.status).toBe("stopped");
    expect(port.click).not.toHaveBeenCalled();
  });

  it("cancels a paused run without clicking", async () => {
    const port = makePort([makeScan({ actions: [makeAction({ label: "Join us" })] })]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const paused = await graph.invoke({ session: createDiscoverySession(7) }, config);
    await graph.updateState(config, { session: { ...paused.session, manualResponse: null } });
    const result = await graph.invoke(null, config);
    expect(result.session.message).toBe("Discovery cancelled.");
    expect(port.click).not.toHaveBeenCalled();
  });

  it("does not learn an intermediate action when the next known action reveals the form", async () => {
    const port = makePort([makeScan({ actions: [makeAction({ label: "Join us" })] }),
      makeScan({ pageUrl: "https://jobs.example.com/job/details", actions: [makeAction()] }), makeFormScan()]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const paused = await graph.invoke({ session: createDiscoverySession(7) }, config);
    await graph.updateState(config, { session: { ...paused.session, manualResponse: 0 } });
    const result = await graph.invoke(null, config);
    expect(result.session.status).toBe("found");
    expect(result.session.clicks).toBe(2);
    expect(port.learnAction).not.toHaveBeenCalled();
  });

  it("stops on partial or incomplete evidence before navigation", async () => {
    const form = makeFormScan();
    for (const scan of [{ ...form, fields: form.fields.slice(0, 2), actions: [makeAction()] }, makeScan({ actions: [makeAction()], actionsTruncated: true })]) {
      const port = makePort([scan]);
      const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
      expect(result.session.status).toBe("stopped");
      expect(port.click).not.toHaveBeenCalled();
    }
  });

  it("stops on page cycles and enforces the click budget", async () => {
    const overview = makeScan({ actions: [makeAction()] });
    const cyclingPort = makePort([overview]);
    const cycling = await createDiscoveryGraph(cyclingPort).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(cycling.session.message).toContain("already visited");
    expect(cyclingPort.click).toHaveBeenCalledTimes(1);
    const port = makePort(Array.from({ length: 6 }, (_, index) => ({ ...overview, pageUrl: `${overview.pageUrl}/${index}` })));
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.message).toContain("five-click limit");
    expect(port.click).toHaveBeenCalledTimes(MAX_DISCOVERY_CLICKS);
  });

  it("stops on a failed click or readiness timeout without retrying the side effect", async () => {
    for (const failingMethod of ["click", "waitForChange"] as const) {
      const port = makePort([makeScan({ actions: [makeAction()] })]);
      vi.mocked(port[failingMethod]).mockRejectedValue(new Error("Page action failed."));
      const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
      expect(result.session.status).toBe("stopped");
      expect(result.session.message).toBe("Page action failed.");
      expect(port.click).toHaveBeenCalledTimes(1);
      expect(port.learnAction).not.toHaveBeenCalled();
    }
  });

  it("does not reuse a saved description for a different job", async () => {
    const port = makePort([makeFormScan()]);
    const context = { jobDescription: "A different job.", sourceUrl: "https://jobs.example.com/other", lastPageUrl: "https://jobs.example.com/other/application", capturedAt: "2026-10-01T10:00:00Z" };
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7, [], context) }, runConfig());
    expect(result.session.context).toBeNull();
    expect(port.saveContext).not.toHaveBeenCalled();
  });

  it("stops when navigation moves to another origin", async () => {
    const port = makePort([makeScan({ actions: [makeAction()] }), makeFormScan({ pageOrigin: "https://other.example.com", pageUrl: "https://other.example.com/application" })]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.status).toBe("stopped");
    expect(result.session.message).toContain("changed origin");
    expect(port.learnAction).not.toHaveBeenCalled();
  });
});
