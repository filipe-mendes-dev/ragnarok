import { useEffect, useRef, useState } from "react";
import type { DiscoverySession, JobContext } from "../../discovery/session";
import type { PageScan } from "../../shared/page-scan";
import { clearJobContext, loadJobContext, saveJobContext } from "../discovery-storage";
import { getActiveTabId, readJobContext, scanTab } from "../scan-active-tab";
import { useDiscoveryRun } from "./useDiscoveryRun";

interface SidepanelState {
  scan: PageScan | null;
  busy: boolean;
  status: string;
  session: DiscoverySession | null;
  context: JobContext | null;
  trace: string[];
  canStopDiscovery: boolean;
}

interface SidepanelActions {
  scanPage: () => Promise<void>;
  discover: () => Promise<void>;
  selectAction: (index: number | null) => Promise<void>;
  decideContext: (decision: DiscoverySession["contextResponse"]) => Promise<void>;
  stopDiscovery: () => void;
}

interface SidepanelController {
  state: SidepanelState;
  actions: SidepanelActions;
}

function appendDiscoveryTrace(entries: string[], session: DiscoverySession): string[] {
  const entry = `${session.stage}: ${session.message}`;
  if (entries[entries.length - 1] === entry) return entries;
  return [...entries, entry].slice(-50);
}

function getScanStatusMessage(scan: PageScan): string {
  const message = `Found ${scan.fields.length} fields and ${scan.actions.length} actions`;
  if (scan.truncated || scan.actionsTruncated) return `${message} (more may be present).`;
  return `${message}.`;
}

export function useSidepanel(): SidepanelController {
  const [scan, setScan] = useState<PageScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Open a job application page to begin.");
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const [context, setContext] = useState<JobContext | null>(null);
  const [trace, setTrace] = useState<string[]>([]);
  const operationBusy = useRef(false);
  const discovery = useDiscoveryRun(updateDiscoverySession);

  useEffect(() => {
    let mounted = true;

    async function restoreJobContext(): Promise<void> {
      const tabId = await getActiveTabId();
      const saved = await loadJobContext(tabId);
      const tab = await chrome.tabs.get(tabId);
      if (!mounted || saved?.lastPageUrl !== tab.url) return;
      setContext(saved);
    }

    void restoreJobContext().catch((error: unknown) => {
      console.dir({ level: "error", message: "Could not restore job context", error }, { depth: null });
    });
    return () => { mounted = false; };
  }, []);

  function updateDiscoverySession(current: DiscoverySession): void {
    setSession(current);
    setContext(current.context);
    setScan(current.scan);
    setStatus(current.message);
    setTrace((entries) => appendDiscoveryTrace(entries, current));
  }

  function beginOperation(): boolean {
    if (operationBusy.current) return false;
    operationBusy.current = true;
    setBusy(true);
    return true;
  }

  function finishOperation(): void {
    operationBusy.current = false;
    setBusy(false);
  }

  function resetDiscovery(): void {
    discovery.stop();
    discovery.discard();
    setSession(null);
    setContext(null);
    setTrace([]);
  }

  function reportDiscoveryFailure(error: unknown, fallback: string): void {
    discovery.discard();
    setSession((current) => current ? { ...current, status: "stopped" } : null);
    setStatus(error instanceof Error ? error.message : fallback);
  }

  async function scanPage(): Promise<void> {
    if (!beginOperation()) return;
    resetDiscovery();
    setStatus("Scanning this page...");
    try {
      const tabId = await getActiveTabId();
      const captured = await readJobContext(tabId);
      const result = await scanTab(tabId);
      if (captured && result.pageUrl !== captured.sourceUrl) throw new Error("The page changed during inspection. Scan again.");
      setScan(result);
      setContext(captured);
      if (captured) await saveJobContext(tabId, captured);
      else await clearJobContext(tabId);
      setStatus(`${getScanStatusMessage(result)} ${captured ? "Captured job text." : "No visible job text found."}`);
    } catch (error: unknown) {
      console.dir({ level: "error", message: "Page scan failed", error }, { depth: null });
      setStatus(error instanceof Error ? `Could not scan this page: ${error.message}` : "Could not scan this page.");
    } finally {
      finishOperation();
    }
  }

  async function discover(): Promise<void> {
    if (!beginOperation()) return;
    resetDiscovery();
    setScan(null);
    setStatus("Starting application discovery...");
    try {
      const tabId = await getActiveTabId();
      await discovery.start(tabId);
    } catch (error: unknown) {
      reportDiscoveryFailure(error, "Application discovery failed.");
    } finally {
      finishOperation();
    }
  }

  async function selectAction(index: number | null): Promise<void> {
    if (!discovery.hasRun || !beginOperation()) return;
    try {
      await discovery.selectAction(session, index);
    } catch (error: unknown) {
      reportDiscoveryFailure(error, "Could not resume discovery.");
    } finally {
      finishOperation();
    }
  }

  async function decideContext(decision: DiscoverySession["contextResponse"]): Promise<void> {
    if (!discovery.hasRun || !beginOperation()) return;
    try {
      await discovery.decideContext(session, decision);
    } catch (error: unknown) {
      reportDiscoveryFailure(error, "Could not resume context acquisition.");
    } finally {
      finishOperation();
    }
  }

  return {
    state: { scan, busy, status, session, context, trace, canStopDiscovery: busy && discovery.hasRun },
    actions: { scanPage, discover, selectAction, decideContext, stopDiscovery: discovery.stop },
  };
}
