import type { ApplicationAction, ApplicationForm } from "../shared/application-form";
import { isEligibleNavigationAction, recognizeApplicationActionLabel } from "../shared/discovery-rules";
import type { DiscoverySession } from "./session";

interface SessionWithPageScan extends DiscoverySession {
  scan: ApplicationForm;
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

export function hasChangedOrigin(session: DiscoverySession, scan: ApplicationForm): boolean {
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
  return session.status === "paused";
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
