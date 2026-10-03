import { describe, expect, it, vi } from "vitest";
import { createDiscoveryGraph, MAX_DISCOVERY_CLICKS } from "../../../src/discovery/discovery-graph";
import { createDiscoverySession, type DiscoveryPort } from "../../../src/discovery/session";
import type { PageScan } from "../../../src/shared/page-scan";
import { pageFingerprint } from "../../../src/shared/discovery-rules";
import { makeAction, makeFormScan, makeScan } from "../support/page-scan-fixtures";
import { JOB_DESCRIPTION, makeAcceptedContext } from "../support/job-context-fixtures";
import type { JobContext } from "../../../src/shared/job-context";

function makePort(scans: PageScan[], contexts: (JobContext | null)[] = [makeAcceptedContext({
  jobDescription: scans[0]?.jobDescription || JOB_DESCRIPTION,
  sourceUrl: scans[0]?.pageUrl ?? "https://jobs.example.com/job",
  lastPageUrl: scans[0]?.pageUrl ?? "https://jobs.example.com/job",
})]): DiscoveryPort {
  let index = 0;
  let contextIndex = 0;
  return {
    readContext: vi.fn(async () => {
      const context = contexts[Math.min(contextIndex, contexts.length - 1)];
      contextIndex += 1;
      if (context === undefined) throw new Error("No context fixture available.");
      return context;
    }),
    scan: vi.fn(async () => {
      const scan = scans[Math.min(index, scans.length - 1)];
      index += 1;
      if (!scan) throw new Error("No fixture scan available.");
      return scan;
    }),
    selectActionWithLlm: vi.fn<DiscoveryPort["selectActionWithLlm"]>().mockResolvedValue(null),
    click: vi.fn<DiscoveryPort["click"]>().mockResolvedValue(undefined),
    waitForChange: vi.fn<DiscoveryPort["waitForChange"]>().mockResolvedValue(undefined),
    saveContext: vi.fn<DiscoveryPort["saveContext"]>().mockResolvedValue(undefined),
    clearContext: vi.fn<DiscoveryPort["clearContext"]>().mockResolvedValue(undefined),
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
    const overview = makeScan({ jobDescription: JOB_DESCRIPTION, actions: [makeAction()] });
    const application = makeFormScan({ jobDescription: "Application page text." });
    const port = makePort([overview, application]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.context).toMatchObject({
      jobDescription: overview.jobDescription,
      sourceUrl: overview.pageUrl,
      lastPageUrl: application.pageUrl,
    });
    expect(port.saveContext).toHaveBeenCalledTimes(3);
  });

  it("navigates deterministically and preserves the overview description on the form route", async () => {
    const overview = makeScan({ jobDescription: JOB_DESCRIPTION, actions: [makeAction()] });
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
    expect(stages).toEqual(["start", "context", "scan", "assess", "choose", "click", "wait", "scan", "assess", "assess"]);
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

  it("continues action discovery from partial form evidence", async () => {
    const form = makeFormScan();
    const partial = { ...form, fields: form.fields.slice(0, 2), actions: [makeAction()] };
    const port = makePort([partial, form]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.status).toBe("found");
    expect(port.click).toHaveBeenCalledExactlyOnceWith(partial, partial.actions[0]);
  });

  it("stops on incomplete scans before navigation", async () => {
    const port = makePort([makeScan({ actions: [makeAction()], actionsTruncated: true })]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.status).toBe("stopped");
    expect(port.click).not.toHaveBeenCalled();
    expect(port.selectActionWithLlm).not.toHaveBeenCalled();
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
    const port = makePort([makeFormScan()], [null]);
    const context = makeAcceptedContext({ sourceUrl: "https://jobs.example.com/other" });
    const result = await createDiscoveryGraph(port).invoke({ session: { ...createDiscoverySession(7), context } }, runConfig());
    expect(result.session.context).toBeNull();
    expect(result.session.pauseReason).toBe("context");
    expect(port.saveContext).not.toHaveBeenCalled();
    expect(port.scan).not.toHaveBeenCalled();
  });

  it("stops when navigation moves to another origin", async () => {
    const port = makePort([makeScan({ actions: [makeAction()] }), makeFormScan({ pageOrigin: "https://other.example.com", pageUrl: "https://other.example.com/application" })]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.status).toBe("stopped");
    expect(result.session.message).toContain("changed origin");
    expect(port.learnAction).not.toHaveBeenCalled();
  });
});

