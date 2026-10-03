import { describe, expect, it } from "vitest";
import { isPageScan } from "../../../src/shared/page-scan";
import { makeField, makeFormScan, makeScan } from "../support/page-scan-fixtures";

describe("isPageScan", () => {
  it("rejects malformed data at the tab-to-panel boundary", () => {
    const validForm = makeScan();
    expect(isPageScan(validForm)).toBe(true);
    expect(isPageScan({ pageOrigin: "https://example.com", pageTitle: "Apply", fields: [{ name: "email" }], truncated: false })).toBe(false);
    expect(isPageScan({ pageOrigin: "https://example.com", pageTitle: "Apply", fields: [], truncated: "false" })).toBe(false);
    expect(isPageScan({ ...validForm, actions: [{ kind: "link", label: "Apply" }] })).toBe(false);
    expect(isPageScan({ ...validForm, scanId: null })).toBe(false);
    expect(isPageScan({ ...validForm, jobDescription: "x".repeat(20_001) })).toBe(false);
  });

  it("validates field identity, labels, control metadata, and select-only options", () => {
    const scan = makeFormScan();
    expect(isPageScan(scan)).toBe(true);
    const malformedFields = [
      { ...makeField(), index: -1 },
      { ...makeField(), formIndex: "0" },
      { ...makeField(), control: "button" },
      { ...makeField(), areaKey: 0 },
      { ...makeField(), labelSource: "guessed" },
      { ...makeField(), autocomplete: 1 },
      { ...makeField(), required: "true" },
      { ...makeField(), options: [] },
    ];
    for (const field of malformedFields) {
      expect(isPageScan({ ...scan, fields: [field] })).toBe(false);
    }

    const select = makeField({ control: "select", options: [{ label: "Remote", value: "remote" }], optionCount: 1 });
    expect(isPageScan({ ...scan, fields: [select] })).toBe(true);
    expect(isPageScan({ ...scan, fields: [{ ...select, options: [{ label: "Remote", value: 1 }] }] })).toBe(false);
    expect(isPageScan({ ...scan, fields: [{ ...select, optionCount: undefined }] })).toBe(false);
  });
});
