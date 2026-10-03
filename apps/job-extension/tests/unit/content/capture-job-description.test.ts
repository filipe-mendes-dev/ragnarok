import { beforeEach, describe, expect, it } from "vitest";
import { captureJobDescription } from "../../../src/content/capture-job-description";
import { JOB_DESCRIPTION } from "../support/job-context-fixtures";

beforeEach(() => { document.body.replaceChildren(); });

describe("captureJobDescription", () => {
  it("prefers an explicit description and preserves inline words and list order", () => {
    document.body.innerHTML = `<main><h1>Engineer</h1><article data-job-description><h2>Job description</h2><p>${JOB_DESCRIPTION}</p><ul><li>Type<strong>Script</strong> experience</li><li>Database knowledge</li></ul></article><p>Other page text</p></main>`;
    expect(captureJobDescription()).toBe(`Job description\n${JOB_DESCRIPTION}\nTypeScript experience\nDatabase knowledge`);
  });

  it("falls back to main content when known description selectors are absent", () => {
    document.body.innerHTML = `<header>Company navigation</header><main><h1>Engineer</h1><p>${JOB_DESCRIPTION}</p></main><footer>Footer noise</footer>`;
    expect(captureJobDescription()).toBe(`Engineer\n${JOB_DESCRIPTION}`);
  });

  it("falls back to the body and skips an empty or hidden description container", () => {
    document.body.innerHTML = `<div data-job-description hidden>Hidden description</div><section id="job-description"></section><p>${JOB_DESCRIPTION}</p>`;
    expect(captureJobDescription()).toBe(JOB_DESCRIPTION);
  });

  it("excludes applicant answers, action text, navigation, scripts, and hidden content", () => {
    document.body.innerHTML = `<form data-job-description><h2>Job description</h2><p>${JOB_DESCRIPTION}</p><nav>Navigation noise</nav><script>Private script</script><input value="Private name"><textarea>Private answer</textarea><select><option>Private choice</option></select><div contenteditable>Private editable answer</div><div role="textbox">Private custom answer</div><div hidden>Hidden noise</div><button>Upload CV</button></form>`;
    const text = captureJobDescription();
    expect(text).toBe(`Job description\n${JOB_DESCRIPTION}`);
    expect(text).not.toMatch(/Private|Navigation noise|Hidden noise|Upload CV/);
  });

  it("returns empty text when the page has no usable content", () => {
    document.body.innerHTML = '<nav>Navigation</nav><button>Apply</button><div hidden>Hidden</div>';
    expect(captureJobDescription()).toBe("");
  });

  it("bounds captured text to 20,000 characters", () => {
    document.body.innerHTML = `<article data-job-description><p>${"x".repeat(25_000)}</p></article>`;
    expect(captureJobDescription()).toBe("x".repeat(20_000));
  });

  it("does not replace the action snapshot or click page controls", () => {
    const snapshot = { id: "existing-action-scan" };
    Object.assign(window, { __ragnarokScan: snapshot });
    document.body.innerHTML = `<article data-job-description><p>${JOB_DESCRIPTION}</p></article><button>Apply</button>`;
    let clicked = false;
    document.querySelector("button")?.addEventListener("click", () => { clicked = true; });
    captureJobDescription();
    expect(Reflect.get(window, "__ragnarokScan")).toBe(snapshot);
    expect(clicked).toBe(false);
    Reflect.deleteProperty(window, "__ragnarokScan");
  });
});
