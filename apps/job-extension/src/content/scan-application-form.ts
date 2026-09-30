import type { ApplicationForm } from "../shared/application-form";
import { detectActions } from "./detect-actions";
import { detectFields } from "./detect-fields";
import { cleanText, getFormIndices } from "./dom";
import { resolveLabels } from "./resolve-labels";

export function scanApplicationForm(): ApplicationForm {
  const formIndices = getFormIndices();
  const fieldDetection = detectFields(formIndices);
  const actionDetection = detectActions(formIndices);

  return {
    pageOrigin: location.origin,
    pageTitle: cleanText(document.title) ?? "",
    fields: resolveLabels(fieldDetection.fields),
    truncated: fieldDetection.truncated,
    actions: actionDetection.actions,
    actionsTruncated: actionDetection.truncated,
  };
}
