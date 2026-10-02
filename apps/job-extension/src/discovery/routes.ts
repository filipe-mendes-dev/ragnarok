import { END } from "@langchain/langgraph/web";
import { hasFoundApplicationForm, hasSelectedAction, isDiscoveryStopped } from "./guards";
import type { DiscoverySession } from "./session";

interface DiscoveryRouteState {
  session: DiscoverySession;
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

export function routeAfterActionSelection({ session }: DiscoveryRouteState): typeof END | "click" | "manual" {
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
