import type { JobContext } from "../discovery/session";
import { normalizeExpression, type LearnedAction } from "../shared/discovery-rules";
import { isRecord } from "../shared/value-guards";

const LEARNED_KEY = "learnedApplicationActions";
const MAX_LEARNED_LABELS = 100;

function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > 4096) return false;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isJobContext(value: unknown): value is JobContext {
  if (!isRecord(value)) return false;
  if (typeof value.jobDescription !== "string") return false;
  if (value.jobDescription.length > 20_000) return false;
  if (!isWebUrl(value.sourceUrl)) return false;
  if (!isWebUrl(value.lastPageUrl)) return false;
  if (typeof value.capturedAt !== "string") return false;
  if (!Number.isFinite(Date.parse(value.capturedAt))) return false;
  return true;
}

function isLearnedAction(value: unknown): value is LearnedAction {
  if (!isRecord(value)) return false;
  if (!isWebUrl(value.origin)) return false;
  if (new URL(value.origin).origin !== value.origin) return false;
  if (typeof value.label !== "string") return false;
  if (value.label.length === 0) return false;
  if (value.label.length > 200) return false;
  if (normalizeExpression(value.label) !== value.label) return false;
  return true;
}

export async function loadJobContext(tabId: number): Promise<JobContext | null> {
  const key = `jobContext:${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const value: unknown = stored[key];
  if (!isJobContext(value)) return null;
  return value;
}

export async function saveJobContext(tabId: number, context: JobContext): Promise<void> {
  await chrome.storage.session.set({ [`jobContext:${tabId}`]: context });
}

export async function loadLearnedActions(): Promise<LearnedAction[]> {
  const stored = await chrome.storage.local.get(LEARNED_KEY);
  const value: unknown = stored[LEARNED_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isLearnedAction).slice(-MAX_LEARNED_LABELS);
}

export async function saveLearnedAction(action: LearnedAction): Promise<void> {
  if (!isLearnedAction(action)) throw new Error("Invalid learned action.");
  const actions = await loadLearnedActions();
  if (actions.some((entry) => entry.origin === action.origin && entry.label === action.label)) return;
  await chrome.storage.local.set({ [LEARNED_KEY]: [...actions, action].slice(-MAX_LEARNED_LABELS) });
}
