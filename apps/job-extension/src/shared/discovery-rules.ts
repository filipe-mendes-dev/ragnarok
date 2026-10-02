import type { ApplicationAction, ApplicationField, ApplicationForm } from "./application-form";

export interface FormAssessment {
  outcome: "found" | "partial" | "absent" | "ambiguous";
  areaKey: string | null;
  nameIndex: number | null;
  emailIndex: number | null;
  fileIndices: number[];
  cvIndex: number | null;
  cvEvidence: "label" | "first-file" | null;
}

export interface LearnedAction {
  origin: string;
  label: string;
}

export interface ActionSelection {
  action: ApplicationAction | null;
  candidates: ApplicationAction[];
  source: "keyword" | "learned" | "manual" | null;
}

interface AreaEvidence {
  name: ApplicationField | undefined;
  email: ApplicationField | undefined;
  files: ApplicationField[];
}

interface CompleteAreaEvidence extends AreaEvidence {
  name: ApplicationField;
  email: ApplicationField;
}

interface CvSelection {
  cvIndex: number | null;
  cvEvidence: FormAssessment["cvEvidence"];
}

interface RecognizedAction {
  action: ApplicationAction;
  source: "keyword" | "learned";
}

const OPEN_APPLICATION = /^(?:apply|apply now|apply for (?:this|the) (?:job|role|position)|apply for (?:job|role|position)|application|job application|start (?:your )?application|begin (?:your )?application)$/;
const EXCLUDED_ACTION = /\b(?:submit|send|withdraw|delete|cancel|sign in|log in|login|sign out|logout|upload|download|cover letter|certificate|job alert|save job)\b/;

export function normalizeExpression(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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

function chooseCvUpload(files: ApplicationField[]): CvSelection {
  const eligible = files.filter((field) => !isNonCvUpload(field));
  const resumeUploads = eligible.filter(hasResumeLabel);
  const autofillUpload = resumeUploads.find(hasAutofillLabel);
  if (autofillUpload) return { cvIndex: autofillUpload.index, cvEvidence: "label" };

  const labelledUpload = resumeUploads[0];
  if (labelledUpload) return { cvIndex: labelledUpload.index, cvEvidence: "label" };

  const firstEligibleUpload = eligible[0];
  if (firstEligibleUpload) return { cvIndex: firstEligibleUpload.index, cvEvidence: "first-file" };
  return { cvIndex: null, cvEvidence: null };
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

function collectAreaEvidence(fields: ApplicationField[]): AreaEvidence {
  return {
    name: fields.find(isApplicantName),
    email: fields.find(isApplicantEmail),
    files: fields.filter(isFileUploadField),
  };
}

function hasCompleteFormEvidence(evidence: AreaEvidence): evidence is CompleteAreaEvidence {
  if (!evidence.name) return false;
  if (!evidence.email) return false;
  if (evidence.files.length === 0) return false;
  return true;
}

function hasPartialFormEvidence(evidence: AreaEvidence): boolean {
  const signalCount = Number(Boolean(evidence.name)) + Number(Boolean(evidence.email)) + Number(evidence.files.length > 0);
  return signalCount >= 2;
}

function createUnmatchedAssessment(outcome: "partial" | "absent" | "ambiguous"): FormAssessment {
  return { outcome, areaKey: null, nameIndex: null, emailIndex: null, fileIndices: [], cvIndex: null, cvEvidence: null };
}

export function assessApplicationForm(scan: ApplicationForm): FormAssessment {
  const matches: FormAssessment[] = [];
  let partial = false;
  for (const [areaKey, fields] of groupFieldsByArea(scan.fields)) {
    const evidence = collectAreaEvidence(fields);
    if (hasPartialFormEvidence(evidence)) partial = true;
    if (!hasCompleteFormEvidence(evidence)) continue;
    matches.push({
      outcome: "found",
      areaKey,
      nameIndex: evidence.name.index,
      emailIndex: evidence.email.index,
      fileIndices: evidence.files.map((field) => field.index),
      ...chooseCvUpload(evidence.files),
    });
  }

  // Inspect every area before accepting a match so a second complete form remains ambiguous.
  if (matches.length === 1 && matches[0]) return matches[0];
  if (matches.length > 1) return createUnmatchedAssessment("ambiguous");
  if (partial) return createUnmatchedAssessment("partial");
  return createUnmatchedAssessment("absent");
}

export function hasUncertainFormEvidence(assessment: FormAssessment): boolean {
  if (assessment.outcome === "partial") return true;
  return assessment.outcome === "ambiguous";
}

export function isScanIncomplete(scan: ApplicationForm): boolean {
  if (scan.truncated) return true;
  return scan.actionsTruncated;
}

function hasExcludedActionLabel(action: ApplicationAction): boolean {
  return EXCLUDED_ACTION.test(normalizeExpression(action.label ?? ""));
}

function isSubmissionAction(action: ApplicationAction): boolean {
  if (action.buttonType !== "submit") return false;
  return action.formIndex !== null;
}

function isResetAction(action: ApplicationAction): boolean {
  return action.buttonType === "reset";
}

function opensAnotherBrowsingContext(action: ApplicationAction): boolean {
  if (!action.target) return false;
  return !["_self", "_top", "_parent"].includes(action.target);
}

function hasNonWebDestination(action: ApplicationAction): boolean {
  if (!action.href) return false;
  try {
    return !["https:", "http:"].includes(new URL(action.href).protocol);
  } catch {
    return true;
  }
}

export function isEligibleNavigationAction(action: ApplicationAction): boolean {
  if (action.disabled) return false;
  if (!action.label) return false;
  if (hasExcludedActionLabel(action)) return false;
  if (isResetAction(action)) return false;
  if (isSubmissionAction(action)) return false;
  if (opensAnotherBrowsingContext(action)) return false;
  if (hasNonWebDestination(action)) return false;
  return true;
}

export function recognizeApplicationActionLabel(label: string, origin: string, learned: LearnedAction[]): RecognizedAction["source"] | null {
  const normalizedLabel = normalizeExpression(label);
  if (OPEN_APPLICATION.test(normalizedLabel)) return "keyword";
  if (learned.some((entry) => entry.origin === origin && entry.label === normalizedLabel)) return "learned";
  return null;
}

export function chooseApplicationAction(scan: ApplicationForm, learned: LearnedAction[]): ActionSelection {
  const candidates = scan.actions.filter(isEligibleNavigationAction);
  const matches: RecognizedAction[] = [];
  for (const action of candidates) {
    const source = recognizeApplicationActionLabel(action.label ?? "", scan.pageOrigin, learned);
    if (source === null) continue;
    matches.push({ action, source });
  }
  if (matches.length !== 1) return { action: null, candidates, source: null };
  const match = matches[0];
  if (!match) return { action: null, candidates, source: null };
  return { action: match.action, candidates, source: match.source };
}

export function pageFingerprint(scan: ApplicationForm): string {
  return JSON.stringify([scan.pageUrl, scan.pageTitle, scan.fields, scan.actions]);
}
