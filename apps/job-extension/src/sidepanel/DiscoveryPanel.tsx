import type { DiscoverySession, JobContext } from "../discovery/session";

interface DiscoveryPanelProps {
  session: DiscoverySession | null;
  context: JobContext | null;
  trace: string[];
  busy: boolean;
  onSelect: (index: number | null) => void;
}

function getCvCandidateMessage(session: DiscoverySession): string {
  const cvIndex = session.assessment?.cvIndex;
  const cv = session.scan?.fields.find((field) => field.index === cvIndex);
  if (!cv) return "Form located. No CV candidate was distinguished from the other uploads.";
  const label = cv.label ?? cv.name ?? `file input ${cv.index + 1}`;
  const evidence = session.assessment?.cvEvidence === "label" ? "label match" : "first-file fallback";
  return `CV candidate: ${label} (${evidence}).`;
}

export function DiscoveryPanel({ session, context, trace, busy, onSelect }: DiscoveryPanelProps) {
  return (
    <section aria-label="Application discovery">
      {context && <details open className="job-context"><summary>Captured job description</summary>
        <p className="origin">Source: {context.sourceUrl}</p>
        <p className="description-text">{context.jobDescription}</p>
      </details>}
      {session?.status === "found" && <p className="notice">{getCvCandidateMessage(session)}</p>}
      {session?.status === "paused" && <div>
        <h2>Choose the action that opens the application</h2>
        <p>Choosing an action resumes the graph and clicks it. Submission and upload actions are excluded.</p>
        <ol className="action-list">{session.candidates.map((action) => <li key={action.index}>
          <button type="button" className="candidate-action" disabled={busy} onClick={() => onSelect(action.index)}>{action.label}</button>
        </li>)}</ol>
        <button type="button" disabled={busy} onClick={() => onSelect(null)}>Cancel discovery</button>
      </div>}
      {trace.length > 0 && <details open><summary>Discovery steps ({session?.clicks ?? 0}/5 clicks)</summary>
        <ol className="discovery-trace">{trace.map((entry, index) => <li key={index}>{entry}</li>)}</ol>
      </details>}
    </section>
  );
}
