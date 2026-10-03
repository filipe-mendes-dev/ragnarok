import type { ReactElement } from "react";
import { AccountStatus } from "./components/AccountStatus";
import { ScanResult } from "./components/ScanResult";
import { SidepanelToolbar } from "./components/SidepanelToolbar";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { useSidepanel } from "./hooks/useSidepanel";

export function App(): ReactElement {
  const { state, actions } = useSidepanel();

  return (
    <main>
      <h1>Job form inspector</h1>
      <p className="intro">Scan this page or locate its application form. Discovery can click navigation actions. Automatic fallback sends the page title and eligible action labels to RAGnarok.</p>
      <AccountStatus />
      <SidepanelToolbar
        busy={state.busy}
        canStopDiscovery={state.canStopDiscovery}
        onScan={actions.scanPage}
        onDiscover={actions.discover}
        onStop={actions.stopDiscovery}
      />
      <p role="status" aria-live="polite">{state.status}</p>
      <DiscoveryPanel
        session={state.session}
        context={state.context}
        trace={state.trace}
        busy={state.busy}
        onSelect={actions.selectAction}
        onContextDecision={actions.decideContext}
      />
      {state.scan && <ScanResult scan={state.scan} />}
    </main>
  );
}
