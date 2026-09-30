export interface ApplicationOption {
  label: string;
  value: string;
}

export interface ApplicationField {
  index: number;
  formIndex: number | null;
  control: "input" | "select" | "textarea" | "combobox";
  inputType: string | null;
  label: string | null;
  labelSource: "aria-labelledby" | "aria-label" | "html-label" | "nearby" | null;
  groupLabel: string | null;
  name: string | null;
  id: string | null;
  placeholder: string | null;
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
}

export interface ApplicationForm {
  pageOrigin: string;
  pageTitle: string;
  fields: ApplicationField[];
  truncated: boolean;
  actions: ApplicationAction[];
  actionsTruncated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isApplicationOption(value: unknown): value is ApplicationOption {
  return isRecord(value) && typeof value.label === "string" && typeof value.value === "string";
}

function isApplicationField(value: unknown): value is ApplicationField {
  if (!isRecord(value)) return false;

  const control = value.control;
  if (control !== "input" && control !== "select" && control !== "textarea" && control !== "combobox") return false;

  const source = value.labelSource;
  const validSource = source === null || source === "aria-labelledby" || source === "aria-label" || source === "html-label" || source === "nearby";
  const validMetadata =
    isNonNegativeInteger(value.index) &&
    (value.formIndex === null || isNonNegativeInteger(value.formIndex)) &&
    isNullableString(value.inputType) &&
    isNullableString(value.label) &&
    validSource &&
    isNullableString(value.groupLabel) &&
    isNullableString(value.name) &&
    isNullableString(value.id) &&
    isNullableString(value.placeholder) &&
    typeof value.required === "boolean" &&
    typeof value.disabled === "boolean";

  if (!validMetadata) return false;

  if (control === "select") {
    return Array.isArray(value.options) &&
      value.options.every(isApplicationOption) &&
      isNonNegativeInteger(value.optionCount);
  }

  return value.options === undefined && value.optionCount === undefined;
}

function isApplicationAction(value: unknown): value is ApplicationAction {
  return isRecord(value) &&
    isNonNegativeInteger(value.index) &&
    (value.formIndex === null || isNonNegativeInteger(value.formIndex)) &&
    (value.kind === "button" || value.kind === "link") &&
    isNullableString(value.label) &&
    isNullableString(value.buttonType) &&
    typeof value.disabled === "boolean";
}

export function isApplicationForm(value: unknown): value is ApplicationForm {
  return isRecord(value) &&
    typeof value.pageOrigin === "string" &&
    typeof value.pageTitle === "string" &&
    typeof value.truncated === "boolean" &&
    Array.isArray(value.fields) &&
    value.fields.every(isApplicationField) &&
    typeof value.actionsTruncated === "boolean" &&
    Array.isArray(value.actions) &&
    value.actions.every(isApplicationAction);
}
