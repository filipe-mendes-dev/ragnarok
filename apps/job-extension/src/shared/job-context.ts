import { isRecord } from "./value-guards";

export const MAX_JOB_DESCRIPTION_LENGTH = 20_000;

export interface JobContext {
  jobDescription: string;
  sourceUrl: string;
  lastPageUrl: string;
  capturedAt: string;
}

export function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length > 4096) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isJobContext(value: unknown): value is JobContext {
  if (!isRecord(value)) return false;
  if (typeof value.jobDescription !== "string") return false;
  if (!value.jobDescription.trim()) return false;
  if (value.jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) return false;
  if (!isWebUrl(value.sourceUrl)) return false;
  if (!isWebUrl(value.lastPageUrl)) return false;
  if (typeof value.capturedAt !== "string") return false;
  return Number.isFinite(Date.parse(value.capturedAt));
}
