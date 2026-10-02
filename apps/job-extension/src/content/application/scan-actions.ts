import type { ApplicationAction } from "../../shared/page-scan";
import { cleanText, getAriaLabelledBy, getFormIndex, isVisible } from "../dom";

const MAX_ACTIONS = 100;
const ACTION_SELECTOR = 'button, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], a[href], [role="button"], [role="tab"]';

export interface ActionScan {
  actions: ApplicationAction[];
  elements: HTMLElement[];
  truncated: boolean;
}

export function scanActions(formIndices: Map<HTMLFormElement, number>): ActionScan {
  const actions: ApplicationAction[] = [];
  const elements: HTMLElement[] = [];
  let truncated = false;

  for (const element of document.querySelectorAll(ACTION_SELECTOR)) {
    if (!(element instanceof HTMLElement)) continue;
    if (!isVisible(element)) continue;
    if (isFieldLikeAction(element)) continue;
    if (isNestedAction(element)) continue;
    if (actions.length >= MAX_ACTIONS) {
      truncated = true;
      break;
    }

    actions.push({
      index: actions.length,
      formIndex: getFormIndex(element, formIndices),
      kind: element instanceof HTMLAnchorElement ? "link" : "button",
      label: resolveActionLabel(element),
      buttonType: getActionButtonType(element),
      disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
      href: element instanceof HTMLAnchorElement ? element.href : null,
      target: element instanceof HTMLAnchorElement ? cleanText(element.getAttribute("target")) : null,
      role: cleanText(element.getAttribute("role")),
    });
    elements.push(element);
  }

  return { actions, elements, truncated };
}

function isFieldLikeAction(element: HTMLElement): boolean {
  return element.matches('[role="combobox"], [aria-haspopup="listbox"]');
}

function isNestedAction(element: HTMLElement): boolean {
  return Boolean(element.parentElement?.closest('button, a[href], [role="button"]'));
}

function resolveActionLabel(element: HTMLElement): string | null {
  const labelledBy = getAriaLabelledBy(element);
  if (labelledBy) return labelledBy;
  const ariaLabel = cleanText(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;
  if (element instanceof HTMLInputElement) return cleanText(element.getAttribute("alt")) ?? cleanText(element.value);
  return cleanText(element.textContent);
}

function getActionButtonType(element: HTMLElement): string | null {
  if (element instanceof HTMLButtonElement) return element.type;
  if (element instanceof HTMLInputElement) return element.type;
  return null;
}

