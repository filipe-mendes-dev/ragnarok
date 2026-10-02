import { useEffect, useRef, useState } from "react";
import type { createDiscoveryGraph } from "../discovery/discovery-graph";
import { isWaitingForManualSelection } from "../discovery/guards";
import { createDiscoverySession, type DiscoverySession, type JobContext } from "../discovery/session";
import type { ApplicationAction, ApplicationField, ApplicationForm } from "../shared/application-form";
import { getActiveTabId, scanTab } from "./scan-active-tab";
import { createBrowserDiscoveryPort } from "./browser-discovery-port";
import { loadJobContext, loadLearnedActions, saveJobContext } from "./discovery-storage";
import { DiscoveryPanel } from "./DiscoveryPanel";

interface DiscoveryRun {
  graph: ReturnType<typeof createDiscoveryGraph>;
  threadId: string;
  controller: AbortController;
}

function resolveManualScanContext(scan: ApplicationForm, saved: JobContext | null): JobContext | null {
  // An explicit scan refreshes the description; discovery retains its first captured description.
  if (scan.jobDescription) {
    return {
      jobDescription: scan.jobDescription,
      sourceUrl: scan.pageUrl,
      lastPageUrl: scan.pageUrl,
      capturedAt: new Date().toISOString(),
    };
  }
  if (saved?.lastPageUrl === scan.pageUrl) return saved;
  return null;
}

function appendDiscoveryTrace(entries: string[], session: DiscoverySession): string[] {
  const entry = `${session.stage}: ${session.message}`;
  if (entries[entries.length - 1] === entry) return entries;
  return [...entries, entry].slice(-50);
}

function getScanStatusMessage(scan: ApplicationForm): string {
  const message = `Found ${scan.fields.length} fields and ${scan.actions.length} actions`;
  if (scan.truncated || scan.actionsTruncated) return `${message} (more may be present).`;
  return `${message}.`;
}

function FieldCard({ field }: { field: ApplicationField }) {
  return (
    <li className="field-card">
      <h3>{field.label ?? field.name ?? `Unlabeled field ${field.index + 1}`}</h3>
      {field.labelSource === "nearby" && <p className="label-hint">Plausible label from nearby text</p>}
      <dl>
        <dt>Control</dt><dd>{field.inputType ? `${field.control}: ${field.inputType}` : field.control}</dd>
        <dt>Form</dt><dd>{field.formIndex === null ? "Outside a form" : `Form ${field.formIndex + 1}`}</dd>
        {field.groupLabel && <><dt>Group</dt><dd>{field.groupLabel}</dd></>}
        {field.name && <><dt>Name</dt><dd>{field.name}</dd></>}
        {field.id && <><dt>ID</dt><dd>{field.id}</dd></>}
        {field.placeholder && <><dt>Placeholder</dt><dd>{field.placeholder}</dd></>}
        <dt>Required</dt><dd>{field.required ? "Yes" : "No"}</dd>
        <dt>Disabled</dt><dd>{field.disabled ? "Yes" : "No"}</dd>
      </dl>
      {field.options && (
        <details>
          <summary>Options ({field.optionCount ?? field.options.length})</summary>
          <ol>
            {field.options.map((option, index) => (
              <li key={index}>{option.label === option.value ? option.label : `${option.label} (${option.value})`}</li>
            ))}
          </ol>
          {(field.optionCount ?? 0) > field.options.length && <p>Showing the first {field.options.length} options.</p>}
        </details>
      )}
    </li>
  );
}

function ActionCard({ action }: { action: ApplicationAction }) {
  return (
    <li className="action-card">
      <strong>{action.label ?? `Unlabeled action ${action.index + 1}`}</strong>
      <span>{action.kind}{action.buttonType ? `: ${action.buttonType}` : ""}{action.disabled ? " · disabled" : ""}</span>
    </li>
  );
}

function ScanResult({ form }: { form: ApplicationForm }) {
  return (
    <section aria-label="Scan results">
      <h2>Last scan</h2>
      <h3>{form.pageTitle || "Untitled page"}</h3>
      <p className="origin">{form.pageOrigin}</p>
      <h2>Fields ({form.fields.length})</h2>
      {form.truncated && <p className="notice">Only the first 200 supported fields are shown.</p>}
      {form.fields.length > 0 ? <ol className="field-list">{form.fields.map((field) => <FieldCard key={field.index} field={field} />)}</ol> : <p>No supported fields found.</p>}
      <h2>Actions ({form.actions.length})</h2>
      {form.actionsTruncated && <p className="notice">Only the first 100 actions are shown.</p>}
      {form.actions.length > 0 ? <ol className="action-list">{form.actions.map((action) => <ActionCard key={action.index} action={action} />)}</ol> : <p>No buttons or links found.</p>}
      <details className="raw-result">
        <summary>Structured JSON</summary>
        <pre>{JSON.stringify(form, null, 2)}</pre>
      </details>
    </section>
  );
}

