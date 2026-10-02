import { beforeEach, describe, expect, it } from "vitest";
import { scanApplicationForm } from "../../../src/content/scan-application-form";

beforeEach(() => {
  document.body.replaceChildren();
  document.title = "Apply now";
});

describe("scanApplicationForm", () => {
  it("captures labeled controls without collecting entered values", () => {
    document.body.innerHTML = `
      <form>
        <label for="full-name">Full name</label>
        <input id="full-name" name="candidate_name" type="text" required value="Private applicant name">
        <label><input name="consent" type="checkbox" checked> I agree</label>
      </form>
      <textarea name="motivation" placeholder="Why this role?">Private answer</textarea>
    `;

    const result = scanApplicationForm();

    expect(result.pageTitle).toBe("Apply now");
    expect(result.pageOrigin).toBe(location.origin);
    expect(result.fields).toMatchObject([
      {
        index: 0,
        formIndex: 0,
        control: "input",
        inputType: "text",
        label: "Full name",
        labelSource: "html-label",
        groupLabel: null,
        name: "candidate_name",
        id: "full-name",
        placeholder: null,
        required: true,
        disabled: false,
      },
      {
        index: 1,
        formIndex: 0,
        control: "input",
        inputType: "checkbox",
        label: "I agree",
        labelSource: "html-label",
        groupLabel: null,
        name: "consent",
        id: null,
        placeholder: null,
        required: false,
        disabled: false,
      },
      {
        index: 2,
        formIndex: null,
        control: "textarea",
        inputType: null,
        label: null,
        labelSource: null,
        groupLabel: null,
        name: "motivation",
        id: null,
        placeholder: "Why this role?",
        required: false,
        disabled: false,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("Private applicant name");
    expect(JSON.stringify(result)).not.toContain("Private answer");
    expect(result.actions).toEqual([]);
  });

  it("uses ARIA labels and reports select choices while skipping hidden controls", () => {
    document.body.innerHTML = `
      <span id="question">Work authorization</span>
      <form>
        <input type="hidden" name="csrf" value="private-token">
        <input type="submit" value="Send">
        <input name="work_authorization" aria-labelledby="question" aria-label="Other label">
        <select name="location" aria-label="Location" required>
          <option value="remote">Remote</option>
          <option value="onsite">On site</option>
        </select>
        <div style="display: none"><input name="future_step"></div>
        <input name="locked" disabled>
      </form>
    `;

    const result = scanApplicationForm();

    expect(result.fields.map((field) => field.name)).toEqual(["work_authorization", "location", "locked"]);
    expect(result.fields[0]?.label).toBe("Work authorization");
    expect(result.fields[0]?.labelSource).toBe("aria-labelledby");
    expect(result.fields[1]).toMatchObject({
      control: "select",
      label: "Location",
      required: true,
      options: [{ label: "Remote", value: "remote" }, { label: "On site", value: "onsite" }],
      optionCount: 2,
    });
    expect(result.fields[2]?.disabled).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-token");
    expect(result.actions).toMatchObject([{ kind: "button", label: "Send", buttonType: "submit", formIndex: 0 }]);
  });

  it("uses nearby text only for isolated unlabeled controls", () => {
    document.body.innerHTML = `
      <form>
        <div><span>Portfolio URL</span><input name="portfolio"></div>
        <div><input type="checkbox" name="updates"><span>Send me updates</span></div>
        <div><span>Shared heading</span><input name="first"><input name="second"></div>
      </form>
    `;

    const result = scanApplicationForm();

    expect(result.fields.map((field) => [field.label, field.labelSource])).toEqual([
      ["Portfolio URL", "nearby"],
      ["Send me updates", "nearby"],
      [null, null],
      [null, null],
    ]);
  });

  it("resolves field labels in ARIA, HTML, upload-trigger, then nearby order", () => {
    document.body.innerHTML = `
      <span id="reference">ARIA reference</span>
      <label for="first">HTML label</label>
      <input id="first" aria-labelledby="reference" aria-label="ARIA text">
      <label for="second">HTML label</label><input id="second" aria-label="ARIA text">
      <label for="third">HTML label</label><input id="third">
      <div><span>Nearby text</span><input id="fourth" type="file"></div>
      <button type="button" aria-controls="fourth">Resume upload</button>
      <div><span>Nearby text</span><input id="fifth"></div>
    `;
    expect(scanApplicationForm().fields.map((field) => [field.label, field.labelSource])).toEqual([
      ["ARIA reference", "aria-labelledby"],
      ["ARIA text", "aria-label"],
      ["HTML label", "html-label"],
      ["Resume upload", "upload-trigger"],
      ["Nearby text", "nearby"],
    ]);
  });

  it("does not replace an empty visible upload trigger with nearby text", () => {
    document.body.innerHTML = `
      <form><div><span>Nearby text</span><input id="resume" type="file"></div></form>
      <button type="button" aria-controls="resume"></button>
    `;
    expect(scanApplicationForm().fields[0]).toMatchObject({ inputType: "file", label: null, labelSource: null });
  });

  it("recognizes ARIA comboboxes, fieldsets, and visible actions without navigation", () => {
    document.body.innerHTML = `
      <form>
        <fieldset><legend>Work preference</legend><label><input type="radio" name="remote"> Remote</label></fieldset>
        <div><span>Country</span><button type="button" aria-haspopup="listbox">Choose country</button></div>
        <input role="combobox" aria-label="City" name="city">
        <div><span>Office</span><div role="combobox"><input name="office" placeholder="Choose office"></div></div>
        <button type="submit">Apply now</button>
        <a href="/description">Job description</a>
        <div hidden><button>Hidden action</button></div>
      </form>
    `;

    const result = scanApplicationForm();

    expect(result.fields).toMatchObject([
      { control: "input", inputType: "radio", label: "Remote", groupLabel: "Work preference" },
      { control: "combobox", label: "Country", labelSource: "nearby" },
      { control: "combobox", label: "City", labelSource: "aria-label" },
      { control: "combobox", label: "Office", labelSource: "nearby", name: "office", placeholder: "Choose office" },
    ]);
    expect(result.actions.map((action) => [action.kind, action.label])).toEqual([
      ["button", "Apply now"],
      ["link", "Job description"],
    ]);
    expect(result.actions[1]?.href).toBe(new URL("/description", location.href).href);
  });

  it("associates hidden uploads with visible labels and preserves their DOM order", () => {
    document.body.innerHTML = `<form>
      <label for="resume">Upload resume to autofill</label><input id="resume" type="file" style="display:none">
      <label for="cover">Cover letter</label><input id="cover" type="file" hidden>
      <input type="file" hidden id="unrelated">
      <label>Full name<input name="full_name"></label><input type="email">
    </form>`;
    const result = scanApplicationForm();
    expect(result.fields.map((field) => field.id)).toEqual(["resume", "cover", null, null]);
    expect(result.fields.map((field) => field.areaKey)).toEqual(["form:0", "form:0", "form:0", "form:0"]);
    expect(result.fields[0]).toMatchObject({ inputType: "file", label: "Upload resume to autofill", labelSource: "html-label" });
  });

  it("groups a form without a native form element and captures semantic application tabs", () => {
    document.body.innerHTML = `<main><div><label>Name<input></label><input type="email"><input type="file"></div></main>
      <div role="tab" aria-label="Application" tabindex="0">Open</div>`;
    const result = scanApplicationForm();
    expect(result.fields.map((field) => field.areaKey)).toEqual(["area:0", "area:0", "area:0"]);
    expect(result.actions[0]).toMatchObject({ label: "Application", role: "tab" });
  });

  it("captures bounded job text without applicant answers, navigation, or hidden sections", () => {
    document.body.innerHTML = `<article data-job-description><h2>Job description</h2><p>${"Build reliable systems. ".repeat(20)}</p>
      <nav>Navigation noise</nav><textarea>Private applicant answer</textarea><div hidden>Hidden noise</div></article>`;
    const result = scanApplicationForm();
    expect(result.jobDescription.length).toBeGreaterThan(200);
    expect(result.jobDescription).toContain("Build reliable systems.");
    expect(result.jobDescription).not.toMatch(/Navigation noise|Private applicant answer|Hidden noise/);
    document.querySelector("article")?.append("x".repeat(25_000));
    expect(scanApplicationForm().jobDescription).toHaveLength(20_000);
  });

  it("bounds the number of returned fields and select options", () => {
    const select = document.createElement("select");
    for (let index = 0; index < 51; index += 1) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `Choice ${index}`;
      select.append(option);
    }
    document.body.append(select);

    for (let index = 0; index < 200; index += 1) {
      document.body.append(document.createElement("input"));
    }

    const result = scanApplicationForm();

    expect(result.fields).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(result.fields[0]?.options).toHaveLength(50);
    expect(result.fields[0]?.optionCount).toBe(51);
  });
});
