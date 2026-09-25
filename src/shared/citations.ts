const CITATION_PATTERN = /\[S([1-9]\d*)\]/g;

export function citationNumbers(answer: string): number[] {
    return [...answer.matchAll(CITATION_PATTERN)].map((match) => Number(match[1]));
}

export function citationLabel(number: number): string {
    return `[${number}]`;
}
