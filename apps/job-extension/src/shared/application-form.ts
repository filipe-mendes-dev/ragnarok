import { isNonNegativeInteger, isNullableString, isRecord } from "./value-guards";

export interface ApplicationOption {
  label: string;
  value: string;
}

export interface ApplicationField {
  index: number;
  formIndex: number | null;
  areaKey: string | null;
  control: "input" | "select" | "textarea" | "combobox";
  inputType: string | null;
  label: string | null;
  labelSource: "aria-labelledby" | "aria-label" | "html-label" | "upload-trigger" | "nearby" | null;
  groupLabel: string | null;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  autocomplete: string | null;
  required: boolean;
  disabled: boolean;
  options?: ApplicationOption[];
  optionCount?: number;
}

export interface ApplicationAction {
  index: number;
  formIndex: number | null;
  kind: "button" | "link";
  label: string | null;
  buttonType: string | null;
  disabled: boolean;
  href: string | null;
  target: string | null;
  role: string | null;
}

export interface ApplicationForm {
  pageOrigin: string;
  pageUrl: string;
  pageTitle: string;
  scanId: string;
  jobDescription: string;
  fields: ApplicationField[];
  truncated: boolean;
  actions: ApplicationAction[];
  actionsTruncated: boolean;
}

function isApplicationOption(value: unknown): value is ApplicationOption {
  if (!isRecord(value)) return false;
  if (typeof value.label !== "string") return false;
  if (typeof value.value !== "string") return false;
  return true;
}

function isFieldControl(value: unknown): value is ApplicationField["control"] {
  if (value === "input") return true;
  if (value === "select") return true;
  if (value === "textarea") return true;
  return value === "combobox";
}

function isLabelSource(value: unknown): value is ApplicationField["labelSource"] {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  return ["aria-labelledby", "aria-label", "html-label", "upload-trigger", "nearby"].includes(value);
}

function hasValidFieldIdentity(value: Record<string, unknown>): boolean {
  if (!isNonNegativeInteger(value.index)) return false;
  if (value.formIndex !== null && !isNonNegativeInteger(value.formIndex)) return false;
  if (!isNullableString(value.areaKey)) return false;
  if (!isNullableString(value.name)) return false;
  if (!isNullableString(value.id)) return false;
  return true;
}

function hasValidFieldLabels(value: Record<string, unknown>): boolean {
  if (!isNullableString(value.label)) return false;
  if (!isLabelSource(value.labelSource)) return false;
  if (!isNullableString(value.groupLabel)) return false;
  if (!isNullableString(value.placeholder)) return false;
  return true;
}

function hasValidControlMetadata(value: Record<string, unknown>): boolean {
  if (!isNullableString(value.inputType)) return false;
  if (!isNullableString(value.autocomplete)) return false;
  if (typeof value.required !== "boolean") return false;
  if (typeof value.disabled !== "boolean") return false;
  return true;
}

function hasValidSelectOptions(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.options)) return false;
  if (!value.options.every(isApplicationOption)) return false;
  if (!isNonNegativeInteger(value.optionCount)) return false;
  return true;
}

function isApplicationField(value: unknown): value is ApplicationField {
  if (!isRecord(value)) return false;
  if (!isFieldControl(value.control)) return false;
  if (!hasValidFieldIdentity(value)) return false;
  if (!hasValidFieldLabels(value)) return false;
  if (!hasValidControlMetadata(value)) return false;
  if (value.control === "select") return hasValidSelectOptions(value);
  if (value.options !== undefined) return false;
  if (value.optionCount !== undefined) return false;
  return true;
}

function isApplicationAction(value: unknown): value is ApplicationAction {
  if (!isRecord(value)) return false;
  if (!isNonNegativeInteger(value.index)) return false;
  if (value.formIndex !== null && !isNonNegativeInteger(value.formIndex)) return false;
  if (value.kind !== "button" && value.kind !== "link") return false;
  if (!isNullableString(value.label)) return false;
  if (!isNullableString(value.buttonType)) return false;
  if (!isNullableString(value.href)) return false;
  if (!isNullableString(value.target)) return false;
  if (!isNullableString(value.role)) return false;
  if (typeof value.disabled !== "boolean") return false;
  return true;
}

export function isApplicationForm(value: unknown): value is ApplicationForm {
  if (!isRecord(value)) return false;
  if (typeof value.pageOrigin !== "string") return false;
  if (typeof value.pageUrl !== "string") return false;
  if (typeof value.pageTitle !== "string") return false;
  if (typeof value.scanId !== "string") return false;
  if (typeof value.jobDescription !== "string") return false;
  if (value.jobDescription.length > 20_000) return false;
  if (typeof value.truncated !== "boolean") return false;
  if (!Array.isArray(value.fields)) return false;
  if (!value.fields.every(isApplicationField)) return false;
  if (typeof value.actionsTruncated !== "boolean") return false;
  if (!Array.isArray(value.actions)) return false;
  if (!value.actions.every(isApplicationAction)) return false;
  return true;
}
