import type { ApplicationField, ApplicationOption } from "../../shared/page-scan";
import { isApplicantEmail, isApplicantName, isFileUploadField } from "../../shared/form-discovery";
import { cleanText, getAriaLabelledBy, getFormIndex, getVisibleUploadTrigger, isVisible } from "../dom";

const MAX_FIELDS = 200;
const MAX_OPTIONS = 50;
const NEARBY_LIMIT = 120;
const FIELD_SELECTOR = 'input, select, textarea, [role="combobox"], button[aria-haspopup="listbox"]';
const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea, [role="combobox"], button[aria-haspopup="listbox"]';

export interface FieldScan {
  fields: ApplicationField[];
  truncated: boolean;
}

interface DetectedField {
  element: HTMLElement;
  field: ApplicationField;
}

interface ResolvedLabel {
  label: ApplicationField["label"];
  source: ApplicationField["labelSource"];
}

export function scanFields(formIndices: Map<HTMLFormElement, number>): FieldScan {
  const detected: DetectedField[] = [];
  let truncated = false;

  for (const element of document.querySelectorAll(FIELD_SELECTOR)) {
    if (!(element instanceof HTMLElement)) continue;
    if (isUnsupportedInput(element)) continue;
    if (!isNativeField(element) && !isCombobox(element)) continue;
    if (element.parentElement?.closest('[role="combobox"]')) continue;
    if (!isInspectableField(element)) continue;
    if (detected.length >= MAX_FIELDS) {
      truncated = true;
      break;
    }
    detected.push({ element, field: makeField(element, detected.length, formIndices) });
  }

  for (const { element, field } of detected) {
    const resolved = resolveFieldLabel(element, field, detected);
    field.label = resolved.label;
    field.labelSource = resolved.source;
    field.groupLabel = getGroupLabel(element);
  }
  assignFieldAreas(detected);
  return { fields: detected.map(({ field }) => field), truncated };
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
  if (!isNativeField(element)) return null;
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

function containsApplicationFormSignals(fields: ApplicationField[]): boolean {
  if (!fields.some(isApplicantName)) return false;
  if (!fields.some(isApplicantEmail)) return false;
  return fields.some(isFileUploadField);
}

function isApplicationAreaContainer(parent: HTMLElement, detected: DetectedField[]): boolean {
  const fields = detected
    .filter((candidate) => candidate.field.formIndex === null && parent.contains(candidate.element))
    .map((candidate) => candidate.field);
  if (containsApplicationFormSignals(fields)) return true;
  return parent.matches('[role="form"], [role="dialog"], dialog');
}

function assignFieldAreas(detected: DetectedField[]): void {
  const containers = new Map<HTMLElement, string>();
  for (const { element, field } of detected) {
    if (field.formIndex !== null) {
      field.areaKey = `form:${field.formIndex}`;
      continue;
    }
    for (let parent = element.parentElement; parent && !parent.matches("body, html"); parent = parent.parentElement) {
      // Group controls only when their common container has all recognition signals.
      if (!isApplicationAreaContainer(parent, detected)) continue;
      const key = containers.get(parent) ?? `area:${containers.size}`;
      containers.set(parent, key);
      field.areaKey = key;
      break;
    }
  }
}
