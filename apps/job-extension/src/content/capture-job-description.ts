import { MAX_JOB_DESCRIPTION_LENGTH } from "../shared/job-context";
import { isVisible } from "./dom";

const DESCRIPTION_SELECTOR = '[data-job-description], [itemprop="description"], #job-description, .job-description, .ashby-job-posting-description, [data-testid="job-description"]';
const EXCLUDED_TEXT = 'script, style, template, nav, body > header, footer, input, textarea, select, button, [role="navigation"], [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])';
const TEXT_BOUNDARY = "p, li, div, section, article, h1, h2, h3, h4, h5, h6, br";

function isExcludedTextNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.matches(EXCLUDED_TEXT)) return true;
  return !isVisible(node);
}

function readDescription(element: HTMLElement): string {
  let text = "";

  function visit(node: Node): void {
    if (text.length >= MAX_JOB_DESCRIPTION_LENGTH) return;
    if (isExcludedTextNode(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      text += (node.textContent ?? "").slice(0, MAX_JOB_DESCRIPTION_LENGTH - text.length);
      return;
    }
    for (const child of node.childNodes) {
      visit(child);
      if (text.length >= MAX_JOB_DESCRIPTION_LENGTH) break;
    }
    if (node instanceof HTMLElement && node.matches(TEXT_BOUNDARY)) text += "\n";
  }

  visit(element);
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, MAX_JOB_DESCRIPTION_LENGTH);
}

export function captureJobDescription(): string {
  for (const element of document.querySelectorAll<HTMLElement>(DESCRIPTION_SELECTOR)) {
    const text = readDescription(element);
    if (text) return text;
  }

  const main = document.querySelector<HTMLElement>('main, article, [role="main"]') ?? document.body;
  return readDescription(main);
}
