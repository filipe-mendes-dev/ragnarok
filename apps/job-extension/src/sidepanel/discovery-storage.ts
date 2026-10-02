import type { JobContext } from "../discovery/session";
import { normalizeExpression, type LearnedAction } from "../shared/discovery-rules";
import { isRecord } from "../shared/value-guards";
import { isJobContext, isWebUrl } from "../shared/job-context";
export { isJobContext } from "../shared/job-context";

const LEARNED_KEY = "learnedApplicationActions";
const MAX_LEARNED_LABELS = 100;

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
  if (!isJobContext(context)) throw new Error("Invalid job context.");
  await chrome.storage.session.set({ [`jobContext:${tabId}`]: context });
}

export async function clearJobContext(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`jobContext:${tabId}`);
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
