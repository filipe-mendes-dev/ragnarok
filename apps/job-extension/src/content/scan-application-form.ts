import type { ApplicationForm } from "../shared/application-form";
import { detectActions } from "./detect-actions";
import { detectFields } from "./detect-fields";
import { cleanText, getFormIndices } from "./dom";
import { resolveLabels } from "./resolve-labels";
import { assignFieldAreas } from "./assign-field-areas";
import { captureJobDescription } from "./capture-job-description";
import type { ScannerWindow } from "./scan-snapshot";

export function scanApplicationForm(): ApplicationForm {
  const formIndices = getFormIndices();
  const fieldDetection = detectFields(formIndices);
  const actionDetection = detectActions(formIndices);
  const fields = resolveLabels(fieldDetection.fields);
  assignFieldAreas(fieldDetection.fields);
  const scanId = crypto.randomUUID();
  (window as ScannerWindow).__ragnarokScan = {
    id: scanId, pageUrl: location.href, elements: actionDetection.elements,
    markup: actionDetection.elements.map((element) => element.outerHTML),
  };

  return {
    pageOrigin: location.origin,
    pageUrl: location.href,
    pageTitle: cleanText(document.title) ?? "",
    scanId,
    jobDescription: captureJobDescription(),
    fields,
    truncated: fieldDetection.truncated,
    actions: actionDetection.actions,
    actionsTruncated: actionDetection.truncated,
  };
}
