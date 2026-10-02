# Job form inspector and discovery

This Chrome Manifest V3 extension scans the current page's top-level document and shows fields, actions, and job context in a React side panel. **Scan page** remains inspection-only. **Find application form** runs a local LangGraph.js workflow that can click application-opening actions and rescan until it identifies applicant name, email, and a file input in one form area. It does not read entered field values, upload files, fill fields, submit a form, or call the RAGnarok API.

Read the [discovery learning guide](../../docs/job-extension-discovery.md) for implementation stages, the graph, browser-specific breakpoint behavior, and file-by-file responsibilities.

Read the [implementation tutorial](../../docs/job-extension-tutorial.md) for a detailed code walkthrough, keyword learning, description failures, state transitions, and proposed API/LLM phases.

The [extension backlog](../../docs/todo.md#job-extension-inspection-and-human-led-workflow) tracks upload detection, job-description capture, multi-step panel state, model fallback, and the later autonomous application flow.

## Develop locally

Use Node.js 24 and npm 11. From `apps/job-extension`:

```bash
npm ci
npm run dev
```

The `dev` command rebuilds `dist/` when panel, scanner, or background source files change. In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `apps/job-extension/dist`. Open a regular web page with a form, click the extension icon to open its side panel, then select **Scan page**. After a rebuild, reload the extension on `chrome://extensions` and reopen its side panel. The scan runs on demand, so the page itself usually does not need a reload.

The `activeTab` and `scripting` permissions give temporary access after a toolbar click; `sidePanel` opens the panel. The `storage` permission retains bounded job descriptions per tab in `chrome.storage.session` and at most 100 successful action labels in `chrome.storage.local`. Closing a tab removes its job context. Saved context restores only when its last page URL matches the active page. A fresh discovery on another job discards the old context from that run.

Access to another origin requires clicking the extension icon on that page and starting again. Browser-protected pages, embedded frames, shadow roots, and new-tab navigation are outside this phase. Discovery stops on tab switching, partial/ambiguous form evidence, incomplete scans before navigation, repeated page states, five clicks, or a readiness timeout. It waits for three stable changed scans, up to 12 seconds. Some delayed pages will still need a manual rescan.

Unknown or ambiguous action matches pause before the manual-selection node. Choosing a candidate resumes the graph and clicks it. Closing the panel discards in-memory graph checkpoints and cancels pending work; reopening starts a new graph without replaying prior clicks. Saved descriptions and learned labels are independent of those checkpoints. No LLM fallback is connected yet.

## How the scan works

1. `public/manifest.json` registers `index.html` as the side panel and a small background service worker. The worker handles toolbar clicks directly to grant `activeTab` access and open the panel. It also clears the former automatic panel behavior after an extension reload.
2. `index.html` mounts `src/sidepanel/App.tsx` through `main.tsx`. React owns the scan button, status, and results. `scan-active-tab.ts` queries the active tab and injects `content-script.js` with `chrome.scripting.executeScript`.
3. The injected file runs in Chrome's isolated content-script world. `scan-application-form.ts` coordinates `detect-fields.ts`, `resolve-labels.ts`, and `detect-actions.ts`. The scanner returns plain, serializable metadata as its final expression. The panel validates it with `isApplicationForm` before rendering it.
4. Explicit ARIA and HTML labels take priority. When a field has none, short text beside an isolated control may become a **plausible** label. Hidden file inputs are included when a visible label, containing upload button, or explicit `aria-controls` trigger supports the association. Native selects include bounded option lists; ARIA comboboxes and listbox buttons are identified without opening them. Actions include semantic tabs and link destinations, with live element references retained only inside the isolated scanner world.
5. Job-description extraction uses recognized containers or section headings, caps text at 20,000 characters, and excludes controls, forms, navigation, hidden content, and editable regions. It returns an empty string when it cannot recognize a description.

The panel and page scanner do not share a JavaScript environment. `executeScript` bridges them. Vite builds the panel and lazily loads the LangGraph browser bundle when discovery starts; esbuild bundles the scanner and service worker separately. No backend or provider credentials are required. The service worker opens the panel and cleans up closed-tab context; it does not own the workflow.

## Verify

```bash
npm run check
npm run build
```

`check` runs TypeScript checking and focused DOM tests. The build writes the unpacked extension to `dist/`. The panel, scanner, and service worker are bundled locally to meet Manifest V3 code-loading rules.
