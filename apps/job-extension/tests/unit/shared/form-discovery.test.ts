import { describe, expect, it } from "vitest";
import { assessApplicationForm } from "../../../src/shared/form-discovery";
import { makeField, makeFormScan } from "../support/page-scan-fixtures";

describe("assessApplicationForm", () => {
  it("accepts name, email, and an unlabelled file without requiring required attributes", () => {
    const scan = makeFormScan();
    scan.fields[2] = makeField({ index: 2, inputType: "file" });
    expect(assessApplicationForm(scan)).toMatchObject({ outcome: "found", cvIndex: 2, cvEvidence: "first-file" });
  });

  it("does not combine recognition signals from unrelated forms or ungrouped controls", () => {
    const scan = makeFormScan();
    scan.fields[2] = makeField({ index: 2, inputType: "file", formIndex: 1, areaKey: "form:1" });
    expect(assessApplicationForm(scan).outcome).toBe("partial");
    expect(assessApplicationForm({ ...scan, fields: scan.fields.map((field) => ({ ...field, areaKey: null })) }).outcome).toBe("absent");
  });

  it("prefers resume autofill over attachment and excludes cover letters from CV fallback", () => {
    const scan = makeFormScan({ fields: [makeField({ label: "First name" }), makeField({ index: 1, inputType: "email" }),
      makeField({ index: 2, inputType: "file", label: "Cover letter" }), makeField({ index: 3, inputType: "file", label: "Resume attachment" }),
      makeField({ index: 4, inputType: "file", label: "Upload résumé to autofill" }), makeField({ index: 5, inputType: "file", label: "Certificates" })] });
    expect(assessApplicationForm(scan)).toMatchObject({ outcome: "found", fileIndices: [2, 3, 4, 5], cvIndex: 4, cvEvidence: "label" });
  });

  it("finds the form even if its only upload is labelled cover letter", () => {
    const scan = makeFormScan();
    scan.fields[2] = makeField({ index: 2, inputType: "file", label: "Cover letter" });
    expect(assessApplicationForm(scan)).toMatchObject({ outcome: "found", cvIndex: null });
  });

  it("recognizes metadata evidence without mistaking company name or a checkbox for applicant fields", () => {
    const scan = makeFormScan({ fields: [makeField({ autocomplete: "given-name" }), makeField({ index: 1, name: "candidate_email" }), makeField({ index: 2, inputType: "file" })] });
    expect(assessApplicationForm(scan).outcome).toBe("found");
    scan.fields[0] = makeField({ label: "Company name" });
    scan.fields[1] = makeField({ index: 1, inputType: "checkbox", label: "Email updates" });
    expect(assessApplicationForm(scan).outcome).toBe("absent");
  });

  it("reports ambiguity when two form areas contain all recognition signals", () => {
    const scan = makeFormScan();
    scan.fields.push(...scan.fields.map((field) => ({ ...field, index: field.index + 3, areaKey: "form:1", formIndex: 1 })));
    expect(assessApplicationForm(scan).outcome).toBe("ambiguous");
  });
});

