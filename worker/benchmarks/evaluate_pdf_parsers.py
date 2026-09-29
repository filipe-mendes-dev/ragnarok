"""Check saved parser outputs against selected golden-page text expectations."""

from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import cast
import unicodedata


BENCHMARK_DIR = Path(__file__).resolve().parent
GOLD_PATH = BENCHMARK_DIR / "golden-pages.json"
RUNS_DIR = BENCHMARK_DIR / "runs"
RESULTS_DIR = BENCHMARK_DIR / "evaluation-results"
REPORT_PATH = RESULTS_DIR / "report.txt"
PARSERS = ("pypdf", "pymupdf", "pymupdf-sorted", "docling")
PAGE_MARKER = re.compile(r"(?m)^--- page \d+ ---\n")


@dataclass(frozen=True)
class Evaluation:
    found: int
    anchor_count: int
    ordered_pairs: int
    compared_pairs: int
    continuous_phrases: int
    phrase_count: int
    missing: list[str]
    reversed_pairs: list[tuple[str, str]]


def normalize(text: str) -> str:
    """Ignore layout whitespace and case, while retaining accents and punctuation."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip().casefold()


def marked_page_text(path: Path, page_number: int) -> str:
    output = path.read_text()
    marker = re.search(rf"(?m)^--- page {page_number} ---\n", output)
    if marker is None:
        raise ValueError(f"Page {page_number} not found in {path}")
    next_marker = PAGE_MARKER.search(output, marker.end())
    return output[marker.end():next_marker.start() if next_marker else None]


def docling_page_text(path: Path, page_number: int) -> str:
    document: dict[str, object] = json.loads(path.read_text())
    items = cast(list[dict[str, object]], document["texts"])
    page_items: list[str] = []
    for item in items:
        provenance = cast(list[dict[str, object]], item.get("prov", []))
        if any(source.get("page_no") == page_number for source in provenance):
            page_items.append(cast(str, item["text"]))
    if not page_items:
        raise ValueError(f"Page {page_number} has no Docling text in {path}")
    return "\n".join(page_items)


def evaluate(text: str, anchors: list[str], phrases: list[str]) -> Evaluation:
    normalized_text = normalize(text)
    positions = [(anchor, normalized_text.find(normalize(anchor))) for anchor in anchors]
    found = [(anchor, position) for anchor, position in positions if position >= 0]
    pairs = list(zip(found, found[1:]))
    reversed_pairs = [
        (left[0], right[0]) for left, right in pairs if left[1] >= right[1]
    ]
    return Evaluation(
        found=len(found),
        anchor_count=len(anchors),
        ordered_pairs=len(pairs) - len(reversed_pairs),
        compared_pairs=len(pairs),
        continuous_phrases=sum(normalize(phrase) in normalized_text for phrase in phrases),
        phrase_count=len(phrases),
        missing=[anchor for anchor, position in positions if position < 0],
        reversed_pairs=reversed_pairs,
    )


def format_result(parser: str, result: Evaluation) -> list[str]:
    order = (
        f"{result.ordered_pairs}/{result.compared_pairs}"
        if result.compared_pairs else "n/a"
    )
    phrases = (
        f"{result.continuous_phrases}/{result.phrase_count}"
        if result.phrase_count else "n/a"
    )
    lines = [
        f"  {parser:15} anchors {result.found}/{result.anchor_count}"
        f" | order {order} | phrases {phrases}"
    ]
    if result.missing:
        lines.append(f"    missing: {' | '.join(result.missing)}")
    for left, right in result.reversed_pairs:
        lines.append(f"    order: {right!r} appears before {left!r}")
    return lines


def main() -> None:
    gold: dict[str, object] = json.loads(GOLD_PATH.read_text())
    cases = cast(list[dict[str, object]], gold["cases"])
    lines: list[str] = []
    for case in cases:
        case_id = cast(str, case["id"])
        document_name = Path(cast(str, case["pdf"])).stem
        page_number = cast(int, case["pdf_page"])
        anchors = cast(list[str], case["expected_body_order"])
        phrases = cast(list[str], case.get("expected_reconstructed_phrases", []))
        output_dir = RUNS_DIR / document_name
        lines.append(f"{case_id} ({document_name}, PDF page {page_number})")
        for parser in PARSERS:
            text = (
                docling_page_text(output_dir / "docling.json", page_number)
                if parser == "docling"
                else marked_page_text(output_dir / f"{parser}.txt", page_number)
            )
            lines.extend(format_result(parser, evaluate(text, anchors, phrases)))

    report = "\n".join(lines) + "\n"
    RESULTS_DIR.mkdir(exist_ok=True)
    REPORT_PATH.write_text(report)
    print(report, end="")
    print(f"Saved report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
