import type { PageScan } from "../../shared/page-scan";
import { captureJobDescription } from "../capture-job-description";
import { cleanText, getFormIndices } from "../dom";
import { scanActions } from "./scan-actions";
import { scanFields } from "./scan-fields";
import type { ScannerWindow } from "./scan-snapshot";

export function scanPage(): PageScan {
  const formIndices = getFormIndices();
  const fieldScan = scanFields(formIndices);
  const actionScan = scanActions(formIndices);
  const scanId = crypto.randomUUID();

  (window as ScannerWindow).__ragnarokScan = {
    id: scanId,
    pageUrl: location.href,
    elements: actionScan.elements,
    markup: actionScan.elements.map((element) => element.outerHTML),
  };

  return {
    pageOrigin: location.origin,
    pageUrl: location.href,
    pageTitle: cleanText(document.title) ?? "",
    scanId,
    jobDescription: captureJobDescription(),
    fields: fieldScan.fields,
    truncated: fieldScan.truncated,
    actions: actionScan.actions,
    actionsTruncated: actionScan.truncated,
  };
}
