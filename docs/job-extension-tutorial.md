# Job extension implementation tutorial

This tutorial describes the implementation at the 2026-10-03 checkpoint. It follows data through the code, explains the decisions behind it, and separates existing behavior from proposed work. The shorter [discovery guide](job-extension-discovery.md) remains a quick reference.

Start with [the simple context walkthrough](job-context-first-increment.md), then [the scanning increment](job-extension-scanning.md). These follow the current implementation one phase at a time before the rest of this tutorial's navigation pipeline.

Source links point to this local checkout so you can open the implementation beside the tutorial.

For a focused reading path:

- [An incremental way to understand the implementation](#build-and-study-one-observable-phase-at-a-time)
- [Browser forms, ownership, and indexes](#native-html-forms-and-application-areas-are-different)
- [Reading the regular expressions](#read-the-whitespace-regular-expressions)
- [Where the action snapshot lives](#where-the-snapshot-is-stored)
- [Keywords and successful-click learning](#7-follow-an-apply-action-through-keyword-checking)
- [Description capture and its misses](#9-why-description-capture-sometimes-returns-an-empty-string)
- [State updates and every graph node](#10-session-state-guards-and-graph-updates)
- [The web app boundary and proposed LLM phases](#15-connect-the-extension-to-the-existing-web-application)
- [Tests and diagnosing failures](#19-current-verification-checkpoint)

## 1. What we have built

The extension first reads job text and keeps the non-empty string or pauses for an explicit retry/skip decision. Once context is captured or skipped, it can navigate toward an application form and stop when one area contains applicant name, email, and a file input.

Its application discovery loop is:

```text
read job text
keep the string or pause for retry/skip/cancel
observe page
assess form evidence
select a navigation action
validate and click
wait for observable progress
observe again
```

The extension also pauses when its action choice is uncertain. A person can choose a candidate and resume the same run.

Today, this is a browser discovery workflow with deterministic selection first, Jev fallback for uncertain actions, and human selection when needed. It has no model-selected data tools, RAG request, or generated application answer. LangGraph runs the state machine; Jev is called explicitly through the Next.js action-selection endpoint.

In the broad software sense, the loop observes an environment and acts toward a goal. Its stages and routing remain predefined; a model now chooses among eligible navigation candidates within that flow. Call it an application discovery workflow with a bounded model decision. LangGraph's documentation distinguishes predetermined workflows from agents that dynamically decide processes and tool use. [Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)

### Build and study one observable phase at a time

The runtime order and the development order are different. At runtime, an implemented graph executes its nodes. During development, we can define that graph's intended stages first, then implement and inspect one stage at a time. A working loop does not require every helper to become a graph node.

The current code already contains the phases below. This is a teaching sequence for studying it and making later improvements; it is not a claim that these were separate historical implementation milestones.

| Step | Implement or study | Visible result before proceeding | Current location |
| --- | --- | --- | --- |
| 1 | Define the goal, state contract, nodes, and conditional edges | A diagram showing when we continue, pause, succeed, or stop | `discovery/session.ts`, `discovery/discovery-graph.ts`, `discovery/routes.ts` |
| 2 | Read job text before navigation | Captured string, or an explicit paused/skipped outcome | `content/capture-job-description.ts`, the graph's `acquireJobContext` |
| 3 | Discover supported fields and actions | Two inventories for a known page, without clicking | `content/application/scan-fields.ts`, `content/application/scan-actions.ts` |
| 4 | Resolve labels and establish field ownership/areas | Each control has its available label evidence and grouping metadata | `content/application/scan-fields.ts`, `content/dom.ts` |
| 5 | Assess name, email, and file evidence in each area | An explicit `found`, `partial`, `ambiguous`, or `absent` result | `shared/form-discovery.ts`, the graph's `assessForm` |
| 6 | Select an eligible action using built-in or learned phrases, then Jev, then manual selection | A candidate and its selection source, before dispatching a click | `shared/discovery-rules.ts`, `chooseAction`, `browser-discovery-port.ts`, `manualSelection` |
| 7 | Validate and click one observed action; wait and rescan | One verified navigation cycle | `content/application/scan-snapshot.ts`, `content/application/click-scanned-action.ts`, `sidepanel/browser-discovery-port.ts` |
| 8 | Repeat with limits, checkpoints, and successful-click learning | A bounded run that stops at a recognized area or an explained failure | `discovery/discovery-graph.ts`, `discovery/guards.ts`, `sidepanel/App.tsx` |

For step 1, sketch the graph and read the first acquisition node. Its browser port supplies a small context object or null. Follow that result into the next route before studying DOM traversal, Chrome injection, and React state together.

For step 2, inspect the captured string. For steps 3–5, keep one controls scan observable: inspect its raw controls, then labels, then areas, then assessment. Use the same small HTML example at each stage. Once those observations make sense, follow one click and one rescan before studying the repeated loop.

`scanActions` collects and labels actions in one pass. `scanFields` collects field elements, resolves their labels, and assigns their areas inside one file. The functions return the two inventories; neither clicks anything.

The scanner functions belong together because they inspect the same document and produce one observation. LangGraph's `scanPage` node calls that pipeline through `DiscoveryPort`. The graph then makes decisions about the observation. Collecting, labelling, and grouping stay inside `scanFields`; separate graph nodes would add state transitions without a useful independent execution boundary for these synchronous DOM operations.

```mermaid
flowchart TD
    Start([Start]) --> Context[Read job text]
    Context -->|Non-empty| Inventory
    Context -->|Empty| ContextPause[Pause for context decision]
    ContextPause -->|Retry| Context
    ContextPause -->|Skip| Inventory
    ContextPause -->|Cancel| Stop
    subgraph Observation[One page observation]
        Inventory[Discover fields and actions] --> Labels[Resolve labels and group fields]
        Labels --> Description[Return controls scan]
    end
    Description --> Assess[Assess application area]
    Assess -->|Exactly one complete area| Found[Finish and record successful learning]
    Assess -->|Absent or partial, and allowed to continue| Choose[Select eligible action]
    Assess -->|Ambiguous or stop condition| Stop[Stop with explanation]
    Choose -->|One phrase match| Click[Validate snapshot and click]
    Choose -->|Unresolved matching| Jev[Ask Jev to choose]
    Jev -->|Accepted choice| Click
    Jev -->|Abstention or failure| Manual[Pause for manual choice]
    Choose -->|No eligible actions| Stop
    Manual -->|Valid choice| Click
    Manual -->|Cancel or invalid choice| Stop
    Click --> Wait[Wait for observable page change]
    Wait --> Inventory
```

This diagram omits individual failure edges for readability; section 11 shows the current graph's routes in more detail. Jev runs within action selection, after deterministic matching. Scanning and label resolution remain local.

## 2. The three browser environments

The extension has three JavaScript environments with different responsibilities.

| Environment | Responsibility | Lifetime |
| --- | --- | --- |
| Background service worker | Handle toolbar clicks, open the panel, remove closed-tab context | Chrome manages its activation |
| React side panel | Own UI, graph execution, cancellation, and storage calls | While the panel is open |
| Injected content script | Inspect the job page DOM and retain references for a checked click | Associated with the page document |

The panel can call Chrome APIs, but its `document` is the panel document. It cannot inspect the job page by calling `document.querySelector` locally.

`chrome.scripting.executeScript` bridges the environments. A scanner executes against the job page and returns serializable metadata. Live DOM elements stay in the content script's isolated world.

There are two injected entries: `context-script.js` returns the description reader's string; `content-script.js` scans controls and registers checked-click references. Both use the same description reader. The context entry does not overwrite the action snapshot.

```mermaid
flowchart LR
    Toolbar[Extension toolbar] --> Worker[Background worker]
    Worker --> Panel[React side panel]
    Panel --> Graph[Local LangGraph workflow]
    Graph --> Port[DiscoveryPort adapter]
    Port --> Injection[Chrome executeScript]
    Injection --> Scanner[Page scanner and checked click]
    Scanner --> DOM[Job page DOM]
    Scanner --> Metadata[Serializable scan]
    Metadata --> Validation[Runtime validation]
    Validation --> Graph
    Graph --> Stream[Streamed session]
    Stream --> Panel
    Port --> Storage[Chrome storage]
```

### Startup and build files

[public/manifest.json](/Users/filipemendes/Documents/ragnarok/apps/job-extension/public/manifest.json) is the template that registers the service worker and side panel. It requests `activeTab`, `scripting`, `sidePanel`, and `storage`. [vite.config.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/vite.config.ts) reads the Next.js origin from `BETTER_AUTH_URL` in `apps/web/.env` and writes `dist/manifest.json` with host access for that origin, which is `http://localhost/*` for the local example. [config.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/config.ts) exposes it as `APP_URL` to the panel's requests and links. The extension has no separate environment file. Changing the Next.js origin requires rebuilding and reloading the extension. There is no permanently registered scanner.

[background/entry.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/background/entry.ts) opens the panel from the toolbar click. Its initial `setPanelBehavior` call resets an older automatic-opening setting so the click listener handles the action. The tab-removal listener deletes `jobContext:<tabId>`; it does not clear learned labels.

`activeTab` gives temporary page access following the user's extension interaction. That access persists across navigation within the same origin and is revoked when navigating to another origin. Our workflow stops at that boundary and asks the user to open the extension on the resulting page. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

[sidepanel/main.tsx](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/main.tsx) finds the panel's root element and mounts `App`. A missing root is an invalid startup condition, so it throws.

[package.json](/Users/filipemendes/Documents/ragnarok/apps/job-extension/package.json) uses Vite for the React panel and esbuild for the context collector, controls scanner, and worker. The built outputs are `dist/index.html`, panel assets, `context-script.js`, `content-script.js`, and `service-worker.js`. The graph is loaded dynamically when discovery starts, keeping its dependency bundle out of the panel's initial execution path.

## 3. Understand the data before following the functions

Read [shared/page-scan.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/shared/page-scan.ts).

`PageScan` represents the observation of a page. It can contain no application form, several forms, and unrelated page controls. It replaces the misleading `ApplicationForm` name. `FormAssessment` is a separate decision about the observed fields.

| Contract | What it represents |
| --- | --- |
| `ApplicationField` | Metadata about one supported control |
| `ApplicationAction` | Metadata about one button, link, or supported semantic action |
| `PageScan` | Page identity, description text, both inventories, and truncation flags |
| `ApplicationOption` | A native select's option label and value |

### Native HTML forms and application areas are different

A native form is an actual `<form>` element in the page's HTML. An application area is our interpretation of a group of fields: applicant name, email, and a file control. A site can implement that area inside a `<div>` or dialog, without using a native form.

`document.forms` lists only the document's **`<form>` elements**. It does not list every element in the document. The quoted tooltip appears to have omitted the tag from its sentence. Its type, `HTMLCollectionOf<HTMLFormElement>`, says that each entry is a native form object. [MDN: Document.forms](https://developer.mozilla.org/en-US/docs/Web/API/Document/forms)

Consider this deliberately small page:

```html
<form id="newsletter">
  <label>Newsletter email <input type="email" name="newsletterEmail"></label>
</form>

<form id="application">
  <label>Full name <input type="text" name="fullName"></label>
  <label>Email <input type="email" name="email"></label>
  <label>CV <input type="file" name="resume"></label>
</form>

<button id="application-submit" type="submit" form="application">Submit application</button>
<a id="open-application" href="/apply">Apply now</a>
```

In this example:

```ts
document.forms.length; // 2
document.forms[0].id; // "newsletter"
document.forms[1].id; // "application"
```

The inputs, labels, button, and link are not entries in `document.forms`. The scanner discovers supported controls separately with selectors in `scan-fields.ts` and `scan-actions.ts`. It uses the forms collection only to establish native-form identity.

`HTMLCollection` is a browser collection, rather than a regular JavaScript array. `HTMLCollectionOf<HTMLFormElement>` is TypeScript's more specific description of its entries. `read-only` means the property is not something we replace by assigning a new collection; it does not mean the page's forms cannot change.

### A control's `form` property means ownership

For a native button, `button.form` returns its owning `HTMLFormElement`, or `null` when it has no native form owner. `HTMLFormElement | null` is TypeScript's way of saying that either result is possible. [MDN: HTMLButtonElement.form](https://developer.mozilla.org/en-US/docs/Web/API/HTMLButtonElement/form)

Ownership usually comes from a containing `<form>`. It can also come from an explicit `form="application"` attribute referencing a form's ID elsewhere in the same document. In the example above, the submit button is outside the application form but still belongs to it. [MDN: form attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/form)

```ts
const submitButton = document.getElementById("application-submit");

if (submitButton instanceof HTMLButtonElement) {
  submitButton.form?.id; // "application"
  submitButton.closest("form"); // null: it has no form ancestor
}
```

The `instanceof` guard verifies that the retrieved element is a native button before accessing button-specific properties. The optional chaining in `form?.id` reads the ID only if an owner exists.

This distinction explains `getFormIndex` in [content/dom.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/dom.ts). It uses native `.form` ownership for inputs, selects, textareas, and buttons. For other supported elements, such as a link or a generic ARIA control, it falls back to `closest("form")`.

The property is read-only, but an HTML attribute is a different interface: changing a valid `form` attribute can change ownership. Reading `.form` itself does not submit, validate, or click anything.

### Walk through the native form-to-index map

The current helper is:

```ts
export function getFormIndices(): Map<HTMLFormElement, number> {
  return new Map(Array.from(document.forms, (form, index) => [form, index]));
}
```

Read it from the inside outward:

1. `document.forms` provides the native form objects in document order.
2. `Array.from` visits the collection and calls its callback with each form and its zero-based position.
3. The callback returns a pair: `[theActualFormObject, itsPosition]`.
4. `new Map` turns those pairs into lookups from a form object to a number.

For the example page, the map contains `newsletterFormObject → 0` and `applicationFormObject → 1`. These keys are actual DOM objects, not the strings `"newsletter"` and `"application"`.

Later, `getFormIndex` obtains a control's owner and asks `indices.get(owner)` for its number. This translates a live DOM relationship into a small serializable value. Several fields can share the same form number:

| Inventory | Control | Its `index` | Its `formIndex` | Its field `areaKey` |
| --- | --- | --- | --- | --- |
| Fields | Newsletter email | 0 | 0 | `form:0` |
| Fields | Applicant full name | 1 | 1 | `form:1` |
| Fields | Applicant email | 2 | 1 | `form:1` |
| Fields | CV upload | 3 | 1 | `form:1` |
| Actions | External submit button | 0 | 1 | Not an action property |
| Actions | Apply link | 1 | `null` | Not an action property |

The submit button is discovered as an action, but the navigation rules reject it as a native form submit control. Detection records what exists; later eligibility rules decide what we can use to navigate.

There are three independent numbering systems here: positions in the field inventory, positions in the action inventory, and positions in the native forms collection. Field index 1 and action index 1 do not identify the same thing. Form index 1 means the second native form, not the second control and not an HTML `id`.

For a custom application area, the fields can have `formIndex: null` while sharing `areaKey: "area:0"`. That `0` is assigned by our container map, independently of native form indexes. A null native owner is therefore not enough to conclude that no application area exists.

All of these numbers and area keys belong to one scan. DOM changes can change their assignments. They are grouping and lookup metadata, not durable identities to store for a future page visit.

### Identity and provenance

`index` is the position in the current inventory. It is not a permanent element identifier. After a new scan, index 3 can refer to a different element.

`formIndex` identifies a native form within that scan. `areaKey` groups fields for recognition. For example, `form:0` represents the first native form and `area:0` represents a detected container without a native form element.

`labelSource` records how a label was obtained. An HTML label and a nearby-text guess are different kinds of evidence, even when their text looks similar.

`scanId` connects returned action metadata to the live element references retained in the page. A click requires the corresponding snapshot; an index alone is insufficient.

`pageOrigin` scopes learned labels. `pageUrl` identifies the current route and helps verify saved context and detect progress.

### Compile-time types and runtime validation

An interface helps TypeScript check our own code. It does not verify a value returned across the Chrome boundary.

[scan-active-tab.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/scan-active-tab.ts) treats the injected result as `unknown`, then calls `isPageScan`. The validator checks field identity, labels, control metadata, native select options, action metadata, and top-level scan properties.

[shared/value-guards.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/shared/value-guards.ts) provides the reused record, nullable-string, and non-negative-integer checks. These validate shapes. They do not determine whether fields belong to a real application form.

That distinction separates two questions:

- Is this value a valid scan payload?
- Does this scan contain enough evidence to recognize an application form?

The first belongs to the boundary validator. The second belongs to `assessApplicationForm`.

## 4. Follow one scan through the page

[content/application/entry.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/entry.ts) calls `scanPage()`. The injected bundle finishes with that call's result, which Chrome returns to the panel.

[scanPage](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/scan-page.ts) coordinates these steps in order:

1. Build a native form-to-index map.
2. Call `scanFields`: collect controls, resolve labels, assign areas, return field metadata.
3. Call `scanActions`: collect actions, resolve labels, return metadata and live references.
4. Create a random scan ID and retain the action snapshot in the page.
5. Capture description text with the unchanged reader and return the serializable `PageScan`.

Inside `scanFields`, labels must exist before assigning areas because non-form grouping uses name/email/file evidence. The public function shows this order directly, with its named helpers below it in the same file.

This scanner mutates fresh objects it created for the current scan. Graph nodes subsequently treat completed observations as inputs and return new session objects. Those two choices serve different lifetimes and do not conflict.

### DOM helpers

[content/dom.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/dom.ts) supplies shared DOM mechanics:

- `cleanText` collapses whitespace, trims, and caps metadata text at 200 characters. Description extraction uses its own 20,000-character limit.
- `isVisible` inspects the element and its ancestors for hidden, inert, ARIA-hidden, display, and visibility states. It does not test viewport position, occlusion, or every way an element can be visually concealed.
- `getFormIndex` uses native form ownership where supported and otherwise the closest form.
- `getAriaLabelledBy` resolves referenced IDs and joins their text.
- `getVisibleUploadTrigger` tries visible associated labels, a containing upload button, then an explicit `aria-controls` association.

These helpers provide observations. They do not select an application action.

### Read the whitespace regular expressions

Yes, `/\s+/` is a regular expression, often called a regex. A regex describes a text pattern. It does not perform an operation until a method such as `split`, `replace`, or `test` uses it.

| Syntax | Meaning |
| --- | --- |
| `/.../` | JavaScript delimiters for a regex literal |
| `\s` | A whitespace character, including a space, tab, or line break |
| `+` | One or more consecutive matches of the preceding item |
| `g` after the closing slash | Global matching, used by `replace` to replace every match |

So `/\s+/` matches a run of whitespace, such as one space, three spaces, or a newline followed by spaces. `+` refers to the preceding `\s`; it is not an addition operator inside this pattern. [MDN: character class escapes](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Character_class_escape), [MDN: quantifiers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Quantifiers)

`cleanText` uses:

```ts
"Full   name\nEmail".replace(/\s+/g, " "); // "Full name Email"
```

Each whitespace run becomes one ordinary space. The `g` matters: without it, `replace` would replace only the first run. The subsequent `.trim()` removes leading and trailing whitespace, and `.slice(0, MAX_TEXT_LENGTH)` limits the metadata text length.

`getAriaLabelledBy` uses:

```ts
"name-label   required-hint".split(/\s+/); // ["name-label", "required-hint"]
```

An `aria-labelledby` attribute can refer to multiple element IDs separated by whitespace. `split` produces the individual ID strings, which the helper then resolves with `document.getElementById`. Unlike `replace`, `split` does not need a `g` flag to split at each separator.

For example, `aria-labelledby="name-label required-hint"` tells the helper to obtain text from both referenced elements and join it. These are HTML element IDs; they are unrelated to our numeric field or form indexes. `getVisibleUploadTrigger` uses the same splitting technique for the IDs listed in `aria-controls`.

You will also encounter these symbols in our keyword expressions:

| Syntax | Reading aid | Example |
| --- | --- | --- |
| `^` and `$` | Require the start and end of the input | `/^apply$/` matches `apply`, not `apply later` |
| `\|` | Alternatives | `/^(apply\|application)$/` accepts either complete word |
| `?` after an item/group | Zero or one occurrence | `/^apply( now)?$/` also accepts `apply now` |
| `(?:...)` | Group without capturing a substring | `/^(?:apply\|application)$/` groups the alternatives |
| `i` after the closing slash | Ignore letter case | `/^apply$/i` also matches `Apply` |

These simplified examples are reading aids, not replacements for the current production patterns. Section 7 walks through the actual action expressions after label normalization.

## 5. Fields, comboboxes, and labels

### Field eligibility

[content/application/scan-fields.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/scan-fields.ts) queries native inputs, selects, textareas, ARIA comboboxes, and listbox-opening buttons.

Its loop reads as a list of rejection rules:

```ts
if (!(element instanceof HTMLElement)) continue;
if (isUnsupportedInput(element)) continue;
if (!isSupportedField(element)) continue;
if (isNestedComboboxField(element)) continue;
if (!isInspectableField(element)) continue;
```

Hidden inputs and button-like input types are excluded as fields. A nested input inside an ARIA combobox is excluded as a separate field to avoid representing the same logical control twice.

An invisible file input can be included when it has a visible upload trigger. Many websites hide the browser's file control behind their own button, so visibility of the input alone would miss the CV control.

`getFieldControl` resolves the control category in priority order. A native input with `role="combobox"` becomes a combobox. For a container combobox, `findComboboxInput` can obtain metadata from its inner non-hidden input.

`makeField` captures names, identifiers, placeholder, autocomplete, required state, and disabled state. It captures up to 50 native select options, with `optionCount` recording the full count. At most 200 supported fields are returned; discovering another sets `truncated`.

The scanner does not read applicant text input values or file bytes. Native select option values describe available choices. An input button's value is separately used as its action label.

### What a combobox means here

A combobox is a value-entry control with an associated popup for selecting a value. It may allow typing or only selection. A searchable country selector is a common example. [W3C combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

Our scanner uses `role="combobox"` and `button[aria-haspopup="listbox"]` as detection signals. The latter is a heuristic for a custom selection control, not proof that the website implements a complete accessible combobox.

Custom popup choices are not currently opened or inventoried. Native select options are. Detecting a combobox therefore does not mean we already know how to fill it.

### Label resolution

[content/application/scan-fields.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/scan-fields.ts) applies the first usable label source:

| Priority | Source | Example |
| --- | --- | --- |
| 1 | `aria-labelledby` | Text in referenced elements |
| 2 | `aria-label` | An explicit accessible label |
| 3 | Native HTML labels | `<label for="email">Email</label>` |
| 4 | Visible upload trigger | A button associated with a file input |
| 5 | Nearby text | A short sibling heading beside an isolated control |

`resolveFieldLabel` returns both text and source. The second loop in `scanFields` assigns them and obtains the nearest fieldset's direct legend as `groupLabel`.

Nearby resolution is bounded to two ancestor levels. It stops at forms, body/html, or a container with more than one detected field. Interactive siblings and siblings containing controls are rejected. It searches preceding siblings; checkbox and radio fields can also use following siblings. The candidate text must be at most 120 characters.

An existing visible upload trigger with empty text returns an empty label result. Nearby text does not replace it. This preserves the stronger structural association rather than assigning an unrelated nearby heading.

## 6. Grouping and form proof

`assignFieldAreas`, inside [scan-fields.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/scan-fields.ts), first groups native forms by `formIndex`.

For fields without a native form, it walks upward through parents. A parent becomes an area when it contains name, email, and file signals, or has a form/dialog role. Body and html are not grouping candidates.

This prevents unrelated name, email, and upload controls scattered across a whole page from automatically proving a form. Roles can identify a partial area; recognition still evaluates its actual fields afterward.

[shared/form-discovery.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/shared/form-discovery.ts) supplies `assessApplicationForm`:

1. Group enabled fields with an area key.
2. Find name evidence, email evidence, and file controls within each area.
3. Keep a complete match and the first partial area containing two signals. A second complete match immediately makes the result ambiguous.
4. Return `found` for exactly one complete area, then `partial` if there is no complete match, or `absent` if there is neither.

A partial result retains its area key and detected field indexes. `getMissingFormSignals` derives the missing name, email, or upload signal from these existing properties. Partial and absent results continue to action discovery when the navigation guards allow it; several complete areas stop for review. The assessor examines all areas before accepting a unique match, and can stop immediately once ambiguity is established.

Name evidence requires an enabled native text input with name/given-name autocomplete or recognized label/name/id/placeholder expressions. Email evidence requires an enabled native text/email input with email type, email autocomplete, or an email expression. File proof is based on the file input type.

`required` flags are not form proof. The recognition rule is the agreed heuristic, not proof that every required question or later application step has been found.

### CV selection is a separate decision

`findCvUpload` excludes files explicitly described as cover letters, certificates, or portfolios. It then prefers:

1. A resume-labelled upload that also mentions autofill.
2. Another resume-labelled upload.
3. The first remaining file.

The fallback follows scanned DOM order, which is evidence of priority rather than a guarantee. There is no maximum of two uploads.

A cover-letter-only area can still satisfy name/email/file recognition while having no CV candidate. Recognition finds the area; CV classification decides which upload is plausible for the later resume step.

## 7. Follow an Apply action through keyword checking

Read [content/application/scan-actions.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/scan-actions.ts), then the action functions in [shared/discovery-rules.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/shared/discovery-rules.ts).

### First discover actions

The scanner queries buttons, button-like inputs, links with hrefs, `role="button"`, and `role="tab"`. It excludes invisible elements, controls that look like selection fields, and nested actions that would duplicate a containing button/link.

Labels come from ARIA references, ARIA label, then visible text. Button-like inputs use alt text or their value. Metadata includes native button type, form ownership, disabled state, href, target, and role.

Up to 100 actions are returned. The matching live elements are retained in a parallel array. Action index 4 corresponds to element index 4 in that particular snapshot.

Detection reports observations. It includes submission controls for inspection, but later navigation eligibility rejects them.

### Then reject ineligible navigation actions

`chooseApplicationAction` begins with:

```ts
const candidates = scan.actions.filter(isEligibleNavigationAction);
```

The eligibility function rejects disabled actions, missing labels, excluded label expressions, reset buttons, native submit controls belonging to a form, unsupported browsing targets, and invalid/non-http(s) destinations.

The excluded label group contains submit, send, withdraw, delete, cancel, sign-in/out variants, upload, download, cover letter, certificate, job alert, and save job.

These exclusions run before matching learned labels. Saving a label does not authorize an otherwise rejected action.

An action can be eligible without being recognized. For example, an enabled button labelled "Join our team" can remain a manual candidate even though it does not match the built-in phrases.

### Normalize the label

`normalizeExpression` performs these operations:

1. Insert spaces between lowercase-uppercase camel-case boundaries.
2. Decompose accented characters with NFD normalization.
3. Remove combining accent marks.
4. Lowercase.
5. Replace punctuation and other non-ASCII-letter/digit characters with spaces.
6. Trim and collapse whitespace.

Examples:

| Original | Normalized |
| --- | --- |
| ` Apply NOW! ` | `apply now` |
| `ApplyNow` | `apply now` |
| `Upload résumé` | `upload resume` |
| `candidate_email` | `candidate email` |

Normalization makes formatting differences comparable. It does not translate languages. This normalizer is oriented toward the current Latin/English expressions; extending language support needs explicit treatment.

### Match a complete built-in phrase

The current opening-action expressions are:

```ts
const EXPLICIT_APPLICATION_ACTION =
  /^(?:apply|apply now|apply for (?:this|the) (?:job|role|position)|apply for (?:job|role|position)|start (?:your )?application|begin (?:your )?application)$/;
const APPLICATION_SECTION = /^(?:application|job application)$/;
```

The `^` and `$` anchors require the entire normalized label to match. `(?:...)` groups alternatives without capturing text; `|` separates alternatives; `?` makes the preceding group optional.

For example, `start (?:your )?application` accepts "start application" and "start your application".

| Label | Current result |
| --- | --- |
| Apply now | Built-in keyword |
| Apply for this job | Built-in keyword |
| Begin your application | Built-in keyword |
| Application settings | Eligible but unrecognized |
| Apply here | Eligible but unrecognized |
| Join our team | Eligible but unrecognized unless saved on this origin |
| Submit application | Excluded before keyword matching |

This exactness trades some recall for predictable selection. A broad application substring would also select settings, status links, or other unrelated controls.

### Match a saved phrase and rank recognized actions

`recognizeApplicationActionLabel` checks the two built-in expressions first. Otherwise it compares the normalized label against saved entries with the same `pageOrigin`. It returns `keyword`, `learned`, or null.

`chooseApplicationAction` collects recognized eligible actions. `getApplicationActionPriority` returns `1` for explicit apply/start/begin wording and `0` for application sections and learned phrases. Sorting puts higher priority first; `left.action.index - right.action.index` puts earlier scan indexes first when priorities are equal. The first match is selected. Only an empty match list sends the eligible candidates to Jev.

For example, `Application` at index 3 has priority `0`, while `Apply for this Job` at index 4 has priority `1`. Index 4 wins without a network request. An explicit built-in phrase also precedes a learned phrase; generic section labels and learned phrases share priority and use page order. The selected action keeps its recognition source for the trace.

Two identical Apply buttons remain separate candidates; the lower index wins. This is a simple navigation policy, not proof that their destinations or effects are equivalent. Existing eligibility and checked-click guards still apply.

## 8. Successful clicks become reusable phrases

The extension already maintains two sources of recognition:

- Built-in generic phrases in `OPEN_APPLICATION`.
- Exact successful phrases in Chrome local storage, scoped to their origin.

The saved entries act as additional keywords. They do not modify the source-code regex.

Consider an unknown "Join our team" button:

1. No recognized action exists, so `chooseAction` routes to `llmActionChoice`. If no candidate reaches the probability threshold or the request fails, the graph pauses for manual selection.
2. You choose the candidate in the panel.
3. `manualSelection` records `selectionSource: "manual"`.
4. `clickAction` validates/clicks and records its normalized label, origin, and `learnPrevious: true`.
5. The next assessment finds a complete form.
6. The graph enters `recordSuccess`.
7. The node checks whether the selected label is already recognized.
8. If it is new, `port.learnAction` saves it and the node adds it to the session's learned list.
9. A fresh discovery run loads the list. The same label on the same origin can now be selected with source `learned`.

The save operation is an alias in [browser-discovery-port.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/browser-discovery-port.ts):

```ts
learnAction: saveLearnedAction
```

[discovery-storage.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/discovery-storage.ts) validates the origin and normalized label, deduplicates the pair, appends it under `learnedApplicationActions`, and keeps the latest 100 entries.

For example:

```ts
{
  origin: "https://jobs.example.com",
  label: "join our team"
}
```

The current source remains `manual` after learning. It records how the action was selected in that run. A future selection can have source `learned`.

### Why we save after success

A completed click proves only that the click was dispatched. Waiting proves only that the observable page changed. The following form assessment supplies evidence that the action reached the desired area.

Saving immediately after dispatch could teach an unrelated action that opens a cookie dialog or another page.

Only the immediately preceding action receives credit. If "Explore opportunity" opens an intermediate page and a later "Apply now" reveals the form, the first label is not learned. We currently have no stored distinction between an intermediate discovery step and a direct form opener.

Clicking a button directly on the website, outside the panel's selection path, is not automatically recorded as a successful selected action. The workflow must observe which candidate it dispatched to associate that transition with a label.

Learning is skipped when a form was already present, the preceding action was automatically selected, the label is already recognized, or the run stops before form proof. A storage failure leaves the form-found result intact and adds a failure message.

### Proposal for the phrase-learning policy

Treat the saved records as confirmed application-opening phrases and expose whether learning was saved, already known, inapplicable, or failed. Keep exact matching and origin scope initially.

An origin includes scheme, hostname, and port. It does not distinguish every employer route on a shared ATS domain. If fixtures demonstrate different meanings for the same label on different routes, add a measured route/company scope rather than promoting it globally.

The current `learnPrevious` assignment still covers only manual selection. Jev decisions do not add learned labels in this increment. Global manageable expressions and saving only after confirmed submission remain a separate proposed change; the existing origin-scoped manual learning behavior has not been revised here.

This is a proposal. No phrase-learning implementation changed while writing this tutorial.

## 9. Why description capture sometimes returns an empty string

Read [capture-job-description.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/capture-job-description.ts). This one file now owns context extraction for both the first graph phase and the controls scanner.

The earlier block/candidate implementation has been removed. The current baseline tries known description containers, then reads main content or the page body. It returns a string capped at 20,000 characters.

### Read the algorithm in order

1. The public captureJobDescription function checks the existing description selectors.
2. readDescription walks the selected region and collects text nodes.
3. isExcludedTextNode skips hidden content, navigation, page-level headers, footers, scripts, controls, and editable answers.
4. Paragraphs and common block containers add newline boundaries. Inline words remain joined.
5. A final pass trims lines, collapses whitespace, removes empty lines, and returns the string.
6. If no recognized container provides text, the same reader processes the main/article region or body.

A non-empty string counts as captured context for this increment. It does not prove the text is a complete job description. The fallback can include company information and unrelated public text. Inspect the displayed capture and improve the reader from specific misses.

Published text inside forms and article headers remains readable; entered controls and editable answers are excluded.

### Missing text and preservation

Empty capture pauses discovery before the controls scan. Retry reads again; an explicit skip allows navigation without context; cancel stops. Acquisition takes one snapshot per attempt, so delayed rendering needs Retry for now. Browser or storage errors stop instead of being treated as absent text.

The Chrome adapter attaches the source URL and capture time to the string. Later scans update only the last page URL. A fresh run reads context again; a stored preview cannot replace that first step.

Manual Scan page uses the same reader and saves the result or clears old context when empty. The controls scan also calls the reader, but its later description strings cannot overwrite the first capture during discovery.

Frames, shadow roots, JSON-LD parsing, context ranking, and context LLM selection are deferred. The action-selection LLM fallback is already implemented and does not assess job text. The [simple context walkthrough](job-context-first-increment.md) connects this reader to the graph and panel.

## 10. Session state, guards, and graph updates

Read [discovery/session.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/discovery/session.ts), [discovery/guards.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/discovery/guards.ts), and [discovery/discovery-graph.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/discovery/discovery-graph.ts).

### What the session remembers

| State | Purpose |
| --- | --- |
| `tabId` | Identify the tab that started discovery |
| `status` | Running, waiting for human choice, found, or stopped |
| `stage`, `message` | Explain the last state update to the UI |
| `scan` | Latest accepted page observation |
| `context` | Preserved description and its source/capture metadata |
| `contextSkipped` | Record explicit continuation without captured context |
| `contextResponse` | Retry/skip response supplied when resuming the context checkpoint |
| `pauseReason` | Distinguish context review from action selection |
| `assessment` | Form recognition and CV selection result |
| `candidates`, `selectedAction` | Available choices and the selected scanned action |
| `selectionSource` | `keyword`, `learned`, `llm`, or `manual`; null before selection |
| `manualResponse` | Candidate index supplied during resume, or null to cancel |
| `clicks`, `visited` | Bound navigation and reject cycles |
| `learned` | Valid labels loaded for this run, plus successful additions |
| `previousOrigin`, `previousLabel`, `learnPrevious` | Associate the latest navigation with possible success credit |

`createDiscoverySession` builds the initial state. A new graph starts with no context, scan, or assessment, zero clicks, and no visited page states. Only learned labels are supplied; context is acquired by the first node.

`JobContext` separates source URL from last page URL. The source identifies where the preserved text was captured. The last page identifies where that context was most recently used.

### What guards do

`hasPageScan` returns a type predicate:

```ts
export function hasPageScan(
  session: DiscoverySession,
): session is SessionWithPageScan {
  return session.scan !== null;
}
```

Its boolean result controls execution. Its type predicate tells TypeScript that a successful check makes `scan` non-null.

`hasLearnablePreviousAction` checks the learning flag, previous origin, previous label, and page scan. It does not save a label. `hasRecognizedSelectedAction` checks eligibility and label recognition without reconstructing a fake page scan.

These guards are predicates. They support normal branch decisions and filtering. Throwing assertions could be introduced for invalid node preconditions, but replacing predicates globally would turn ordinary rejected candidates into exceptions. Such a change would also need deliberate exception-to-stopped-state handling. It is not implemented.

### Why nodes return new objects

The graph declares one state channel:

```ts
const DiscoveryState = Annotation.Root({
  session: Annotation<DiscoverySession>(),
});
```

A node's returned `session` replaces that channel's value. It does not recursively merge nested properties.

```ts
return {
  session: {
    ...session,
    clicks: session.clicks + 1,
  },
};
```

The spread retains the old properties while the explicit `clicks` property overrides one value. LangGraph applies the update, records checkpoint progress, and runs the appropriate next edge. Its documented model is node-returned updates applied through state channels/reducers. [LangGraph graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api#reducers)

This is a shallow copy, not a deep clone. Unchanged scan objects and strings are reused; changed arrays such as `visited` and `learned` are constructed separately. The code avoids mutating prior session inputs. The interfaces themselves are mutable, so this remains an implementation convention rather than a deep readonly guarantee.

Some no-op paths return `{ session }` without constructing a new nested object. That is appropriate when they do not modify it.

This single-channel model suits the serial graph. In the installed implementation, simultaneous nodes cannot both replace this same last-value channel in one step. Parallel work would need deliberate channel/reducer design.

## 11. Walk through every graph node

The functions are nested inside `createDiscoveryGraph(port)`. They close over the supplied `DiscoveryPort`, allowing the same graph to use real Chrome operations or controlled test operations.

### acquireJobContext

The first node calls `port.readContext`. A null result clears the tab's old context and returns a paused session. Otherwise it saves the captured text and page metadata and continues. Browser or storage failures stop. There is no candidate assessment phase.

### contextDecision

The graph pauses before this node. The panel supplies `contextResponse` in the existing checkpoint. Retry clears the pause and routes back to reading; skip sets `contextSkipped: true` and proceeds to scanning; null cancels. The response is distinct from an action index, and its UI handler requires the context-pause guard.

### scanPage

`hasResolvedJobContext` requires captured context or an explicit skip. The node then calls `port.scan()`, rejects a changed origin relative to its preceding scan, and rejects a first controls scan whose URL differs from the capture page. It preserves the captured string and saves an updated last page URL when context exists.

It then returns the new observation with status `running`, stage `scan`, and an inventory summary. A scan or context-storage failure becomes a stopped state.

The description in the controls scan comes from the same reader but does not replace the earlier context here. Later scans update only its last page URL.

### assessForm

The node requires a scan and calls `assessApplicationForm`.

Its decisions run in this order:

1. A found form returns status `found`.
2. A truncated field/action inventory stops an unsuccessful recognition.
3. Multiple complete areas stop for review. Partial evidence retains its indexes and continues.
4. Five already completed clicks stop further navigation.
5. A previously visited fingerprint stops a cycle.
6. Otherwise, record this fingerprint and continue to action selection. For a partial match, the trace names the missing signal.

The order is intentional. A complete form found after the fifth click is success. Complete proof also wins before truncation rejection under the agreed rule.

`pageFingerprint` serializes page URL, title, fields, and actions. It omits description text and the random scan ID. Repeating a scan therefore does not appear to make progress merely because it generated a new ID.

### chooseAction

The node requires a scan and calls `chooseApplicationAction`.

No eligible candidates stops the graph. The highest-priority recognized candidate stores its action/source and remains `running`, routing to `click`. No recognized match stores the candidates, remains `running`, and routes to the separate `llmActionChoice` node. `chooseAction` performs no HTTP request.

`manualResponse` is cleared so a response from an earlier choice cannot become the next selection automatically.

### chooseActionWithLlm

This is the `llmActionChoice` node. Its guards require a scan and eligible candidates. It calls `port.selectActionWithLlm`, then returns stage `llmActionChoice`. An accepted result remains `running` with source `llm` and routes to `click`; null or request failure preserves the choices and returns status `paused` for the existing manual breakpoint. Separating this operation makes the model fallback visible in graph state and the panel trace without changing the checked click or manual resume behavior.

These names describe the operation rather than its provider. The current backend uses Jev through OpenRouter; choosing a provider does not change the graph's selection-source vocabulary.

The port makes a direct fetch, and the backend calls OpenRouter. Their completion logs share the backend-generated `X-Request-Id`. Provider logs include upstream status, duration, every candidate's yes probability, and the reason a decision needs manual choice. Panel request errors include the ID, so you can find the corresponding terminal log. Follow the [logging walkthrough](job-extension-backend-first-increment.md#follow-a-request-through-the-logs) for examples and where to open the extension console.

### manualSelection

The graph pauses before this node executes. On resume, it reads the response supplied through a checkpoint state update.

Null cancels. Non-integer responses are invalid. An integer must match an existing candidate index, and that candidate must still meet metadata-level navigation eligibility.

The node selects the candidate with source `manual` and returns `running`. Live DOM validation happens in the later click operation; the manual node does not independently prove the page stayed unchanged while waiting.

### clickAction

The node requires a scan, selected action, and eligible navigation metadata. It calls `port.click`, which performs additional page-side checks.

Only after the click operation returns successfully does it increment `clicks`, record the origin/normalized label, and set `learnPrevious` for manual selection. It records stage `click` and routes toward waiting.

A failed click stops. The node does not retry the side effect automatically.

### waitForPage

The node requires the preceding scan and calls `port.waitForChange`. Success records stage `wait` and routes back to scanning. Failure records a stopped state.

Waiting and scanning are distinct operations. Waiting checks observable progress; the next scan supplies the observation used for assessment.

### recordSuccess

Assessment success routes here even when no label needs learning.

If no learnable preceding action exists, or the selected label is already recognized, the node returns unchanged session data. Otherwise it saves the origin/label pair and appends it to `learned`.

A successful save records stage `learn` and a learning message. A save failure also records a learning message but retains status `found`. Form discovery remains valid even when label persistence fails.

### Edges are the execution policy

[discovery/routes.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/discovery/routes.ts) maps state to the next node:

| After node | Route |
| --- | --- |
| acquireContext | Stopped ends; resolved context scans; otherwise contextDecision |
| contextDecision | Stopped ends; explicit skip scans; retry reacquires |
| scan | Stop ends; otherwise assess |
| assess | Found learns; stopped ends; otherwise choose |
| choose | Stopped ends; selected action clicks; otherwise llmActionChoice |
| llmActionChoice | Stopped ends; selected action clicks; otherwise manual |
| manual | Stopped ends; otherwise click |
| click | Stopped ends; otherwise wait |
| wait | Stopped ends; otherwise scan |
| learn | End |

The compiled graph uses `MemorySaver` and breakpoints before `contextDecision` and `manual`.

```mermaid
flowchart TD
    Start([Start]) --> Context[acquireJobContext]
    Context -->|Non-empty| Scan[scanPage]
    Context -->|Empty| ContextPause[Checkpoint before contextDecision]
    ContextPause -->|Retry| Context
    ContextPause -->|Skip| Scan
    ContextPause -->|Cancel| Stop
    Context -->|Failure| Stop
    Scan --> Assess[assessForm]
    Assess -->|Found| Learn[recordSuccess]
    Learn --> End([End])
    Assess -->|Absent or partial, and within limits| Choose[chooseAction]
    Choose -->|Highest-priority recognized action| Click[clickAction]
    Choose -->|No recognized matches| Llm[chooseActionWithLlm]
    Llm -->|Highest yes probability at least 0.8| Click
    Llm -->|Below threshold or failure| Pause[Checkpoint before manual]
    Pause --> Update[Panel supplies choice and resumes]
    Update --> Manual[manualSelection]
    Manual --> Click
    Click --> Wait[waitForPage]
    Wait --> Scan
    Scan -->|Failure| Stop[Stopped state]
    Assess -->|Ambiguous, incomplete, cycle, limit| Stop
    Choose -->|No candidates| Stop
    Manual -->|Cancel or invalid| Stop
    Click -->|Failure| Stop
    Wait -->|Failure| Stop
    Stop --> End
```

## 12. Checked clicking and waiting

Read [sidepanel/browser-discovery-port.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/browser-discovery-port.ts) and [content/application/click-scanned-action.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/click-scanned-action.ts).

`DiscoveryPort` names the operations the graph requires: read context, scan controls, request LLM action selection, click, wait for change, save/clear context, and learn action. It is an application interface, not a model-selected tool declaration.

`createBrowserDiscoveryPort(tabId, signal)` implements the interface using Chrome. Tests implement it with supplied scans and mocked effects. This prevents graph logic from being tightly coupled to Chrome's globals.

### The action snapshot

[content/application/scan-snapshot.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/scan-snapshot.ts) describes the page-local snapshot:

```ts
interface ScanSnapshot {
  id: string;
  pageUrl: string;
  elements: HTMLElement[];
  markup: string[];
}
```

Stored markup supports change detection; it is not a parsed selector or permanent locator.

### Where the snapshot is stored

The interface file defines a TypeScript shape. It does not save anything by itself. The actual assignment happens in [scanPage](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/content/application/scan-page.ts):

```ts
(window as ScannerWindow).__ragnarokScan = {
  id: scanId,
  pageUrl: location.href,
  elements: actionScan.elements,
  markup: actionScan.elements.map((element) => element.outerHTML),
};
```

This is a custom property on the page's content-script `window`, held in memory. It is not a file on disk, a database record, `localStorage`, or `chrome.storage`. The type assertion `window as ScannerWindow` tells TypeScript about that custom property; it does not create another window or storage mechanism.

Chrome gives content scripts an isolated JavaScript world while allowing them to access the page DOM. The host site's JavaScript and the extension panel do not directly share this property. Our later injected click function accesses it in the same extension's isolated world for that document. [Chrome: content scripts and isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)

Each scan replaces the property with a new snapshot. A checked click clears it before dispatch. A new page document has a new execution context, so the previous snapshot cannot be used there. An in-page update can preserve the context, which is why the click function still validates the scan ID, page URL, element connection, and markup.

### Why metadata alone is insufficient for a click

Suppose scanning discovers action index 2 with label `Apply now`. The panel receives metadata such as the label, index, and scan ID. The live button stays in the snapshot as `elements[2]`; `markup[2]` holds its outerHTML at scan time.

The graph selects index 2 and asks the port to click it. The injected click function uses the matching snapshot to retrieve that exact element and validate it. It does not search the page again for any button whose text happens to be `Apply now`.

```text
Scan in page → action metadata to panel + element references kept in page
Graph decides → selected scan ID and action index sent back to page
Checked click → validate snapshot → retrieve original element → click
```

A live DOM element cannot serve as our serializable cross-context payload. The snapshot connects the graph's plain metadata to the observed page element. It also lets us reject a stale decision: if a later scan has reused index 2 for a different action, the old scan ID no longer matches.

Despite the filename, this snapshot stores **action references only**. Field detection also uses live elements while resolving labels and areas, but those references are not retained in `__ragnarokScan`.

The retained elements remain live references; this is not a frozen copy of the DOM or a saved screenshot. Only the strings in `markup` capture the elements' HTML at the time of scanning. Comparing outerHTML catches some changes, but does not freeze event handlers or guarantee the site's behavior is unchanged.

### Dispatching a click

The port verifies the active tab, checks cancellation, and injects `clickScannedAction` with the selected scan ID and index.

Chrome serializes that function without its imported runtime dependencies. Its guards therefore live inside the function. Type-only imports disappear at compilation and do not create runtime dependencies.

The page-side checks are:

1. The snapshot exists and matches the supplied ID and current page URL.
2. The indexed element exists, remains connected, and has unchanged outerHTML.
3. The element and its ancestors remain visible under the implemented checks.
4. The action is not disabled.
5. It is not a native form submit control.
6. An anchor is neither a download nor a non-http(s) destination.

The function clears the snapshot before calling `element.click()`. Reusing the snapshot cannot dispatch a second click.

The panel receives a plain click result. `hasConfirmedClick` checks the explicit success flag; otherwise `getClickFailureReason` supplies the page's reason or a fallback error.

This validates the observed element, not the complete behavior of the site's JavaScript handler. A button can still have application-specific effects. Future automation must retain review around consequential actions.

### Waiting for progress

The port polls every 400 ms, with a nominal 12-second deadline. It compares the current fingerprint with both the original scan and the preceding polling sample.

`isChangedPageReady` requires a different fingerprint from the original, three consecutive identical fingerprints, and at least one field or action.

A changed URL alone is insufficient. This supports in-page dialogs and SPA changes without requiring a document reload event.

Transient scan failures reset the stability count and retain their error message. Active-tab switching is checked outside that retry block and stops the operation. Cross-origin observations fail the polling scan path and eventually stop with the retained reason.

Cancellation interrupts the pending delay and graph execution. It does not undo an already dispatched click or guarantee cancellation of a Chrome API call already in flight. The polling deadline is checked between awaited operations; it does not forcibly terminate an unresponsive injection.

## 13. How the panel starts, pauses, resumes, and displays the graph

Read [sidepanel/App.tsx](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/App.tsx).

### React state and refs have different purposes

React state holds the latest controls scan, session, captured context, status message, busy display, and trace.

The `run` ref retains the graph instance, thread ID, and AbortController across renders. `operationBusy` blocks overlapping operations immediately, before a React render updates the disabled buttons. `panelOpen` prevents creating a run after asynchronous setup finishes for a closed panel.

The mounting effect restores context only when its last URL matches the active tab. Cleanup aborts the run and marks the panel closed.

### Manual scan

`handleScan` acquires the operation lock, aborts any previous graph, clears session/context/trace, and obtains the active tab. It collects context before scanning controls and verifies both observations have the same page URL.

It saves captured context or clears the current tab's stored context and renders the text and controls. This operation does not execute the discovery loop or click navigation candidates.

### Discovery

`handleDiscover` acquires the lock, resets the displayed run, and obtains the active tab ID. It loads learned labels and the graph module concurrently. Stored context is not supplied to the new run.

It creates a fresh graph and `threadId`, supplies a browser port with an AbortSignal, stores the run in the ref, and streams an initial `createDiscoverySession`.

`streamRun` uses `streamMode: "values"` and a recursion limit of 50. Each streamed session updates the React session, captured context, controls scan, message, and trace.

`appendDiscoveryTrace` suppresses consecutive identical stage/message entries and retains the latest 50. This trace summarizes session updates, not every internal framework event.

### Pause and resume

The graph compiles with:

```ts
{
  checkpointer: new MemorySaver(),
  interruptBefore: ["contextDecision", "manual"],
}
```

After an uncertain choice, the graph pauses before the manual node. The panel displays eligible candidates through [DiscoveryPanel.tsx](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/DiscoveryPanel.tsx).

Selecting a candidate calls `handleSelect(index)`. It verifies `isWaitingForManualSelection`, updates the checkpoint with `manualResponse`, and resumes by streaming null with the same thread ID:

```ts
await activeRun.graph.updateState(config, {
  session: { ...session, manualResponse: index },
});
await streamRun(activeRun, null);
```

Null here means resume from the checkpoint. The separate null `manualResponse` means cancel when the manual node executes.

The context pause uses the same mechanism. `handleContextDecision` verifies `isWaitingForContextDecision`, supplies `contextResponse: "retry" | "skip" | null`, and resumes the checkpoint. The guard prevents context controls from answering an action-selection pause.

We deliberately use a static breakpoint in this browser implementation. During implementation, dynamic `interrupt()` failed because the installed browser entry point did not provide its implicit runnable context. Static breakpoints worked in that runtime. Official guidance presents dynamic interrupts for human workflows and static breakpoints primarily for debugging, so this browser workaround should be revisited as review flows become more complex. [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)

### Rendering

`FieldCard`, `ActionCard`, and `ScanResult` render scan metadata and raw JSON. Nearby labels are visibly identified as plausible. Native select truncation and field/action caps are reported.

`DiscoveryPanel` renders the captured string and source URL, context retry/skip/cancel choices, CV evidence, manual action choices, and the trace. It explains that the baseline can include unrelated page text. `getCvCandidateMessage` formats the selected CV candidate separately from JSX.

[sidepanel/styles.css](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/styles.css) handles wrapping and bounded text/results for the narrow panel. It does not control the employer page.

## 14. Persistence and current state limitations

Read [sidepanel/discovery-storage.ts](/Users/filipemendes/Documents/ragnarok/apps/job-extension/src/sidepanel/discovery-storage.ts).

| Storage | Contents | Lifetime |
| --- | --- | --- |
| MemorySaver | Graph checkpoint state for a run | While that graph instance remains in the panel |
| Chrome session storage | `jobContext:<tabId>` | Browser session; explicitly removed when the tab closes |
| Chrome local storage | `learnedApplicationActions` | Across panel/browser sessions until cleared or removed |

Stored context validates a non-empty bounded string, web URLs, and capture time. It has no version or block/candidate evidence contract. Learned labels validate an exact web origin and a non-empty normalized label of at most 200 characters. Loading drops malformed labels and keeps at most 100. Saving deduplicates exact pairs.

Reopening the panel can restore a matching-page context preview and reuse labels. It does not restore an interrupted graph or replay its old clicks. A fresh discovery reacquires context; unresolved acquisition clears the current tab's old description.

There are also current semantic limitations:

- A new scan retains some preceding action/candidate metadata. Those values can describe the previous page, which is useful for learning but ambiguous under current names.
- Budget/cycle stop paths can retain the preceding assessment rather than the newly computed absent result.
- The `learn` node can return unchanged data, leaving `stage: "assess"`. It executed even though the UI's deduplicated trace does not show a distinct learning step.
- The graph is marked `found` before optional label saving finishes. A consumer should distinguish finding the form from completing all optional effects.

These are reasons to clarify state ownership and transition records in a later refactor. They do not justify mutating graph input objects.

## 15. Connect the extension to the existing web application

The implemented endpoint is `POST /api/extension/select-action`: the browser port sends eligible action metadata, the backend authenticates the existing web session and calls Jev, and the graph uses a validated decision or pauses for manual choice. Follow the [backend increment walkthrough](job-extension-backend-first-increment.md) for its exact code path and local setup. Retrieval and generation calls described below remain proposed.

### The backend already separates retrieval and generation

| Existing file | Current behavior | Potential reuse |
| --- | --- | --- |
| [retrieval-service.ts](/Users/filipemendes/Documents/ragnarok/apps/web/src/server/modules/retrieval/retrieval-service.ts) | Validate query/scope, embed, retrieve eligible owned chunks | Obtain evidence from the user's CV and other selected documents |
| [retrieval-input.ts](/Users/filipemendes/Documents/ragnarok/apps/web/src/server/modules/retrieval/retrieval-input.ts) | Validate bounded query and document scope | Keep ownership/scope validation behind an authenticated boundary |
| [generation-context.ts](/Users/filipemendes/Documents/ragnarok/apps/web/src/server/modules/generation/generation-context.ts) | Build a bounded question-and-evidence prompt with source labels | Reuse evidence formatting ideas for grounded application answers |
| [generation-service.ts](/Users/filipemendes/Documents/ragnarok/apps/web/src/server/modules/generation/generation-service.ts) | Generate a cited answer or abstain without evidence | Retain generic question answering; add a separate application-specific workflow |
| [openrouter-text-generator.ts](/Users/filipemendes/Documents/ragnarok/apps/web/src/server/llm/openrouter-text-generator.ts) | Server-side streamed text generation, timeout/cancellation, usage/error metadata | Reuse provider transport patterns and server-held credentials |
| [chat-service.ts](/Users/filipemendes/Documents/ragnarok/apps/web/src/server/modules/chat/chat-service.ts) | Coordinate conversation messages, retrieval/generation runs, persistence and retries | Keep chat persistence independent from extension discovery |
| [chat/stream/route.ts](/Users/filipemendes/Documents/ragnarok/apps/web/src/app/api/chat/stream/route.ts) | Authenticate, validate request, call chat service, stream SSE | A reference for thin HTTP boundaries |

The retrieval service enforces ownership in its repository queries and validates selected document eligibility. Its current result limit is five chunks. The query limit is 10,000 characters; a 20,000-character job description cannot simply be passed unchanged as a retrieval query.

The current generation prompt answers questions from supplied evidence and uses source labels. It is not a form-answer planning or job-fit schema. The provider adapter currently sends a streamed text request; it does not expose tool definitions or a structured response-format contract.

The chat route checks a supplied Origin host against the web request's host. An extension origin does not satisfy that check. It also relies on web authentication and conversation/message contracts. The separate extension action-selection route uses the configured `JOB_EXTENSION_ORIGIN` and existing session authentication; it does not alter the chat route's policy.

### Recommended integration boundary

The action-selection route establishes a narrow extension-facing HTTP boundary, calls the existing authentication helper, and delegates the Jev decision to one server function. Extend this approach for each needed server operation. Keep the existing chat route and web chat behavior intact.

The route should derive the authenticated user on the server, validate a bounded payload, invoke the appropriate service, and return a minimal serializable result. Provider credentials stay on the server. A Chrome permission to contact the API and a backend origin/authentication policy are separate requirements.

Possible endpoint responsibilities are:

- Select a discovery action from supplied candidates.
- Select a description section from supplied text blocks.
- Retrieve applicant evidence from authorized documents.
- Produce a grounded job analysis or application answer plan.

Only action selection is implemented here. The other responsibilities remain proposed, and their listing does not require implementing all endpoints together.

There is no demonstrated need to introduce a Python HTTP API, duplicate ingestion, or move the browser graph to the server. Chrome observations and effects remain local; provider inference and private document access remain server-side.

## 16. Where LLM fallbacks belong

The model should receive a bounded decision task at the phase that needs interpretation.

| Phase | Deterministic path | Proposed model role | When model output is unusable |
| --- | --- | --- | --- |
| Opening the form | Rank eligible built-in/saved phrases | Evaluate each candidate independently and select the highest qualifying probability | Pause for human choice |
| Locating description | Known containers or main/body text capture | Later select supplied text sections when capture needs refinement | Let the user select/paste text |
| Understanding unfamiliar field labels | HTML/ARIA/metadata rules | Suggest a semantic field category | Mark unresolved for review |
| Obtaining name/email/phone | Explicit applicant profile facts | Usually no model needed | Ask for the missing fact |
| Matching experience to a role | Retrieve authorized document evidence | Explain requirements and supported matches | Report missing evidence |
| Drafting free-text answers | Exact facts and relevant retrieved excerpts | Draft supported answers with provenance | Leave unanswered for review |
| Final review | Required fields, types, limits, evidence references | Optional critique of narrative quality | Keep the plan awaiting human review |

An LLM fallback for label interpretation should not silently redefine the current name/email/file form-proof policy. That is a separate product decision.

### Implemented model fallback: candidate selection

The current action-selection flow is:

```mermaid
flowchart TD
    Choose[Deterministic action selection] --> Recognized{Recognized candidate?}
    Recognized -->|Yes, highest priority then page order| Click[Checked click]
    Recognized -->|No eligible candidates| Stop[Stop for review]
    Recognized -->|No recognized matches| Model[One Noul per candidate in one request]
    Model --> Validate[Validate decision against scan and candidates]
    Validate -->|Valid choice| Click
    Validate -->|Abstain, failure, invalid result| Manual[Existing manual breakpoint]
    Click --> Wait[Existing wait and rescan]
```

This adds interpretation between `choose` and `manual`. The existing eligibility, checked click, timeout, click budget, cycle detection, and form assessment remain authoritative.

The response contract is:

```ts
interface ActionSelectionResult {
  actionIndex: number | null;
  probability: number;
}
```

The server receives bounded candidate metadata and returns a decision about those candidates. It does not invent a new URL, selector, script, or click instruction.

The extension validates the response shape, integer index, candidate membership, and continued navigation eligibility. Its browser port retains the original scan while awaiting the request, so the existing page-side click validation still checks that scan's ID and catches stale or changed DOM.

The backend validates one yes/no answer per supplied action, sorts by descending probability and ascending index for exact ties, and returns the best index if its probability reaches `0.8`. Otherwise the index is null. The `probability` field always contains the highest candidate's yes probability. This initial policy does not prove the chosen action correct or mean 80% measured accuracy. The graph records `selectionSource: "llm"`; provider logs identify Jev and its model slug.

This increment makes one model decision attempt for an uncertain scan, with an eight-second provider timeout, a twelve-second extension request timeout, and the existing manual fallback. The page can change while the network request is pending, so snapshot validation still runs after a model response.

Jev's Noul primitive returns a yes probability for each question. Each question contains the fixed application-opening question and one candidate; all questions travel in a single request. Multiple valid candidates can receive high scores independently, unlike a single Choice distribution. The server calls OpenRouter's Decisions API using the existing `OPENROUTER_API_KEY` and model `typesafe/jev-1.13`; no provider SDK, generic API client, or request framework was added. Runtime validation remains necessary at both HTTP boundaries. See the [backend walkthrough](job-extension-backend-first-increment.md#4-one-server-function-evaluates-each-candidate) for request construction, response parsing, and the live example. [OpenRouter Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)

### Description selection is a different model task

Description fallback needs observed text sections with IDs, not the action list and not the applicant's CV. Collect bounded text blocks while still on the overview, ask for relevant block IDs, and assemble the selected text from those blocks.

If the text is inaccessible or hidden, choose a DOM/navigation/manual solution first. A model cannot identify an absent block. Treat page text as input data rather than instructions about which tools or actions to execute.

Description quality should be represented independently from form discovery. A form can be found with missing context; later job analysis may need to wait for supplied context.

## 17. Tool calling, RAG, and the final analysis

Tool calling means giving a model named operations with schemas, then executing a validated requested operation through application code and returning its result. A `DiscoveryPort` method becomes a model tool only if we deliberately expose it through such a mechanism.

The first navigation fallback needs one classification response, so it can use structured output directly.

### Separate exact applicant facts from document evidence

An applicant profile should contain deliberately supplied facts such as name, email, phone, and application preferences. No profile service currently exists in this extension implementation.

Semantic retrieval is appropriate for questions such as "Which project demonstrates event-driven backend experience?" It is a weak primary mechanism for obtaining an exact email address or inferring a personal preference.

A CV used as retrieval evidence and a file uploaded into the employer's form are also different resources. Being able to retrieve a PDF's indexed text does not mean the extension has that PDF's bytes ready to upload.

The later CV step needs an explicit file source, user-authorized access to it, a validated target, and a rescan after any site autofill. Model inference alone does not provide local file access.

### Start with explicit retrieval calls

When the required data flow is already known, the graph/service can call retrieval directly:

```text
description and unanswered form question
retrieve relevant owned evidence
generate a proposed answer
validate its shape and referenced evidence
show the draft for review
```

This keeps retrieval visible and testable. A model does not need to decide whether to invoke a tool every time a known phase always requires evidence.

Later, model-selected tools make sense if the next data requirement depends on the question. Proposed operations could include:

| Proposed tool | Executor | Purpose |
| --- | --- | --- |
| `getApplicantProfile` | Authenticated server service | Return explicitly supplied structured facts |
| `retrieveApplicantEvidence` | Existing server retrieval service through a new boundary | Return relevant evidence from allowed documents |
| `getCurrentFormSchema` | Extension, if fresher observation is needed | Return a checked current field inventory |

The server derives user identity; the model does not supply arbitrary user IDs to retrieve another person's documents. A model-selected query and document scope must still pass normal authorization and validation.

If job context or form metadata is already present in state, pass the necessary data directly rather than adding a redundant tool call just to read it.

### Grounded analysis and answer planning

A later application service can combine the job description, explicit profile facts, selected evidence, and form questions into a structured plan.

The plan should distinguish facts, proposed prose, unsupported questions, and evidence references. Job requirements describe the employer's needs; they do not establish the applicant's skills. A grounded answer must link applicant claims to supplied facts or retrieved evidence.

For learning, first build a read-only job analysis or answer proposal. Keep filling as a separate later operation with field identity checks and review. That gives us a complete retrieval/generation experiment before implementing more browser effects.

### Is another final LLM call needed?

First validate mechanically: known field IDs, valid data types, allowed option values, required unresolved fields, output limits, and evidence IDs that exist in the selected context.

These checks cannot prove every natural-language claim is supported. A second model can critique unsupported prose or relevance, but its judgment is another fallible inference call.

Add that call only if observed failures justify it. It adds latency, cost, and another output to validate. A model approving another model's answer is not proof of factual correctness and should not replace the person's review.

## 18. Suggested next implementation sequence

These phases are proposals for discussion, not changes made by this document.

| Phase | Concrete result | Why this order |
| --- | --- | --- |
| 1 | Plain text capture and explicit context decisions (current baseline) | Establish the basic flow before refining extraction |
| 2 | Add a small context acceptance rule based on at least two distinct job-description keyword groups; inspect rejected captures | Address observed application-form text being accepted as a description without redesigning extraction |
| 3 | Structured applicant facts and a document-selection/retrieval boundary | Separate exact data from supporting evidence and reuse existing ownership rules |
| 4 | Read-only grounded job analysis and application answer proposals | Connect the existing RAG capability to a useful extension result |
| 5 | CV attachment/autofill, rescan, controlled filling, and review | Add browser effects after data contracts and evidence behavior are understood |
| 6 | Conditional tools or an additional model review where demonstrated useful | Introduce dynamic orchestration for an actual branching requirement |

The acceptance rule is proposed, not implemented. The current gate still accepts any non-empty capture. Add a context model fallback only if observed misses justify it; the action-selection fallback already exists. Improving descriptions first need not mean perfect coverage of every ATS. Use representative fixtures and explicitly represent unresolved context.

## 19. Current verification checkpoint

At the 2026-10-03 checkpoint, the tests were updated at the user's request. All 97 extension unit tests passed against the current plain-text context, `PageScan`, and discovery APIs. Tests for removed block/candidate acceptance logic were replaced with capture and context-boundary coverage. Scanner and checked-click tests now mirror `src/content/application/`.

Application typechecking includes source, tests, and build/test configuration. Run `npm run typecheck`, `npm run test`, and `npm run build` from `apps/job-extension`. The separate `vitest.config.ts` uses a fixed public origin, so unit tests do not require the web environment file or execute the production manifest hook.

All 132 web unit tests passed, including the extension route and Jev selection service. Those tests cover session/caller checks, input limits, independent candidate probabilities, ties, manual fallback, provider failures, and redacted logging with mocked provider calls. Both applications' typechecks and production builds passed, as did web lint. Database integration tests were not rerun because persistence behavior was unchanged. The extension build retains its existing warning for the large, lazily loaded LangGraph chunk.

Inspect real captures through Scan page and the context stage through Find application form. The [context walkthrough](job-context-first-increment.md) provides the short reading path. Unit tests use fixture DOM and mocked Chrome/network effects; employer-specific rendering and browser cookie behavior still need live inspection when relevant.

## 20. Diagnose a miss at the correct layer

| Symptom | First evidence to inspect |
| --- | --- |
| Apply button absent from actions | Visibility, supported selector, field-like classification, nesting, or action cap |
| Button listed but not a candidate | Label exclusions, button type/form ownership, target, destination, disabled state |
| Candidate not automatically chosen | Normalized exact phrase, stored origin/label pair, priority/index ordering, or Jev probabilities below threshold |
| Click rejected | Snapshot ID/URL, changed markup, visibility, disabled/submission state |
| Page changed but discovery waits | Fingerprint stability, empty inventories, scan failures, or tab identity |
| Fields present but no form | Area keys, enabled state, name/email evidence, or multiple complete areas |
| Form found but no CV candidate | Upload labels excluded all files from CV classification |
| Empty description | Description selectors, main/body fallback, timing, hidden/excluded content, frame/shadow boundary |
| Unknown phrase not saved | Manual selection provenance, immediate form proof, existing recognition, or storage failure message |
| Saved phrase ignored | Exact normalized label/origin, current eligibility, loading validation, or another match winning priority/index ordering |

The structured scan helps distinguish a detection failure from a decision failure. The graph message explains a transition outcome. The storage data establishes whether a phrase was actually persisted.

For a real missing-description report, the useful evidence is the visible section's DOM structure and the scan result from that moment. Those facts determine whether to extend a selector, section traversal, timing policy, or browser access.
