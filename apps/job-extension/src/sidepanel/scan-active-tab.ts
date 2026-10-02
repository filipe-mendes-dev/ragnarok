import { isPageScan, type PageScan } from "../shared/page-scan";
import { isWebUrl, MAX_JOB_DESCRIPTION_LENGTH, type JobContext } from "../shared/job-context";

export async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== "number") throw new Error("No active page is available to scan.");
  return tab.id;
}

export async function assertActiveTab(tabId: number): Promise<void> {
  if (await getActiveTabId() !== tabId) throw new Error("The active tab changed. Return to the original tab or start a new discovery.");
}

export async function scanTab(tabId: number): Promise<PageScan> {
  await assertActiveTab(tabId);

  const injections = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"],
  });
  const result: unknown = injections.find((injection) => injection.frameId === 0)?.result;
  if (!isPageScan(result)) throw new Error("Invalid page scan result.");
  return result;
}

export async function readJobContext(tabId: number): Promise<JobContext | null> {
  await assertActiveTab(tabId);
  const tab = await chrome.tabs.get(tabId);
  if (!isWebUrl(tab.url)) throw new Error("Open a regular web page to read job context.");

  const injections = await chrome.scripting.executeScript({ target: { tabId }, files: ["context-script.js"] });
  await assertActiveTab(tabId);
  const currentTab = await chrome.tabs.get(tabId);
  if (currentTab.url !== tab.url) throw new Error("The page changed while reading job context. Try again.");

  const result: unknown = injections.find((injection) => injection.frameId === 0)?.result;
  if (typeof result !== "string") throw new Error("Invalid job text result.");
  if (result.length > MAX_JOB_DESCRIPTION_LENGTH) throw new Error("Job text exceeds the capture limit.");
  const jobDescription = result.trim();
  if (!jobDescription) return null;

  return {
    jobDescription,
    sourceUrl: tab.url,
    lastPageUrl: tab.url,
    capturedAt: new Date().toISOString(),
  };
}

export async function scanActiveTab(): Promise<PageScan> {
  return scanTab(await getActiveTabId());
}
