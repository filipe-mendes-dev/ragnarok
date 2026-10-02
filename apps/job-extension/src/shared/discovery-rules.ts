import type { ApplicationAction, PageScan } from "./page-scan";

export interface LearnedAction {
  origin: string;
  label: string;
}

export interface ActionSelection {
  action: ApplicationAction | null;
  candidates: ApplicationAction[];
  source: "keyword" | "learned" | "manual" | null;
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

export function isScanIncomplete(scan: PageScan): boolean {
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

export function chooseApplicationAction(scan: PageScan, learned: LearnedAction[]): ActionSelection {
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

export function pageFingerprint(scan: PageScan): string {
  return JSON.stringify([scan.pageUrl, scan.pageTitle, scan.fields, scan.actions]);
}
