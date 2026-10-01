# Job form inspector

This Chrome Manifest V3 extension is the first, local-only job application experiment. It scans visible controls and actions in the current page's top-level document and shows the result in a React side panel. It does not read entered field values, call the RAGnarok API, click links, fill fields, or submit a form.

The [extension backlog](../../docs/todo.md#job-extension-inspection-and-human-led-workflow) tracks upload detection, job-description capture, multi-step panel state, model fallback, and the later autonomous application flow.

## Develop locally

Use Node.js 24 and npm 11. From `apps/job-extension`:

```bash
npm ci
npm run dev
```

The `dev` command rebuilds `dist/` when panel, scanner, or background source files change. In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `apps/job-extension/dist`. Open a regular web page with a form, click the extension icon to open its side panel, then select **Scan page**. After a rebuild, reload the extension on `chrome://extensions` and reopen its side panel. The scan runs on demand, so the page itself usually does not need a reload.

The `activeTab` and `scripting` permissions give the extension temporary access to the active page after the user clicks its toolbar icon. The `sidePanel` permission lets the service worker open the panel. The panel stays available while browsing, but its last result is only an in-memory snapshot; scan again after changing pages or tabs. Access to another origin requires clicking the extension icon on that tab before scanning. Browser-protected pages cannot be scanned. V0 does not inspect embedded frames, closed shadow roots, or later steps of a form that have not yet appeared in the DOM.

## How the scan works

1. `public/manifest.json` registers `index.html` as the side panel and a small background service worker. The worker handles toolbar clicks directly to grant `activeTab` access and open the panel. It also clears the former automatic panel behavior after an extension reload.
2. `index.html` mounts `src/sidepanel/App.tsx` through `main.tsx`. React owns the scan button, status, and results. `scan-active-tab.ts` queries the active tab and injects `content-script.js` with `chrome.scripting.executeScript`.
3. The injected file runs in Chrome's isolated content-script world. `scan-application-form.ts` coordinates `detect-fields.ts`, `resolve-labels.ts`, and `detect-actions.ts`. The scanner returns plain, serializable metadata as its final expression. The panel validates it with `isApplicationForm` before rendering it.
4. Explicit ARIA and HTML labels take priority. When a field has none, short text beside an isolated control may become a **plausible** label. Native selects include bounded option lists; ARIA comboboxes and listbox buttons are identified without opening them. Buttons and links are listed without their URLs or any click behavior.

The panel and page scanner do not share a JavaScript environment. The call to `executeScript` is the bridge between them. Vite builds the React panel; esbuild bundles the scanner and service worker as separate files. The worker only sets the toolbar behavior. V0 has no extension message listener, navigation rules, persistent job snapshots, or API connection.

## Verify

```bash
npm run check
npm run build
```

`check` runs TypeScript checking and focused DOM tests. The build writes the unpacked extension to `dist/`. The panel, scanner, and service worker are bundled locally to meet Manifest V3 code-loading rules.
