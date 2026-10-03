import type { ApplicationAction, PageScan } from "../shared/page-scan";
import type { FormAssessment } from "../shared/form-discovery";
import type { LearnedAction } from "../shared/discovery-rules";
import type { JobContext } from "../shared/job-context";
export type { JobContext } from "../shared/job-context";

export interface DiscoverySession {
  tabId: number;
  status: "running" | "paused" | "found" | "stopped";
  stage: string;
  message: string;
  scan: PageScan | null;
  context: JobContext | null;
  contextSkipped: boolean;
  contextResponse: "retry" | "skip" | null;
  pauseReason: "context" | "action" | null;
  assessment: FormAssessment | null;
  candidates: ApplicationAction[];
  selectedAction: ApplicationAction | null;
  selectionSource: "keyword" | "learned" | "llm" | "manual" | null;
  manualResponse: number | null;
  clicks: number;
  visited: string[];
  learned: LearnedAction[];
  previousOrigin: string | null;
  previousLabel: string | null;
  learnPrevious: boolean;
}

export interface DiscoveryPort {
  readContext(): Promise<JobContext | null>;
  scan(): Promise<PageScan>;
  selectActionWithLlm(scan: PageScan, candidates: ApplicationAction[]): Promise<ApplicationAction | null>;
  click(scan: PageScan, action: ApplicationAction): Promise<void>;
  waitForChange(scan: PageScan): Promise<void>;
  saveContext(context: JobContext): Promise<void>;
  clearContext(): Promise<void>;
  learnAction(action: LearnedAction): Promise<void>;
}

export function createDiscoverySession(tabId: number, learned: LearnedAction[] = []): DiscoverySession {
  return {
    tabId,
    status: "running",
    stage: "start",
    message: "Starting with job context acquisition.",
    scan: null,
    context: null,
    contextSkipped: false,
    contextResponse: null,
    pauseReason: null,
    assessment: null,
    candidates: [],
    selectedAction: null,
    selectionSource: null,
    manualResponse: null,
    clicks: 0,
    visited: [],
    learned,
    previousOrigin: null,
    previousLabel: null,
    learnPrevious: false,
  };
}
