import { describe, expect, it } from "vitest";
import { isApplicationForm } from "../../../src/shared/application-form";
import { makeField, makeFormScan, makeScan } from "../support/application-fixtures";

describe("isApplicationForm", () => {
  it("rejects malformed data at the tab-to-panel boundary", () => {
    const validForm = makeScan();
    expect(isApplicationForm(validForm)).toBe(true);
    expect(isApplicationForm({ pageOrigin: "https://example.com", pageTitle: "Apply", fields: [{ name: "email" }], truncated: false })).toBe(false);
    expect(isApplicationForm({ pageOrigin: "https://example.com", pageTitle: "Apply", fields: [], truncated: "false" })).toBe(false);
    expect(isApplicationForm({ ...validForm, actions: [{ kind: "link", label: "Apply" }] })).toBe(false);
    expect(isApplicationForm({ ...validForm, scanId: null })).toBe(false);
    expect(isApplicationForm({ ...validForm, jobDescription: "x".repeat(20_001) })).toBe(false);
  });

  it("validates field identity, labels, control metadata, and select-only options", () => {
    const scan = makeFormScan();
    expect(isApplicationForm(scan)).toBe(true);
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
      expect(isApplicationForm({ ...scan, fields: [field] })).toBe(false);
    }

    const select = makeField({ control: "select", options: [{ label: "Remote", value: "remote" }], optionCount: 1 });
    expect(isApplicationForm({ ...scan, fields: [select] })).toBe(true);
    expect(isApplicationForm({ ...scan, fields: [{ ...select, options: [{ label: "Remote", value: 1 }] }] })).toBe(false);
    expect(isApplicationForm({ ...scan, fields: [{ ...select, optionCount: undefined }] })).toBe(false);
  });
});
