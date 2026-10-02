import { isApplicantEmail, isApplicantName, isFileUploadField } from "../shared/discovery-rules";
import type { ApplicationField } from "../shared/application-form";
import type { DetectedField } from "./detect-fields";

function containsApplicationFormSignals(fields: ApplicationField[]): boolean {
  if (!fields.some(isApplicantName)) return false;
  if (!fields.some(isApplicantEmail)) return false;
  return fields.some(isFileUploadField);
}

function isApplicationAreaContainer(parent: HTMLElement, detected: DetectedField[]): boolean {
  const fields = detected
    .filter((candidate) => candidate.field.formIndex === null && parent.contains(candidate.element))
    .map((candidate) => candidate.field);
  if (containsApplicationFormSignals(fields)) return true;
  return parent.matches('[role="form"], [role="dialog"], dialog');
}

export function assignFieldAreas(detected: DetectedField[]): void {
  const containers = new Map<HTMLElement, string>();
  for (const { element, field } of detected) {
    if (field.formIndex !== null) {
      field.areaKey = `form:${field.formIndex}`;
      continue;
    }
    for (let parent = element.parentElement; parent && !parent.matches("body, html"); parent = parent.parentElement) {
      // Group controls only when their common container has all recognition signals.
      if (!isApplicationAreaContainer(parent, detected)) continue;
      const key = containers.get(parent) ?? `area:${containers.size}`;
      containers.set(parent, key);
      field.areaKey = key;
      break;
    }
  }
}
