import type { ApplicationAction, ApplicationForm } from "../shared/application-form";
import type { FormAssessment, LearnedAction } from "../shared/discovery-rules";

export interface JobContext {
  jobDescription: string;
  sourceUrl: string;
  lastPageUrl: string;
  capturedAt: string;
}

export interface DiscoverySession {
  tabId: number;
  status: "running" | "paused" | "found" | "stopped";
  stage: string;
  message: string;
  scan: ApplicationForm | null;
  context: JobContext | null;
  assessment: FormAssessment | null;
  candidates: ApplicationAction[];
  selectedAction: ApplicationAction | null;
  selectionSource: "keyword" | "learned" | "manual" | null;
  manualResponse: number | null;
  clicks: number;
  visited: string[];
  learned: LearnedAction[];
  previousOrigin: string | null;
  previousLabel: string | null;
  learnPrevious: boolean;
}

export interface DiscoveryPort {
  scan(): Promise<ApplicationForm>;
  click(scan: ApplicationForm, action: ApplicationAction): Promise<void>;
  waitForChange(scan: ApplicationForm): Promise<void>;
  saveContext(context: JobContext): Promise<void>;
  learnAction(action: LearnedAction): Promise<void>;
}

export function createDiscoverySession(tabId: number, learned: LearnedAction[] = [], context: JobContext | null = null): DiscoverySession {
  return { tabId, status: "running", stage: "start", message: "Starting discovery.", scan: null, context,
    assessment: null, candidates: [], selectedAction: null, selectionSource: null, manualResponse: null, clicks: 0,
    visited: [], learned, previousOrigin: null, previousLabel: null, learnPrevious: false };
}
