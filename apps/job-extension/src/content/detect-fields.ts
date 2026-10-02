import type { ApplicationField, ApplicationOption } from "../shared/application-form";
import { cleanText, getFormIndex, getVisibleUploadTrigger, isVisible } from "./dom";

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
  if (element.getAttribute("role") === "combobox") return true;
  if (!(element instanceof HTMLButtonElement)) return false;
  return element.getAttribute("aria-haspopup") === "listbox";
}

function isUnsupportedInput(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement)) return false;
  return ["hidden", "button", "submit", "reset", "image"].includes(element.type);
}

function isNestedComboboxField(element: HTMLElement): boolean {
  return Boolean(element.parentElement?.closest('[role="combobox"]'));
}

function isSupportedField(element: HTMLElement): boolean {
  if (isNativeField(element)) return true;
  return isCombobox(element);
}

function hasInspectableUploadTrigger(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement)) return false;
  if (element.type !== "file") return false;
  return getVisibleUploadTrigger(element) !== null;
}

function isInspectableField(element: HTMLElement): boolean {
  if (isVisible(element)) return true;
  return hasInspectableUploadTrigger(element);
}

function getFieldControl(element: HTMLElement): ApplicationField["control"] {
  if (isCombobox(element)) return "combobox";
  if (element instanceof HTMLInputElement) return "input";
  if (element instanceof HTMLSelectElement) return "select";
  return "textarea";
}

function findComboboxInput(element: HTMLElement, control: ApplicationField["control"]): HTMLInputElement | null {
  if (control !== "combobox") return null;
  if (element instanceof HTMLInputElement) return null;
  return element.querySelector<HTMLInputElement>('input:not([type="hidden"])');
}

function isFieldRequired(element: HTMLElement, innerInput: HTMLInputElement | null): boolean {
  if (isNativeField(element) && element.required) return true;
  if (innerInput?.required) return true;
  return element.getAttribute("aria-required") === "true";
}

function isFieldDisabled(element: HTMLElement, innerInput: HTMLInputElement | null): boolean {
  if (element.matches(":disabled")) return true;
  if (innerInput?.matches(":disabled")) return true;
  return element.getAttribute("aria-disabled") === "true";
}

function makeField(element: HTMLElement, index: number, formIndices: Map<HTMLFormElement, number>): ApplicationField {
  const control = getFieldControl(element);
  const innerInput = findComboboxInput(element, control);
  const field: ApplicationField = {
    index,
    formIndex: getFormIndex(element, formIndices) ?? (innerInput ? getFormIndex(innerInput, formIndices) : null),
    areaKey: null,
    control,
    inputType: element instanceof HTMLInputElement ? element.type : innerInput?.type ?? null,
    label: null,
    labelSource: null,
    groupLabel: null,
    name: cleanText(element.getAttribute("name")) ?? cleanText(innerInput?.getAttribute("name") ?? null),
    id: cleanText(element.id) ?? cleanText(innerInput?.id ?? null),
    placeholder: cleanText(element.getAttribute("placeholder")) ?? cleanText(innerInput?.getAttribute("placeholder") ?? null),
    autocomplete: cleanText(element.getAttribute("autocomplete")) ?? cleanText(innerInput?.getAttribute("autocomplete") ?? null),
    required: isFieldRequired(element, innerInput),
    disabled: isFieldDisabled(element, innerInput),
  };

  if (!(element instanceof HTMLSelectElement)) return field;
  if (control !== "select") return field;
  const options: ApplicationOption[] = Array.from(element.options).slice(0, MAX_OPTIONS).map((option) => ({
    label: cleanText(option.label) ?? "",
    value: cleanText(option.value) ?? "",
  }));
  field.options = options;
  field.optionCount = element.options.length;
  return field;
}

export function detectFields(formIndices: Map<HTMLFormElement, number>): FieldDetection {
  const fields: DetectedField[] = [];
  let truncated = false;

  for (const element of document.querySelectorAll(FIELD_SELECTOR)) {
    if (!(element instanceof HTMLElement)) continue;
    if (isUnsupportedInput(element)) continue;
    if (!isSupportedField(element)) continue;
    if (isNestedComboboxField(element)) continue;
    if (!isInspectableField(element)) continue;
    if (fields.length >= MAX_FIELDS) {
      truncated = true;
      break;
    }
    fields.push({ element, field: makeField(element, fields.length, formIndices) });
  }

  return { fields, truncated };
}
