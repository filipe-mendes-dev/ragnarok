const MAX_TEXT_LENGTH = 200;

export function cleanText(value: string | null): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
  return cleaned || null;
}

export function isVisible(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.hasAttribute("inert") || current.getAttribute("aria-hidden") === "true") return false;

    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  }
  return true;
}

export function getFormIndices(): Map<HTMLFormElement, number> {
  return new Map(Array.from(document.forms, (form, index) => [form, index]));
}

export function getFormIndex(element: HTMLElement, indices: Map<HTMLFormElement, number>): number | null {
  const form = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement || element instanceof HTMLButtonElement
    ? element.form
    : element.closest("form");
  return form ? (indices.get(form) ?? null) : null;
}

export function getAriaLabelledBy(element: HTMLElement): string | null {
  const ids = element.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
  return cleanText(ids.map((id) => cleanText(document.getElementById(id)?.textContent ?? null)).filter((part): part is string => part !== null).join(" "));
}

export function getVisibleUploadTrigger(element: HTMLInputElement): HTMLElement | null {
  const label = Array.from(element.labels ?? []).find(isVisible);
  if (label) return label;
  const parent = element.closest<HTMLElement>('button, [role="button"]');
  if (parent && isVisible(parent)) return parent;
  if (!element.id) return null;
  return Array.from(document.querySelectorAll<HTMLElement>("[aria-controls]")).find((candidate) =>
    candidate.getAttribute("aria-controls")?.split(/\s+/).includes(element.id) && isVisible(candidate)) ?? null;
}
