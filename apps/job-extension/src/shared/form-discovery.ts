import type { ApplicationField, PageScan } from "./page-scan";
import { normalizeExpression } from "./discovery-rules";

export interface FormAssessment {
  outcome: "found" | "partial" | "absent" | "ambiguous";
  areaKey: string | null;
  nameIndex: number | null;
  emailIndex: number | null;
  fileIndices: number[];
  cvIndex: number | null;
  cvEvidence: "label" | "first-file" | null;
}

export function assessApplicationForm(scan: PageScan): FormAssessment {
  let found: FormAssessment | null = null;
  let partial: FormAssessment | null = null;

  for (const [areaKey, fields] of groupFieldsByArea(scan.fields)) {
    const name = fields.find(isApplicantName);
    const email = fields.find(isApplicantEmail);
    const files = fields.filter(isFileUploadField);
    const signalCount = Number(Boolean(name)) + Number(Boolean(email)) + Number(files.length > 0);
    if (signalCount < 2) continue;

    const cv = findCvUpload(files);
    const assessment: FormAssessment = {
      outcome: signalCount === 3 ? "found" : "partial",
      areaKey,
      nameIndex: name?.index ?? null,
      emailIndex: email?.index ?? null,
      fileIndices: files.map((field) => field.index),
      cvIndex: cv?.index ?? null,
      cvEvidence: cv ? (hasResumeLabel(cv) ? "label" : "first-file") : null,
    };
    if (assessment.outcome === "partial") {
      partial ??= assessment;
      continue;
    }
    if (found) return unmatchedAssessment("ambiguous");
    found = assessment;
  }

  return found ?? partial ?? unmatchedAssessment("absent");
}

export function getMissingFormSignals(assessment: FormAssessment): string[] {
  const missing: string[] = [];
  if (assessment.nameIndex === null) missing.push("name");
  if (assessment.emailIndex === null) missing.push("email");
  if (assessment.fileIndices.length === 0) missing.push("file input");
  return missing;
}

function unmatchedAssessment(outcome: "absent" | "ambiguous"): FormAssessment {
  return { outcome, areaKey: null, nameIndex: null, emailIndex: null, fileIndices: [], cvIndex: null, cvEvidence: null };
}

function getNormalizedFieldExpressions(field: ApplicationField): string[] {
  return [field.label, field.name, field.id, field.placeholder]
    .filter((value): value is string => value !== null)
    .map(normalizeExpression);
}

function hasApplicantNameAutocomplete(field: ApplicationField): boolean {
  if (!field.autocomplete) return false;
  return /(?:^|\s)(?:name|given-name)(?:$|\s)/.test(field.autocomplete);
}

function matchesApplicantNameExpression(value: string): boolean {
  if (/\b(?:full name|first name|given name|applicant name|candidate name)\b/.test(value)) return true;
  return /^name(?: required)?$/.test(value);
}

export function isApplicantName(field: ApplicationField): boolean {
  if (field.disabled) return false;
  if (field.control !== "input") return false;
  if (field.inputType !== "text") return false;
  if (hasApplicantNameAutocomplete(field)) return true;
  return getNormalizedFieldExpressions(field).some(matchesApplicantNameExpression);
}

export function isApplicantEmail(field: ApplicationField): boolean {
  if (field.disabled) return false;
  if (field.control !== "input") return false;
  if (!["text", "email"].includes(field.inputType ?? "")) return false;
  if (field.inputType === "email") return true;
  if (field.autocomplete === "email") return true;
  return getNormalizedFieldExpressions(field).some((value) => /\b(?:email|e mail)\b/.test(value));
}

export function isFileUploadField(field: ApplicationField): boolean {
  return field.inputType === "file";
}

function isNonCvUpload(field: ApplicationField): boolean {
  return getNormalizedFieldExpressions(field).some((value) => /\b(?:cover letter|certificate|certificates|portfolio)\b/.test(value));
}

function hasResumeLabel(field: ApplicationField): boolean {
  return getNormalizedFieldExpressions(field).some((value) => /\b(?:cv|resume|curriculum vitae)\b/.test(value));
}

function hasAutofillLabel(field: ApplicationField): boolean {
  return getNormalizedFieldExpressions(field).some((value) => /\b(?:autofill|auto fill|fill out)\b/.test(value));
}

function findCvUpload(files: ApplicationField[]): ApplicationField | null {
  const eligible = files.filter((field) => !isNonCvUpload(field));
  const resumeUploads = eligible.filter(hasResumeLabel);
  return resumeUploads.find(hasAutofillLabel) ?? resumeUploads[0] ?? eligible[0] ?? null;
}

function groupFieldsByArea(fields: ApplicationField[]): Map<string, ApplicationField[]> {
  const groups = new Map<string, ApplicationField[]>();
  for (const field of fields) {
    if (!field.areaKey) continue;
    if (field.disabled) continue;
    const group = groups.get(field.areaKey) ?? [];
    group.push(field);
    groups.set(field.areaKey, group);
  }
  return groups;
}

