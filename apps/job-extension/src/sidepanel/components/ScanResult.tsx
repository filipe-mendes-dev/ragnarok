import type { ReactElement } from "react";
import type { ApplicationAction, ApplicationField, PageScan } from "../../shared/page-scan";

interface FieldCardProps {
  field: ApplicationField;
}

interface ActionCardProps {
  action: ApplicationAction;
}

interface ScanResultProps {
  scan: PageScan;
}

function FieldCard({ field }: FieldCardProps): ReactElement {
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

function ActionCard({ action }: ActionCardProps): ReactElement {
  return (
    <li className="action-card">
      <strong>{action.label ?? `Unlabeled action ${action.index + 1}`}</strong>
      <span>{action.kind}{action.buttonType ? `: ${action.buttonType}` : ""}{action.disabled ? " · disabled" : ""}</span>
    </li>
  );
}

export function ScanResult({ scan }: ScanResultProps): ReactElement {
  return (
    <section aria-label="Scan results">
      <h2>Last scan</h2>
      <h3>{scan.pageTitle || "Untitled page"}</h3>
      <p className="origin">{scan.pageOrigin}</p>
      <h2>Fields ({scan.fields.length})</h2>
      {scan.truncated && <p className="notice">Only the first 200 supported fields are shown.</p>}
      {scan.fields.length > 0 ? <ol className="field-list">{scan.fields.map((field) => <FieldCard key={field.index} field={field} />)}</ol> : <p>No supported fields found.</p>}
      <h2>Actions ({scan.actions.length})</h2>
      {scan.actionsTruncated && <p className="notice">Only the first 100 actions are shown.</p>}
      {scan.actions.length > 0 ? <ol className="action-list">{scan.actions.map((action) => <ActionCard key={action.index} action={action} />)}</ol> : <p>No buttons or links found.</p>}
      <details className="raw-result">
        <summary>Structured JSON</summary>
        <pre>{JSON.stringify(scan, null, 2)}</pre>
      </details>
    </section>
  );
}

