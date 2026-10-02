import { clickScannedAction } from "../content/application/click-scanned-action";
import type { DiscoveryPort, JobContext } from "../discovery/session";
import type { ApplicationAction, PageScan } from "../shared/page-scan";
import { pageFingerprint } from "../shared/discovery-rules";
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
  return { readContext, scan, click, waitForChange, saveContext, clearContext: () => clearJobContext(tabId), learnAction: saveLearnedAction };
}
