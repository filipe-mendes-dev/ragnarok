import { describe, expect, it } from "vitest";
import { chooseApplicationAction } from "../../../src/shared/discovery-rules";
import { makeAction, makeScan } from "../support/page-scan-fixtures";

describe("chooseApplicationAction", () => {
  it("matches normalized application-opening phrases and rejects final submission", () => {
    const scan = makeScan({ actions: [makeAction({ label: " Apply for this Job! " }), makeAction({ index: 1, label: "Submit Application" })] });
    expect(chooseApplicationAction(scan, [])).toMatchObject({ action: { index: 0 }, source: "keyword", candidates: [{ index: 0 }] });
  });

  it("prefers explicit apply wording when an application tab also matches", () => {
    const scan = makeScan({ actions: [
      makeAction({ index: 1, label: "Back to ElevenLabs’s Job Listings" }),
      makeAction({ index: 2, label: "Overview" }),
      makeAction({ index: 3, label: "Application" }),
      makeAction({ index: 4, label: "Apply for this Job" }),
    ] });
    expect(chooseApplicationAction(scan, [])).toMatchObject({ action: { index: 4 }, source: "keyword" });
  });

  it("uses scan index to break ties without reordering the page inventory", () => {
    const first = makeAction({ index: 9 });
    const second = makeAction({ index: 2 });
    const scan = makeScan({ actions: [first, second] });
    expect(chooseApplicationAction(scan, []).action).toBe(second);
    expect(scan.actions).toEqual([first, second]);
  });

  it("preserves unknown eligible actions for fallback without matching arbitrary substrings", () => {
    const scan = makeScan({ actions: [makeAction({ label: "Application settings" })] });
    expect(chooseApplicationAction(scan, [])).toEqual({ action: null, candidates: scan.actions, source: null });
  });

  it("uses learned exact labels only on their recorded origin", () => {
    const scan = makeScan({ actions: [makeAction({ label: "Join our team" })] });
    const learned = [{ origin: scan.pageOrigin, label: "join our team" }];
    expect(chooseApplicationAction(scan, learned).source).toBe("learned");
    expect(chooseApplicationAction({ ...scan, pageOrigin: "https://other.example.com" }, learned).action).toBeNull();
  });

  it("prefers explicit built-in wording over a learned phrase", () => {
    const scan = makeScan({ actions: [makeAction({ label: "Join our team" }), makeAction({ index: 1, label: "Start your application" })] });
    expect(chooseApplicationAction(scan, [{ origin: scan.pageOrigin, label: "join our team" }])).toMatchObject({ action: { index: 1 }, source: "keyword" });
  });

  it("excludes disabled, submitting, upload, new-tab, and non-web actions from all candidates", () => {
    const scan = makeScan({ actions: [makeAction({ disabled: true }), makeAction({ formIndex: 0, buttonType: "submit" }),
      makeAction({ label: "Upload resume" }), makeAction({ target: "_blank" }), makeAction({ href: "javascript:void(0)" })] });
    expect(chooseApplicationAction(scan, []).candidates).toEqual([]);
  });
});
