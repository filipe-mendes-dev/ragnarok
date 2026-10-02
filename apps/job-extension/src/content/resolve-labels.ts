import type { ApplicationField } from "../shared/application-form";
import type { DetectedField } from "./detect-fields";
import { cleanText, getAriaLabelledBy, getVisibleUploadTrigger, isVisible } from "./dom";

const NEARBY_LIMIT = 120;
const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea, [role="combobox"], button[aria-haspopup="listbox"]';

interface ResolvedLabel {
  label: ApplicationField["label"];
  source: ApplicationField["labelSource"];
}

function isInteractiveLabelCandidate(element: HTMLElement): boolean {
  if (element.matches("button, a, [role=button]")) return true;
  return element.querySelector(`${CONTROL_SELECTOR}, button, a[href], [role="button"]`) !== null;
}

function nearbyText(node: Node | null): string | null {
  if (!node) return null;
  if (node instanceof HTMLElement) {
    if (!isVisible(node)) return null;
    if (isInteractiveLabelCandidate(node)) return null;
  }
  const text = cleanText(node.textContent);
  if (!text) return null;
  if (text.length > NEARBY_LIMIT) return null;
  return text;
}

function isIsolatedLabelContainer(parent: HTMLElement, detected: DetectedField[]): boolean {
  if (parent.matches("form, body, html")) return false;
  return detected.filter((candidate) => parent.contains(candidate.element)).length === 1;
}

function findNearbyLabel(element: HTMLElement, allowFollowing: boolean, detected: DetectedField[]): string | null {
  let current: HTMLElement = element;

  for (let depth = 0; depth < 2; depth += 1) {
    const parent = current.parentElement;
    if (!parent) break;
    if (!isIsolatedLabelContainer(parent, detected)) break;

    for (let sibling = current.previousSibling; sibling; sibling = sibling.previousSibling) {
      const text = nearbyText(sibling);
      if (text) return text;
    }
    if (allowFollowing) {
      for (let sibling = current.nextSibling; sibling; sibling = sibling.nextSibling) {
        const text = nearbyText(sibling);
        if (text) return text;
      }
    }
    current = parent;
  }
  return null;
}

function getHtmlLabel(element: HTMLElement): string | null {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return null;
  return cleanText(Array.from(element.labels ?? []).map((label) => cleanText(label.textContent)).filter((text): text is string => text !== null).join(" "));
}

function getGroupLabel(element: HTMLElement): string | null {
  const fieldset = element.closest("fieldset");
  return cleanText(fieldset?.querySelector(":scope > legend")?.textContent ?? null);
}

function resolveUploadTriggerLabel(element: HTMLElement): ResolvedLabel | null {
  if (!(element instanceof HTMLInputElement)) return null;
  if (element.type !== "file") return null;
  const trigger = getVisibleUploadTrigger(element);
  if (!trigger) return null;
  const label = cleanText(trigger.textContent);
  // An existing trigger with no text still takes precedence over nearby text.
  return { label, source: label ? "upload-trigger" : null };
}

function resolveFieldLabel(element: HTMLElement, field: ApplicationField, detected: DetectedField[]): ResolvedLabel {
  const labelledBy = getAriaLabelledBy(element);
  if (labelledBy) return { label: labelledBy, source: "aria-labelledby" };
  const ariaLabel = cleanText(element.getAttribute("aria-label"));
  if (ariaLabel) return { label: ariaLabel, source: "aria-label" };
  const htmlLabel = getHtmlLabel(element);
  if (htmlLabel) return { label: htmlLabel, source: "html-label" };

  const uploadTrigger = resolveUploadTriggerLabel(element);
  if (uploadTrigger) return uploadTrigger;

  const allowFollowing = field.inputType === "checkbox" || field.inputType === "radio";
  const nearby = findNearbyLabel(element, allowFollowing, detected);
  if (nearby) return { label: nearby, source: "nearby" };
  return { label: field.label, source: field.labelSource };
}

export function resolveLabels(detected: DetectedField[]): ApplicationField[] {
  return detected.map(({ element, field }) => {
    const resolved = resolveFieldLabel(element, field, detected);
    field.label = resolved.label;
    field.labelSource = resolved.source;
    field.groupLabel = getGroupLabel(element);
    return field;
  });
}
