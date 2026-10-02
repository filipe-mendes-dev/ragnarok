import { isVisible } from "./dom";

const MAX_DESCRIPTION_LENGTH = 20_000;
const DESCRIPTION_SELECTOR = '[data-job-description], [itemprop="description"], #job-description, .job-description, .ashby-job-posting-description, [data-testid="job-description"]';
const EXCLUDED = 'script, style, template, nav, header, footer, form, input, textarea, select, button, [role="navigation"], [role="textbox"], [role="combobox"], [contenteditable="true"]';
const DESCRIPTION_HEADING = /^(?:job description|about (?:the|this) (?:role|job)|the role|overview|responsibilities)\s*$/i;

function isExcludedDescriptionNode(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.matches(EXCLUDED)) return true;
  return !isVisible(node);
}

function isJobDescriptionHeading(heading: HTMLElement): boolean {
  if (!isVisible(heading)) return false;
  return DESCRIPTION_HEADING.test(heading.textContent?.trim() ?? "");
}

function readDescription(element: HTMLElement): string {
  const parts: string[] = [];
  let length = 0;
  function visit(node: Node): void {
    if (length >= MAX_DESCRIPTION_LENGTH) return;
    if (isExcludedDescriptionNode(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (!text) return;
      const bounded = text.slice(0, MAX_DESCRIPTION_LENGTH - length);
      parts.push(bounded);
      length += bounded.length + 1;
      return;
    }
    for (const child of node.childNodes) visit(child);
  }
  visit(element);
  return parts.join("\n").slice(0, MAX_DESCRIPTION_LENGTH);
}

export function captureJobDescription(): string {
  for (const element of document.querySelectorAll<HTMLElement>(DESCRIPTION_SELECTOR)) {
    const text = readDescription(element);
    if (text) return text;
  }
  for (const heading of document.querySelectorAll<HTMLElement>("h1, h2, h3")) {
    if (!isJobDescriptionHeading(heading)) continue;
    const container = heading.parentElement;
    if (!container) continue;
    if (container.matches("body, html")) continue;
    const text = readDescription(container);
    if (text.length >= 40) return text;
  }
  return "";
}
