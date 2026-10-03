import type { ApplicationAction, ApplicationField, PageScan } from "../../../src/shared/page-scan";

export function makeField(overrides: Partial<ApplicationField> = {}): ApplicationField {
  return { index: 0, formIndex: 0, areaKey: "form:0", control: "input", inputType: "text", label: null,
    labelSource: null, groupLabel: null, name: null, id: null, placeholder: null, autocomplete: null,
    required: false, disabled: false, ...overrides };
}

export function makeAction(overrides: Partial<ApplicationAction> = {}): ApplicationAction {
  return { index: 0, formIndex: null, kind: "link", label: "Apply now", buttonType: null,
    disabled: false, href: "https://jobs.example.com/job/application", target: null, role: null, ...overrides };
}

export function makeScan(overrides: Partial<PageScan> = {}): PageScan {
  return { pageOrigin: "https://jobs.example.com", pageUrl: "https://jobs.example.com/job", pageTitle: "Engineer",
    scanId: "scan-1", jobDescription: "", fields: [], truncated: false, actions: [], actionsTruncated: false, ...overrides };
}

export function makeFormScan(overrides: Partial<PageScan> = {}): PageScan {
  return makeScan({ pageUrl: "https://jobs.example.com/job/application", scanId: "scan-2", fields: [
    makeField({ index: 0, label: "Full name" }), makeField({ index: 1, inputType: "email" }),
    makeField({ index: 2, inputType: "file", label: "Resume" }),
  ], ...overrides });
}
