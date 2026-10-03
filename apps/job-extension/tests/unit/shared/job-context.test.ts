import { describe, expect, it } from "vitest";
import { isJobContext, isWebUrl } from "../../../src/shared/job-context";
import { makeAcceptedContext } from "../support/job-context-fixtures";

describe("isJobContext", () => {
  it("accepts captured text and source metadata without the removed evidence structures", () => {
    expect(isJobContext(makeAcceptedContext())).toBe(true);
  });

  it.each([null, {}, { jobDescription: "Some text" }])("rejects missing context metadata: %j", (value: unknown) => {
    expect(isJobContext(value)).toBe(false);
  });

  it.each([
    { jobDescription: " " },
    { jobDescription: "x".repeat(20_001) },
    { sourceUrl: "javascript:void(0)" },
    { lastPageUrl: "chrome://extensions" },
    { capturedAt: "invalid" },
  ])("rejects malformed captured context", (overrides) => {
    expect(isJobContext({ ...makeAcceptedContext(), ...overrides })).toBe(false);
  });
});

describe("isWebUrl", () => {
  it("accepts HTTP(S) pages and rejects non-web or oversized destinations", () => {
    expect(isWebUrl("http://localhost:3000/job")).toBe(true);
    expect(isWebUrl("https://jobs.example.com/job")).toBe(true);
    for (const value of [null, "", "not a URL", "javascript:void(0)", `https://example.com/${"x".repeat(4096)}`]) {
      expect(isWebUrl(value)).toBe(false);
    }
  });
});
