import type { ApplicationField, ApplicationOption } from "../shared/application-form";
import { cleanText, getFormIndex, isVisible } from "./dom";

const MAX_FIELDS = 200;
const MAX_OPTIONS = 50;
const FIELD_SELECTOR = 'input, select, textarea, [role="combobox"], button[aria-haspopup="listbox"]';

export interface DetectedField {
  element: HTMLElement;
  field: ApplicationField;
}

export interface FieldDetection {
  fields: DetectedField[];
  truncated: boolean;
}

function isNativeField(element: Element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement;
}

function isCombobox(element: HTMLElement): boolean {
  return element.getAttribute("role") === "combobox" ||
    (element instanceof HTMLButtonElement && element.getAttribute("aria-haspopup") === "listbox");
}

function makeField(element: HTMLElement, index: number, formIndices: Map<HTMLFormElement, number>): ApplicationField {
  const control = isCombobox(element) ? "combobox" : element instanceof HTMLInputElement ? "input" : element instanceof HTMLSelectElement ? "select" : "textarea";
  const innerInput = control === "combobox" && !(element instanceof HTMLInputElement)
    ? element.querySelector<HTMLInputElement>('input:not([type="hidden"])')
    : null;
  const field: ApplicationField = {
    index,
    formIndex: getFormIndex(element, formIndices) ?? (innerInput ? getFormIndex(innerInput, formIndices) : null),
    control,
    inputType: element instanceof HTMLInputElement ? element.type : innerInput?.type ?? null,
    label: null,
    labelSource: null,
    groupLabel: null,
    name: cleanText(element.getAttribute("name")) ?? cleanText(innerInput?.getAttribute("name") ?? null),
    id: cleanText(element.id) ?? cleanText(innerInput?.id ?? null),
    placeholder: cleanText(element.getAttribute("placeholder")) ?? cleanText(innerInput?.getAttribute("placeholder") ?? null),
    required: (isNativeField(element) && element.required) || innerInput?.required === true || element.getAttribute("aria-required") === "true",
    disabled: element.matches(":disabled") || innerInput?.matches(":disabled") === true || element.getAttribute("aria-disabled") === "true",
  };

  if (element instanceof HTMLSelectElement && control === "select") {
    const options: ApplicationOption[] = Array.from(element.options).slice(0, MAX_OPTIONS).map((option) => ({
      label: cleanText(option.label) ?? "",
      value: cleanText(option.value) ?? "",
    }));
    field.options = options;
    field.optionCount = element.options.length;
  }

  return field;
}

export function detectFields(formIndices: Map<HTMLFormElement, number>): FieldDetection {
  const fields: DetectedField[] = [];
  let truncated = false;

  for (const element of document.querySelectorAll(FIELD_SELECTOR)) {
    if (!(element instanceof HTMLElement)) continue;
    if (element instanceof HTMLInputElement && ["hidden", "button", "submit", "reset", "image"].includes(element.type)) continue;
    if (!isNativeField(element) && !isCombobox(element)) continue;
    if (element.parentElement?.closest('[role="combobox"]')) continue;
    if (!isVisible(element)) continue;
    if (fields.length >= MAX_FIELDS) {
      truncated = true;
      break;
    }
    fields.push({ element, field: makeField(element, fields.length, formIndices) });
  }

  return { fields, truncated };
}
