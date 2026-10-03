import { END } from "@langchain/langgraph/web";
import { hasFoundApplicationForm, hasResolvedJobContext, hasSelectedAction, isDiscoveryStopped } from "./guards";
import type { DiscoverySession } from "./session";

interface DiscoveryRouteState {
  session: DiscoverySession;
}

export function routeAfterContextAcquisition({ session }: DiscoveryRouteState): typeof END | "scan" | "contextDecision" {
  if (isDiscoveryStopped(session)) return END;
  if (hasResolvedJobContext(session)) return "scan";
  return "contextDecision";
}

export function routeAfterContextDecision({ session }: DiscoveryRouteState): typeof END | "scan" | "acquireContext" {
  if (isDiscoveryStopped(session)) return END;
  if (hasResolvedJobContext(session)) return "scan";
  return "acquireContext";
}

export function routeAfterScan({ session }: DiscoveryRouteState): typeof END | "assess" {
  if (isDiscoveryStopped(session)) return END;
  return "assess";
}

export function routeAfterAssessment({ session }: DiscoveryRouteState): typeof END | "learn" | "choose" {
  if (hasFoundApplicationForm(session)) return "learn";
  if (isDiscoveryStopped(session)) return END;
  return "choose";
}

export function routeAfterActionSelection({ session }: DiscoveryRouteState): typeof END | "click" | "llmActionChoice" {
  if (isDiscoveryStopped(session)) return END;
  if (hasSelectedAction(session)) return "click";
  return "llmActionChoice";
}

export function routeAfterLlmSelection({ session }: DiscoveryRouteState): typeof END | "click" | "manual" {
  if (isDiscoveryStopped(session)) return END;
  if (hasSelectedAction(session)) return "click";
  return "manual";
}

export function routeAfterManualSelection({ session }: DiscoveryRouteState): typeof END | "click" {
  if (isDiscoveryStopped(session)) return END;
  return "click";
}

export function routeAfterClick({ session }: DiscoveryRouteState): typeof END | "wait" {
  if (isDiscoveryStopped(session)) return END;
  return "wait";
}

export function routeAfterPageWait({ session }: DiscoveryRouteState): typeof END | "scan" {
  if (isDiscoveryStopped(session)) return END;
  return "scan";
}
