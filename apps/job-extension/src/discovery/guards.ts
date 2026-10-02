import type { ApplicationAction, PageScan } from "../shared/page-scan";
import { isEligibleNavigationAction, recognizeApplicationActionLabel } from "../shared/discovery-rules";
import type { DiscoverySession } from "./session";

interface SessionWithPageScan extends DiscoverySession {
  scan: PageScan;
}

interface SessionWithSelectedAction extends DiscoverySession {
  selectedAction: ApplicationAction;
}

interface SessionWithPreviousAction extends SessionWithPageScan {
  previousOrigin: string;
  previousLabel: string;
}

interface PausedDiscoverySession extends DiscoverySession {
  status: "paused";
}

export function hasPageScan(session: DiscoverySession): session is SessionWithPageScan {
  return session.scan !== null;
}

export function hasSelectedAction(session: DiscoverySession): session is SessionWithSelectedAction {
  return session.selectedAction !== null;
}

export function hasChangedOrigin(session: DiscoverySession, scan: PageScan): boolean {
  if (!hasPageScan(session)) return false;
  return scan.pageOrigin !== session.scan.pageOrigin;
}

export function isDiscoveryStopped(session: DiscoverySession): boolean {
  return session.status === "stopped";
}

export function hasFoundApplicationForm(session: DiscoverySession): boolean {
  return session.status === "found";
}

export function isWaitingForManualSelection(session: DiscoverySession | null): session is PausedDiscoverySession {
  if (!session) return false;
  if (session.status !== "paused") return false;
  return session.pauseReason === "action";
}

export function isWaitingForContextDecision(session: DiscoverySession | null): session is PausedDiscoverySession {
  if (!session) return false;
  if (session.status !== "paused") return false;
  return session.pauseReason === "context";
}

export function hasResolvedJobContext(session: DiscoverySession): boolean {
  if (session.contextSkipped) return true;
  return session.context !== null;
}

export function hasLearnablePreviousAction(session: DiscoverySession): session is SessionWithPreviousAction {
  if (!session.learnPrevious) return false;
  if (!session.previousOrigin) return false;
  if (!session.previousLabel) return false;
  if (!hasPageScan(session)) return false;
  return true;
}

export function hasRecognizedSelectedAction(session: SessionWithPageScan): boolean {
  if (!hasSelectedAction(session)) return false;
  if (!isEligibleNavigationAction(session.selectedAction)) return false;
  return recognizeApplicationActionLabel(session.selectedAction.label ?? "", session.scan.pageOrigin, session.learned) !== null;
}