describe("LLM action fallback", () => {
  it("skips the provider when several recognized labels have a deterministic priority", async () => {
    const overview = makeScan({ actions: [makeAction({ index: 3, label: "Application" }), makeAction({ index: 4, label: "Apply for this Job" })] });
    const port = makePort([overview, makeFormScan()]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.status).toBe("found");
    expect(port.click).toHaveBeenCalledExactlyOnceWith(overview, overview.actions[1]);
    expect(port.selectActionWithLlm).not.toHaveBeenCalled();
  });

  it("clicks a provider-selected candidate through the existing navigation flow without learning it", async () => {
    const action = makeAction({ label: "Join our team" });
    const overview = makeScan({ actions: [action] });
    const port = makePort([overview, makeFormScan()]);
    vi.mocked(port.selectActionWithLlm).mockResolvedValue(action);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session).toMatchObject({ status: "found", selectionSource: "llm", clicks: 1 });
    expect(port.selectActionWithLlm).toHaveBeenCalledExactlyOnceWith(overview, [action]);
    expect(port.click).toHaveBeenCalledExactlyOnceWith(overview, action);
    expect(port.waitForChange).toHaveBeenCalledExactlyOnceWith(overview);
    expect(port.learnAction).not.toHaveBeenCalled();
  });

  it.each(["below threshold", "provider failure"])("pauses before manual selection on %s", async (outcome) => {
    const overview = makeScan({ actions: [makeAction({ label: "Join our team" })] });
    const port = makePort([overview]);
    if (outcome === "provider failure") vi.mocked(port.selectActionWithLlm).mockRejectedValue(new Error("Provider unavailable."));
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const result = await graph.invoke({ session: createDiscoverySession(7) }, config);
    expect(result.session).toMatchObject({ status: "paused", pauseReason: "action", stage: "llmActionChoice", candidates: overview.actions });
    expect((await graph.getState(config)).next).toEqual(["manual"]);
    expect(port.selectActionWithLlm).toHaveBeenCalledTimes(1);
    expect(port.click).not.toHaveBeenCalled();
  });
});

describe("job context as the first graph phase", () => {
  it("acquires original context before inspecting the application controls", async () => {
    const port = makePort([makeFormScan()]);
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session.contextSkipped).toBe(false);
    expect(result.session.context?.jobDescription).toBe(JOB_DESCRIPTION);
    expect(vi.mocked(port.readContext).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(port.scan).mock.invocationCallOrder[0] ?? 0);
  });

  it("pauses before any application scan or click when context is missing", async () => {
    const port = makePort([makeFormScan()], [null]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const result = await graph.invoke({ session: createDiscoverySession(7) }, config);
    expect(result.session).toMatchObject({ status: "paused", pauseReason: "context", context: null });
    expect((await graph.getState(config)).next).toEqual(["contextDecision"]);
    expect(port.scan).not.toHaveBeenCalled();
    expect(port.click).not.toHaveBeenCalled();
  });

  it("continues only after explicit skip and never fills context from later raw scan text", async () => {
    const port = makePort([makeScan({ actions: [makeAction()] }), makeFormScan({ jobDescription: JOB_DESCRIPTION })], [null]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const paused = await graph.invoke({ session: createDiscoverySession(7) }, config);
    await graph.updateState(config, { session: { ...paused.session, contextResponse: "skip" } });
    const result = await graph.invoke(null, config);
    expect(result.session).toMatchObject({ status: "found", contextSkipped: true, context: null });
    expect(port.readContext).toHaveBeenCalledTimes(1);
    expect(port.click).toHaveBeenCalledTimes(1);
    expect(port.saveContext).not.toHaveBeenCalled();
    expect(port.clearContext).toHaveBeenCalledTimes(1);
  });

  it("recollects context after retry before entering application discovery", async () => {
    const pageUrl = "https://jobs.example.com/job/application";
    const port = makePort([makeFormScan()], [null, makeAcceptedContext({ sourceUrl: pageUrl, lastPageUrl: pageUrl })]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const paused = await graph.invoke({ session: createDiscoverySession(7) }, config);
    await graph.updateState(config, { session: { ...paused.session, contextResponse: "retry" } });
    const result = await graph.invoke(null, config);
    expect(result.session).toMatchObject({ status: "found", contextSkipped: false, pauseReason: null });
    expect(result.session.context?.sourceUrl).toBe(pageUrl);
    expect(port.readContext).toHaveBeenCalledTimes(2);
    expect(port.scan).toHaveBeenCalledTimes(1);
  });

  it("pauses again after an unsuccessful retry without an automatic retry loop", async () => {
    const port = makePort([makeFormScan()], [null]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    const paused = await graph.invoke({ session: createDiscoverySession(7) }, config);
    await graph.updateState(config, { session: { ...paused.session, contextResponse: "retry" } });
    const result = await graph.invoke(null, config);
    expect(result.session.status).toBe("paused");
    expect((await graph.getState(config)).next).toEqual(["contextDecision"]);
    expect(port.readContext).toHaveBeenCalledTimes(2);
    expect(port.scan).not.toHaveBeenCalled();
  });

  it("cancels a context pause without entering the application flow", async () => {
    const port = makePort([makeFormScan()], [null]);
    const graph = createDiscoveryGraph(port);
    const config = runConfig();
    await graph.invoke({ session: createDiscoverySession(7) }, config);
    const result = await graph.invoke(null, config);
    expect(result.session.status).toBe("stopped");
    expect(port.scan).not.toHaveBeenCalled();
  });

  it("reports technical observation failures without pretending the description is absent", async () => {
    const port = makePort([makeFormScan()]);
    vi.mocked(port.readContext).mockRejectedValue(new Error("Page access denied."));
    const result = await createDiscoveryGraph(port).invoke({ session: createDiscoverySession(7) }, runConfig());
    expect(result.session).toMatchObject({ status: "stopped", stage: "context", message: "Page access denied.", context: null });
    expect(port.clearContext).not.toHaveBeenCalled();
    expect(port.scan).not.toHaveBeenCalled();
  });
});
