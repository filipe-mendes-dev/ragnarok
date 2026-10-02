import { isApplicationForm, type ApplicationForm } from "../shared/application-form";

export async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== "number") throw new Error("No active page is available to scan.");
  return tab.id;
}

export async function assertActiveTab(tabId: number): Promise<void> {
  if (await getActiveTabId() !== tabId) throw new Error("The active tab changed. Return to the original tab or start a new discovery.");
}

export async function scanTab(tabId: number): Promise<ApplicationForm> {
  await assertActiveTab(tabId);

  const injections = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"],
  });
  const result: unknown = injections.find((injection) => injection.frameId === 0)?.result;
  if (!isApplicationForm(result)) throw new Error("Invalid form scan result.");
  return result;
}

export async function scanActiveTab(): Promise<ApplicationForm> {
  return scanTab(await getActiveTabId());
}