export function App() {
  const [form, setForm] = useState<ApplicationForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Open a job application page to begin.");
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const [context, setContext] = useState<JobContext | null>(null);
  const [trace, setTrace] = useState<string[]>([]);
  const run = useRef<DiscoveryRun | null>(null);
  const operationBusy = useRef(false);
  const panelOpen = useRef(true);

  useEffect(() => {
    panelOpen.current = true;
    let mounted = true;
    getActiveTabId().then(async (tabId) => {
      const saved = await loadJobContext(tabId);
      const tab = await chrome.tabs.get(tabId);
      if (!mounted) return;
      if (saved?.lastPageUrl !== tab.url) return;
      setContext(saved);
    }).catch((error: unknown) => { console.error("Could not restore job context", error); });
    return () => { mounted = false; panelOpen.current = false; run.current?.controller.abort(); };
  }, []);

  async function handleScan(): Promise<void> {
    if (operationBusy.current) return;
    operationBusy.current = true;
    setBusy(true);
    run.current?.controller.abort();
    run.current = null;
    setSession(null);
    setTrace([]);
    setStatus("Scanning this page...");
    try {
      const tabId = await getActiveTabId();
      const result = await scanTab(tabId);
      setForm(result);
      const saved = await loadJobContext(tabId);
      const captured = resolveManualScanContext(result, saved);
      setContext(captured);
      if (captured) await saveJobContext(tabId, captured);
      setStatus(getScanStatusMessage(result));
    } catch (error: unknown) {
      console.error("Page scan failed", error);
      setStatus(error instanceof Error ? `Could not scan this page: ${error.message}` : "Could not scan this page.");
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }

  async function streamRun(activeRun: DiscoveryRun, input: Parameters<DiscoveryRun["graph"]["stream"]>[0]): Promise<void> {
    const stream = await activeRun.graph.stream(input, { configurable: { thread_id: activeRun.threadId }, streamMode: "values", recursionLimit: 50, signal: activeRun.controller.signal });
    for await (const value of stream) {
      if (!("session" in value)) continue;
      const current = value.session;
      setSession(current);
      setContext(current.context);
      setForm(current.scan);
      setStatus(current.message);
      setTrace((entries) => appendDiscoveryTrace(entries, current));
    }
  }

  async function handleDiscover(): Promise<void> {
    if (operationBusy.current) return;
    operationBusy.current = true;
    run.current?.controller.abort();
    run.current = null;
    setBusy(true);
    setTrace([]);
    setSession(null);
    setForm(null);
    setContext(null);
    setStatus("Starting application discovery...");
    try {
      const tabId = await getActiveTabId();
      const [learned, saved, { createDiscoveryGraph }] = await Promise.all([loadLearnedActions(), loadJobContext(tabId), import("../discovery/discovery-graph")]);
      if (!panelOpen.current) return;
      const controller = new AbortController();
      const activeRun: DiscoveryRun = { graph: createDiscoveryGraph(createBrowserDiscoveryPort(tabId, controller.signal)), threadId: crypto.randomUUID(), controller };
      run.current = activeRun;
      await streamRun(activeRun, { session: createDiscoverySession(tabId, learned, saved) });
    } catch (error: unknown) {
      run.current = null;
      setSession((current) => current ? { ...current, status: "stopped" } : null);
      setStatus(error instanceof Error ? error.message : "Application discovery failed.");
    } finally { operationBusy.current = false; setBusy(false); }
  }

  async function handleSelect(index: number | null): Promise<void> {
    const activeRun = run.current;
    if (!activeRun) return;
    if (operationBusy.current) return;
    operationBusy.current = true;
    setBusy(true);
    try {
      if (!isWaitingForManualSelection(session)) throw new Error("Discovery is not waiting for an action.");
      const config = { configurable: { thread_id: activeRun.threadId } };
      await activeRun.graph.updateState(config, { session: { ...session, manualResponse: index } });
      await streamRun(activeRun, null);
    }
    catch (error: unknown) {
      run.current = null;
      setSession((current) => current ? { ...current, status: "stopped" } : null);
      setStatus(error instanceof Error ? error.message : "Could not resume discovery.");
    } finally { operationBusy.current = false; setBusy(false); }
  }

  return (
    <main>
      <h1>Job form inspector</h1>
      <p className="intro">Scan this page or locate its application form. Discovery can click navigation actions. Page data stays in this extension.</p>
      <div className="toolbar">
        <button type="button" onClick={() => void handleScan()} disabled={busy}>Scan page</button>
        <button type="button" onClick={() => void handleDiscover()} disabled={busy}>Find application form</button>
        {busy && run.current && <button type="button" onClick={() => run.current?.controller.abort()}>Stop discovery</button>}
      </div>
      <p role="status" aria-live="polite">{status}</p>
      <DiscoveryPanel session={session} context={context} trace={trace} busy={busy} onSelect={(index) => void handleSelect(index)} />
      {form && <ScanResult form={form} />}
    </main>
  );
}
