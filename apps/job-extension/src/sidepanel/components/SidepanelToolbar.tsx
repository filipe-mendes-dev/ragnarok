import type { ReactElement } from "react";

interface SidepanelToolbarProps {
  busy: boolean;
  canStopDiscovery: boolean;
  onScan: () => Promise<void>;
  onDiscover: () => Promise<void>;
  onStop: () => void;
}

export function SidepanelToolbar({ busy, canStopDiscovery, onScan, onDiscover, onStop }: SidepanelToolbarProps): ReactElement {
  return (
    <div className="toolbar">
      <button type="button" onClick={() => void onScan()} disabled={busy}>Scan page</button>
      <button type="button" onClick={() => void onDiscover()} disabled={busy}>Find application form</button>
      {canStopDiscovery && <button type="button" onClick={onStop}>Stop discovery</button>}
    </div>
  );
}
