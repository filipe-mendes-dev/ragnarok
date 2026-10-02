import type { ScanSnapshot, ScannerWindow } from "./scan-snapshot";

export interface ClickResult {
  clicked: boolean;
  reason: string;
}

// Chrome serializes this function without imports, so its runtime guards must stay inside it.
export function clickScannedAction(scanId: string = "", index: number = -1): ClickResult {
  function isCurrentPageSnapshot(snapshot: ScanSnapshot | null | undefined): snapshot is ScanSnapshot {
    if (!snapshot) return false;
    if (snapshot.id !== scanId) return false;
    if (snapshot.pageUrl !== location.href) return false;
    return true;
  }

  function isUnchangedScannedAction(element: HTMLElement | undefined, markup: string | undefined): element is HTMLElement {
    if (!element) return false;
    if (!element.isConnected) return false;
    if (element.outerHTML !== markup) return false;
    return true;
  }

  function isActionVisible(element: HTMLElement): boolean {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.hidden) return false;
      if (current.hasAttribute("inert")) return false;
      if (current.getAttribute("aria-hidden") === "true") return false;
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (style.visibility === "collapse") return false;
    }
    return true;
  }

  function isActionDisabled(element: HTMLElement): boolean {
    if (element.matches(":disabled")) return true;
    return element.getAttribute("aria-disabled") === "true";
  }

  function submitsNativeForm(element: HTMLElement): boolean {
    if (!(element instanceof HTMLButtonElement || element instanceof HTMLInputElement)) return false;
    if (!element.form) return false;
    return element.type === "submit";
  }

  function isNonNavigationLink(element: HTMLElement): boolean {
    if (!(element instanceof HTMLAnchorElement)) return false;
    if (element.hasAttribute("download")) return true;
    return !["http:", "https:"].includes(new URL(element.href).protocol);
  }

  const scannerWindow = window as ScannerWindow;
  const snapshot = scannerWindow.__ragnarokScan;
  if (!isCurrentPageSnapshot(snapshot)) return { clicked: false, reason: "The page scan is stale. Scan again." };

  const element = snapshot.elements[index];
  if (!isUnchangedScannedAction(element, snapshot.markup[index])) return { clicked: false, reason: "The selected action changed after scanning." };
  if (!isActionVisible(element)) return { clicked: false, reason: "The selected action is no longer visible." };
  if (isActionDisabled(element)) return { clicked: false, reason: "The selected action is disabled." };
  if (submitsNativeForm(element)) return { clicked: false, reason: "Discovery cannot submit a form." };
  if (isNonNavigationLink(element)) return { clicked: false, reason: "This link is not a navigation action." };

  scannerWindow.__ragnarokScan = null;
  element.click();
  return { clicked: true, reason: "Action clicked." };
}
