const CITATION_PATTERN = /\[S([1-9]\d*)\]/g;
const CORNER_CITATION_PATTERN = /【S([1-9]\d*)】/g;

export function normalizeCitationMarkers(answer: string): string {
    return answer.replace(CORNER_CITATION_PATTERN, (_marker, number: string) => `[S${number}]`);
}

export function citationNumbers(answer: string): number[] {
    return [...normalizeCitationMarkers(answer).matchAll(CITATION_PATTERN)].map((match) => Number(match[1]));
}

export function citationLabel(number: number): string {
    return `[${number}]`;
}
