import type { ApplicationAction } from "../shared/application-form";
import { cleanText, getAriaLabelledBy, getFormIndex, isVisible } from "./dom";

const MAX_ACTIONS = 100;
const ACTION_SELECTOR = 'button, input[type="button"], input[type="submit"], input[type="reset"], input[type="image"], a[href], [role="button"]';

export interface ActionDetection {
  actions: ApplicationAction[];
  truncated: boolean;
}

function getActionLabel(element: HTMLElement): string | null {
  return getAriaLabelledBy(element) ??
    cleanText(element.getAttribute("aria-label")) ??
    (element instanceof HTMLInputElement ? cleanText(element.getAttribute("alt")) ?? cleanText(element.value) : cleanText(element.textContent));
}

export function detectActions(formIndices: Map<HTMLFormElement, number>): ActionDetection {
  const actions: ApplicationAction[] = [];
  let truncated = false;

  for (const element of document.querySelectorAll(ACTION_SELECTOR)) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) continue;
    if (element.matches('[role="combobox"], [aria-haspopup="listbox"]')) continue;
    if (element.parentElement?.closest('button, a[href], [role="button"]')) continue;
    if (actions.length >= MAX_ACTIONS) {
      truncated = true;
      break;
    }

    actions.push({
      index: actions.length,
      formIndex: getFormIndex(element, formIndices),
      kind: element instanceof HTMLAnchorElement ? "link" : "button",
      label: getActionLabel(element),
      buttonType: element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.type : null,
      disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
    });
  }

  return { actions, truncated };
}
