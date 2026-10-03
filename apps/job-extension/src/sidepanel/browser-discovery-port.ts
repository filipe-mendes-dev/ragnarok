import { clickScannedAction } from "../content/application/click-scanned-action";
import { APP_URL } from "../config";
import type { DiscoveryPort, JobContext } from "../discovery/session";
import type { ApplicationAction, PageScan } from "../shared/page-scan";
import { isEligibleNavigationAction, pageFingerprint } from "../shared/discovery-rules";
import { isNonNegativeInteger, isRecord } from "../shared/value-guards";
import { clearJobContext, saveJobContext, saveLearnedAction } from "./discovery-storage";
import { assertActiveTab, readJobContext, scanTab } from "./scan-active-tab";

const WAIT_TIMEOUT_MS = 12_000;
const POLL_INTERVAL_MS = 400;

function hasConfirmedClick(result: unknown): boolean {
  if (typeof result !== "object") return false;
  if (result === null) return false;
  if (!("clicked" in result)) return false;
  return result.clicked === true;
}

function getClickFailureReason(result: unknown): string {
  const fallback = "Could not verify the click result.";
  if (typeof result !== "object") return fallback;
  if (result === null) return fallback;
  if (!("reason" in result)) return fallback;
  if (typeof result.reason !== "string") return fallback;
  return result.reason;
}

function isChangedPageReady(scan: PageScan, previousFingerprint: string, fingerprint: string, stableSamples: number): boolean {
  if (fingerprint === previousFingerprint) return false;
  if (stableSamples < 3) return false;
  return scan.fields.length + scan.actions.length > 0;
}

function delay(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    function abort(): void {
      clearTimeout(timer);
      reject(new Error("Discovery cancelled."));
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, POLL_INTERVAL_MS);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function createBrowserDiscoveryPort(tabId: number, signal: AbortSignal): DiscoveryPort {
  async function readContext(): Promise<JobContext | null> {
    signal.throwIfAborted();
    const context = await readJobContext(tabId);
    signal.throwIfAborted();
    return context;
  }
  async function scan(): Promise<PageScan> {
    signal.throwIfAborted();
    try { return await scanTab(tabId); }
    catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to access this page.";
      throw new Error(`${message} If navigation changed origin, click the extension icon on the new page and start again.`);
    }
  }

  async function selectActionWithLlm(page: PageScan, candidates: ApplicationAction[]): Promise<ApplicationAction | null> {
    await assertActiveTab(tabId);
    signal.throwIfAborted();
    const started = performance.now();
    const logContext = { event: "extension.action_selection.request", candidateCount: candidates.length };
    let backendStatus: number | null = null;
    let requestId: string | null = null;
    console.dir({ ...logContext, level: "info", outcome: "started" }, { depth: null });
    try {
      const response = await fetch(`${APP_URL}/api/extension/select-action`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Ragnarok-Extension-Id": chrome.runtime.id,
        },
        body: JSON.stringify({
          pageTitle: page.pageTitle.slice(0, 300),
          actions: candidates.map((action) => ({ index: action.index, label: (action.label ?? "").slice(0, 200), kind: action.kind })),
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
        cache: "no-store",
        redirect: "error",
      });
      backendStatus = response.status;
      requestId = response.headers.get("X-Request-Id");
      signal.throwIfAborted();
      if (response.status === 401) throw new Error("Sign in to RAGnarok in this Chrome profile, then restart discovery to use LLM action selection.");
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = isRecord(result) && typeof result.errorMessage === "string" ? result.errorMessage : "Action selection failed.";
        throw new Error(message);
      }
      if (!isRecord(result)) throw new Error("Invalid action-selection response.");
      if (typeof result.probability !== "number" || !Number.isFinite(result.probability) || result.probability < 0 || result.probability > 1) {
        throw new Error("Invalid action-selection probability.");
      }
      if (result.actionIndex === null) {
        console.dir({ ...logContext, level: "info", outcome: "manual_required", requestId, backendStatus, latencyMs: Math.round(performance.now() - started), actionIndex: null, probability: result.probability }, { depth: null });
        return null;
      }
      if (!isNonNegativeInteger(result.actionIndex)) throw new Error("Invalid selected action index.");
      const action = candidates.find((candidate) => candidate.index === result.actionIndex);
      if (!action || !isEligibleNavigationAction(action)) throw new Error("The LLM selected an action outside the eligible candidates.");
      await assertActiveTab(tabId);
      signal.throwIfAborted();
      console.dir({ ...logContext, level: "info", outcome: "selected", requestId, backendStatus, latencyMs: Math.round(performance.now() - started), actionIndex: action.index, probability: result.probability }, { depth: null });
      return action;
    } catch (error: unknown) {
      console.dir({ ...logContext, level: "error", outcome: "failed", requestId, backendStatus, latencyMs: Math.round(performance.now() - started), causeName: error instanceof Error ? error.name : typeof error, cancelled: signal.aborted }, { depth: null });
      signal.throwIfAborted();
      const message = backendStatus === null
        ? `Could not reach the action-selection API within 12 seconds. Check that RAGnarok is running at ${APP_URL}.`
        : error instanceof Error ? error.message : "Action selection failed.";
      throw new Error(requestId ? `${message} Request ID: ${requestId}.` : message);
    }
  }

  async function click(page: PageScan, action: ApplicationAction): Promise<void> {
    await assertActiveTab(tabId);
    signal.throwIfAborted();
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: clickScannedAction, args: [page.scanId, action.index] });
    const result: unknown = results.find((entry) => entry.frameId === 0)?.result;
    if (hasConfirmedClick(result)) return;
    throw new Error(getClickFailureReason(result));
  }

  async function waitForChange(previous: PageScan): Promise<void> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    const before = pageFingerprint(previous);
    let last = "";
    let stableSamples = 0;
    let lastError = "The action produced no observable page change.";
    while (Date.now() < deadline) {
      await delay(signal);
      await assertActiveTab(tabId);
      try {
        const current = await scanTab(tabId);
        if (current.pageOrigin !== previous.pageOrigin) throw new Error("Navigation changed origin. Click the extension icon on the new page and start again.");
        const fingerprint = pageFingerprint(current);
        stableSamples = fingerprint === last ? stableSamples + 1 : 1;
        last = fingerprint;
        // Several stable scans handle dialogs and SPA routes without a fixed load sleep.
        if (isChangedPageReady(current, before, fingerprint, stableSamples)) return;
      } catch (error: unknown) {
        stableSamples = 0;
        lastError = error instanceof Error ? error.message : "Unable to scan the resulting page.";
      }
    }
    throw new Error(`${lastError} Discovery stopped after waiting 12 seconds. Review the page and rescan.`);
  }

  async function saveContext(context: JobContext): Promise<void> { await saveJobContext(tabId, context); }
  return { readContext, scan, selectActionWithLlm, click, waitForChange, saveContext, clearContext: () => clearJobContext(tabId), learnAction: saveLearnedAction };
}
