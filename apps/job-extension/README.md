# Job form inspector and discovery

This Chrome Manifest V3 extension scans the current page's top-level document and shows fields, actions, and job context in a React side panel. **Scan page** remains inspection-only. **Find application form** runs a local LangGraph.js workflow that can click application-opening actions and rescan until it identifies applicant name, email, and a file input in one form area. When keyword matching is unresolved, a direct request to the Next.js backend asks Jev to choose from eligible actions. Uncertain decisions and request failures pause for manual selection. The extension does not read entered field values, upload files, fill fields, or submit a form.

Read the [discovery learning guide](../../docs/job-extension-discovery.md) for implementation stages, the graph, browser-specific breakpoint behavior, and file-by-file responsibilities.

Read the [implementation tutorial](../../docs/job-extension-tutorial.md) for a detailed code walkthrough, keyword learning, description failures, state transitions, and proposed API/LLM phases.

Start with the [simple job-context walkthrough](../../docs/job-context-first-increment.md), then the [scanning increment](../../docs/job-extension-scanning.md). Each follows one phase through the current code.

The [first backend increment](../../docs/job-extension-backend-first-increment.md) follows deterministic selection, the direct HTTP request, existing web authentication, and Jev's bounded decision.

The [extension backlog](../../docs/todo.md#job-extension-inspection-and-human-led-workflow) tracks upload detection, job-description capture, multi-step panel state, model fallback, and the later autonomous application flow.

## Develop locally

Use Node.js 24 and npm 11. From `apps/job-extension`:

```bash
npm ci
npm run dev
```

The `dev` command rebuilds `dist/` when panel, scanner, or background source files change. In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `apps/job-extension/dist`. Open a regular web page with a form, click the extension icon to open its side panel, then select **Scan page**. After a rebuild, reload the extension on `chrome://extensions` and reopen its side panel. The scan runs on demand, so the page itself usually does not need a reload.

The `activeTab` and `scripting` permissions give temporary access after a toolbar click; `sidePanel` opens the panel. The `storage` permission retains job text and its source URL per tab in `chrome.storage.session` and at most 100 successful action labels in `chrome.storage.local`. Closing a tab removes its job context. Saved context restores as a preview only when its last page URL matches the active page. Every fresh discovery reads context again.

Access to another origin requires clicking the extension icon on that page and starting again. Browser-protected pages, embedded frames, shadow roots, and new-tab navigation are outside this phase. Discovery stops on tab switching, multiple complete form areas, incomplete scans before navigation, repeated page states, five clicks, or a readiness timeout. It waits for three stable changed scans, up to 12 seconds. Some delayed pages will still need a manual rescan.

Discovery starts by reading job text. Non-empty text proceeds to the controls scan; empty text pauses before navigation with Retry, Continue without context, and Cancel choices. Reading takes one snapshot per attempt; Retry handles delayed content. Empty capture clears the current tab's old description. This baseline does not assess description completeness: the main-page fallback can include unrelated content.

Recognized action labels use deterministic priority: explicit apply/start/begin phrases precede generic application sections and learned phrases; equal priorities use scan index. `Apply for this Job` therefore wins over `Application` without Jev. Only no recognized match tries Jev for that scan. One request evaluates each eligible action independently; the highest yes probability must reach `0.8`, with scan index breaking exact ties. Below-threshold results and request failures pause before manual selection. Choosing a candidate resumes the graph and clicks it. Closing the panel discards in-memory graph checkpoints and cancels pending work; reopening starts a new graph without replaying prior clicks. Saved descriptions and learned labels are independent of those checkpoints.

## Enable the action-selection API locally

Set the Next.js application origin in `apps/web/.env`, using its existing authentication setting:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
```

The extension build reads this origin from the Next.js environment and embeds it as `APP_URL`. Requests, sign-in links, and generated Chrome host permission use that same origin. There is no separate extension `.env`. To switch servers, change `BETTER_AUTH_URL`, restart Next.js, rebuild the extension, and reload it in Chrome. Only the public origin is embedded; provider keys and other server settings stay on the backend.

1. Build and load or reload the extension as described above.
2. Copy the installed extension ID from `chrome://extensions`. In `apps/web/.env`, set `JOB_EXTENSION_ORIGIN=chrome-extension://<that-id>` and the existing `OPENROUTER_API_KEY`. Keep the provider key on the backend.
3. From `apps/web`, run `npm run dev`, or restart it after changing its environment. The extension calls the Next.js origin configured by `BETTER_AUTH_URL` directly.
4. Select **Sign in to RAGnarok** and use your existing account in the same Chrome profile. Use `localhost` consistently; a sign-in on `127.0.0.1` has a different cookie host.
5. Return to the job tab and select **Find application form**. An unresolved keyword match invokes the API automatically. The trace reports Jev selection or explains why manual choice is needed.

`public/manifest.json` is the manifest template. The build writes `dist/manifest.json` with host access for the configured backend's scheme and hostname. For the local example this is `http://localhost/*`; Chrome host patterns include all ports on that hostname. The build validates the URL as an HTTP(S) origin and normalizes an optional trailing slash. Both the generated permission and `src/config.ts` use that value. No manual manifest edit is required when switching backends.

The request uses `credentials: "include"` so Chrome can attach the existing web session cookie. Sign in on the configured backend using the same Chrome profile. Every action-selection request authenticates through the main application's Better Auth session. There is no separate Connect step, API client layer, or duplicate account system.

The panel reads Better Auth's existing `/api/auth/get-session` endpoint on opening, tab activation, and focus. It shows **Signed in as [name]** for an authenticated session and shows the sign-in link only after confirming no session. A failed check displays an unavailable message. Returning from web sign-in or sign-out refreshes the displayed account.

The graph reports missing configuration, an unapproved extension ID, missing sign-in, invalid responses, and network failures, then keeps manual selection available. Chrome cookie settings can also affect whether the session cookie reaches the backend. Live inference requires the configured server, a signed-in Chrome profile, and a working OpenRouter key. Page title and bounded action labels are sent to RAGnarok, then through OpenRouter to TypeSafe; job text and applicant data are not included in this request.

The graph trace shows deterministic `choose` and model fallback `llmActionChoice` as separate steps. The latter calls `chooseActionWithLlm` and records `selectionSource: "llm"`; its backend currently uses Jev. For diagnostics, inspect the side panel's DevTools console for `extension.action_selection.request` and the Next.js terminal for `extension.action_selection` and `extension.action_selection.provider`. Completion logs share `X-Request-Id`; panel request errors also include that ID. Provider logs show upstream status, duration, all candidate probabilities in `scores`, `minimumProbability`, and redacted error messages. Development input logs show each `questions.action_<index>` and its candidate. The response uses `probability` instead of the previous Choice `confidence` field. A provider 401 returns backend 502 with API-key guidance; backend 401 means web sign-in is required. See the [logging walkthrough](../../docs/job-extension-backend-first-increment.md#follow-a-request-through-the-logs).

## How the scan works

1. `public/manifest.json` registers `index.html` as the side panel and a small background service worker. The worker handles toolbar clicks directly to grant `activeTab` access and open the panel. It also clears the former automatic panel behavior after an extension reload.
2. `index.html` mounts `src/sidepanel/App.tsx` through `main.tsx`. React owns the scan button, status, and results. `scan-active-tab.ts` queries the active tab and injects `context-script.js` for job context, then `content-script.js` for controls, using `chrome.scripting.executeScript`.
3. The injected file runs in Chrome's isolated content-script world. `content/application/scan-page.ts` calls `scanFields` and `scanActions`. Field collection, label resolution, and area assignment stay together in `scan-fields.ts`; action collection and labelling stay in `scan-actions.ts`. The scanner returns plain, serializable metadata as its final expression. The panel validates it with `isPageScan` before rendering it.
4. Explicit ARIA and HTML labels take priority. When a field has none, short text beside an isolated control may become a **plausible** label. Hidden file inputs are included when a visible label, containing upload button, or explicit `aria-controls` trigger supports the association. Native selects include bounded option lists; ARIA comboboxes and listbox buttons are identified without opening them. Actions include semantic tabs and link destinations, with live element references retained only inside the isolated scanner world.
5. `shared/form-discovery.ts` checks enabled fields in each area for name, email, and a file input. Exactly one complete area succeeds. A partial area retains its detected fields and reports the missing signal while discovery continues to action selection. Multiple complete areas stop for review.
6. `capture-job-description.ts` tries known description containers, then reads main content or the page body. It excludes hidden content, navigation, page-level headers, footers, scripts, controls, and editable answers, and returns up to 20,000 characters. The context entry and controls scan use this same reader. No block inventory, candidate ranking, JSON-LD parser, or model selector is present.

The panel and page scanner do not share a JavaScript environment. `executeScript` bridges them. Vite builds the panel and lazily loads the LangGraph browser bundle when discovery starts; esbuild bundles the context collector, controls scanner, and service worker separately. Scanning and deterministic discovery work without the backend. Unresolved action selection tries the API and retains manual choice if unavailable. The service worker opens the panel and cleans up closed-tab context; the panel owns the graph and HTTP request.

## Verify

```bash
npm run typecheck
npm run test
npm run build
```

At the 2026-10-03 checkpoint, `typecheck` checked application source, test files, and build/test configuration. All 97 extension unit tests passed, covering text capture, scans and checked clicks, form recognition, action priority, graph pause/resume, storage, and backend requests. Tests mirror the current source folders and use the simple `JobContext` and `PageScan` contracts.

`vitest.config.ts` supplies a fixed public application origin for tests and resets mocks between cases. It keeps unit tests independent of `apps/web/.env` and the production manifest-writing hook. Backend requests and Chrome APIs are mocked; no unit test makes a paid provider request. The checkpoint also passed all 132 Next.js unit tests, both applications' typechecks and builds, and web lint. Database integration tests were not rerun because this increment changes no persistence behavior. The existing warning for the large, lazily loaded LangGraph chunk remains.

The build writes the unpacked extension to `dist/`. The panel, context reader, scanner, and service worker are bundled locally to meet Manifest V3 code-loading rules.
