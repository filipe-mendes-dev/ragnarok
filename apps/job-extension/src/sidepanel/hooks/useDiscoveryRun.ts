import { useEffect, useRef, useState } from "react";
import type { createDiscoveryGraph } from "../../discovery/discovery-graph";
import { isWaitingForContextDecision, isWaitingForManualSelection } from "../../discovery/guards";
import { createDiscoverySession, type DiscoverySession } from "../../discovery/session";
import { createBrowserDiscoveryPort } from "../browser-discovery-port";
import { loadLearnedActions } from "../discovery-storage";

interface DiscoveryRun {
  graph: ReturnType<typeof createDiscoveryGraph>;
  threadId: string;
  controller: AbortController;
}

interface DiscoveryRunController {
  hasRun: boolean;
  start: (tabId: number) => Promise<void>;
  selectAction: (session: DiscoverySession | null, index: number | null) => Promise<void>;
  decideContext: (session: DiscoverySession | null, decision: DiscoverySession["contextResponse"]) => Promise<void>;
  stop: () => void;
  discard: () => void;
}

export function useDiscoveryRun(onSession: (session: DiscoverySession) => void): DiscoveryRunController {
  const run = useRef<DiscoveryRun | null>(null);
  const panelOpen = useRef(true);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    panelOpen.current = true;
    return () => {
      panelOpen.current = false;
      run.current?.controller.abort();
    };
  }, []);

  function stop(): void {
    run.current?.controller.abort();
  }

  function discard(): void {
    run.current = null;
    setHasRun(false);
  }

  async function streamRun(activeRun: DiscoveryRun, input: Parameters<DiscoveryRun["graph"]["stream"]>[0]): Promise<void> {
    const stream = await activeRun.graph.stream(input, {
      configurable: { thread_id: activeRun.threadId },
      streamMode: "values",
      recursionLimit: 50,
      signal: activeRun.controller.signal,
    });
    for await (const value of stream) {
      if ("session" in value) onSession(value.session);
    }
  }

  async function start(tabId: number): Promise<void> {
    const [learned, { createDiscoveryGraph }] = await Promise.all([
      loadLearnedActions(),
      import("../../discovery/discovery-graph"),
    ]);
    if (!panelOpen.current) return;
    const controller = new AbortController();
    const activeRun: DiscoveryRun = {
      graph: createDiscoveryGraph(createBrowserDiscoveryPort(tabId, controller.signal)),
      threadId: crypto.randomUUID(),
      controller,
    };
    run.current = activeRun;
    setHasRun(true);
    await streamRun(activeRun, { session: createDiscoverySession(tabId, learned) });
  }

  async function resumeRun(activeRun: DiscoveryRun, session: DiscoverySession): Promise<void> {
    const config = { configurable: { thread_id: activeRun.threadId } };
    await activeRun.graph.updateState(config, { session });
    await streamRun(activeRun, null);
  }

  async function selectAction(session: DiscoverySession | null, index: number | null): Promise<void> {
    const activeRun = run.current;
    if (!activeRun) return;
    if (!isWaitingForManualSelection(session)) throw new Error("Discovery is not waiting for an action.");
    await resumeRun(activeRun, { ...session, manualResponse: index });
  }

  async function decideContext(session: DiscoverySession | null, decision: DiscoverySession["contextResponse"]): Promise<void> {
    const activeRun = run.current;
    if (!activeRun) return;
    if (!isWaitingForContextDecision(session)) throw new Error("Discovery is not waiting for a context decision.");
    await resumeRun(activeRun, { ...session, contextResponse: decision });
  }

  return { hasRun, start, selectAction, decideContext, stop, discard };
}
