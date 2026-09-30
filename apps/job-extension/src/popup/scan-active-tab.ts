import { isApplicationForm, type ApplicationForm } from "../shared/application-form";

export async function scanActiveTab(): Promise<ApplicationForm> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== "number") throw new Error("No active page is available to scan.");

  const injections = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"],
  });
  const result: unknown = injections.find((injection) => injection.frameId === 0)?.result;
  if (!isApplicationForm(result)) throw new Error("Invalid form scan result.");
  return result;
}
