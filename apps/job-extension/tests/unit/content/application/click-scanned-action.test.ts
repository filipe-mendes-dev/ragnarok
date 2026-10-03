import { beforeEach, describe, expect, it, vi } from "vitest";
import { clickScannedAction } from "../../../../src/content/application/click-scanned-action";
import { scanPage } from "../../../../src/content/application/scan-page";

beforeEach(() => { document.body.innerHTML = '<button type="button">Apply now</button>'; });

describe("clickScannedAction", () => {
  it("can click when serialized without module-level runtime helpers", () => {
    const handler = vi.fn();
    document.querySelector("button")?.addEventListener("click", handler);
    const scan = scanPage();
    const serializedClick: unknown = new Function(`return (${clickScannedAction.toString()});`)();
    if (typeof serializedClick !== "function") throw new Error("Expected a serialized click function.");
    expect(serializedClick(scan.scanId, 0)).toEqual({ clicked: true, reason: "Action clicked." });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clicks the scanned element once and consumes the snapshot", () => {
    const handler = vi.fn();
    document.querySelector("button")?.addEventListener("click", handler);
    const scan = scanPage();
    expect(clickScannedAction(scan.scanId, 0).clicked).toBe(true);
    expect(clickScannedAction(scan.scanId, 0).clicked).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale scan or changed action rather than trusting its old index", () => {
    const handler = vi.fn();
    const button = document.querySelector("button");
    button?.addEventListener("click", handler);
    const scan = scanPage();
    expect(clickScannedAction("old-scan", 0).clicked).toBe(false);
    if (button) button.textContent = "Submit application";
    expect(clickScannedAction(scan.scanId, 0).clicked).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects submit controls and actions hidden after scanning", () => {
    document.body.innerHTML = '<form><button type="submit">Apply now</button></form>';
    let scan = scanPage();
    expect(clickScannedAction(scan.scanId, 0).clicked).toBe(false);
    document.body.innerHTML = '<div><button type="button">Apply</button></div>';
    scan = scanPage();
    const parent = document.querySelector("div");
    if (parent) parent.hidden = true;
    expect(clickScannedAction(scan.scanId, 0).clicked).toBe(false);
  });
});
