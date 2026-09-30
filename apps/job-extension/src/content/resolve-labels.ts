import type { ApplicationField } from "../shared/application-form";
import type { DetectedField } from "./detect-fields";
import { cleanText, getAriaLabelledBy, isVisible } from "./dom";

const NEARBY_LIMIT = 120;
const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea, [role="combobox"], button[aria-haspopup="listbox"]';

function nearbyText(node: Node | null): string | null {
  if (!node) return null;
  if (node instanceof HTMLElement) {
    if (!isVisible(node) || node.matches("button, a, [role=button]") || node.querySelector(`${CONTROL_SELECTOR}, button, a[href], [role="button"]`)) return null;
  }
  const text = cleanText(node.textContent);
  return text && text.length <= NEARBY_LIMIT ? text : null;
}

function findNearbyLabel(element: HTMLElement, allowFollowing: boolean, detected: DetectedField[]): string | null {
  let current: HTMLElement = element;

  for (let depth = 0; depth < 2; depth += 1) {
    const parent = current.parentElement;
    if (!parent || parent.matches("form, body, html") || detected.filter((candidate) => parent.contains(candidate.element)).length !== 1) break;

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

export function resolveLabels(detected: DetectedField[]): ApplicationField[] {
  return detected.map(({ element, field }) => {
    const labelledBy = getAriaLabelledBy(element);
    const ariaLabel = cleanText(element.getAttribute("aria-label"));
    const htmlLabel = getHtmlLabel(element);
    const nearby = !labelledBy && !ariaLabel && !htmlLabel
      ? findNearbyLabel(element, field.inputType === "checkbox" || field.inputType === "radio", detected)
      : null;

    if (labelledBy) {
      field.label = labelledBy;
      field.labelSource = "aria-labelledby";
    } else if (ariaLabel) {
      field.label = ariaLabel;
      field.labelSource = "aria-label";
    } else if (htmlLabel) {
      field.label = htmlLabel;
      field.labelSource = "html-label";
    } else if (nearby) {
      field.label = nearby;
      field.labelSource = "nearby";
    }
    field.groupLabel = getGroupLabel(element);
    return field;
  });
}
