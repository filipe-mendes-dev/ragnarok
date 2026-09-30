import { useState } from "react";
import type { ApplicationAction, ApplicationField, ApplicationForm } from "../shared/application-form";
import { scanActiveTab } from "./scan-active-tab";

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
      <h2>{form.pageTitle || "Untitled page"}</h2>
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

  async function handleScan(): Promise<void> {
    setBusy(true);
    setForm(null);
    setStatus("Scanning this page...");
    try {
      const result = await scanActiveTab();
      setForm(result);
      setStatus(`Found ${result.fields.length} fields and ${result.actions.length} actions${result.truncated || result.actionsTruncated ? " (more may be present)" : ""}.`);
    } catch (error: unknown) {
      console.error("Page scan failed", error);
      setStatus(error instanceof Error && error.message === "No active page is available to scan."
        ? error.message
        : "Could not scan this page. Browser-protected pages cannot be scanned; otherwise, reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Job form inspector</h1>
      <p className="intro">Inspect the fields and actions on the current page. Nothing is sent to RAGnarok.</p>
      <button type="button" onClick={() => void handleScan()} disabled={busy}>Scan page</button>
      <p role="status" aria-live="polite">{status}</p>
      {form && <ScanResult form={form} />}
    </main>
  );
}
