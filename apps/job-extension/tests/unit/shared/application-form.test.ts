import { describe, expect, it } from "vitest";
import { isApplicationForm } from "../../../src/shared/application-form";

describe("isApplicationForm", () => {
  it("rejects malformed data at the tab-to-popup boundary", () => {
    const validForm = { pageOrigin: "https://example.com", pageTitle: "Apply", fields: [], truncated: false, actions: [], actionsTruncated: false };
    expect(isApplicationForm(validForm)).toBe(true);
    expect(isApplicationForm({ pageOrigin: "https://example.com", pageTitle: "Apply", fields: [{ name: "email" }], truncated: false })).toBe(false);
    expect(isApplicationForm({ pageOrigin: "https://example.com", pageTitle: "Apply", fields: [], truncated: "false" })).toBe(false);
    expect(isApplicationForm({ ...validForm, actions: [{ kind: "link", label: "Apply" }] })).toBe(false);
  });
});
