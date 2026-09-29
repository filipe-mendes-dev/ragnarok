"""Compare complete PDF parser outputs before ingestion or chunking."""

from collections.abc import Callable
from dataclasses import dataclass
import json
from pathlib import Path
from time import perf_counter

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
import pymupdf
from pypdf import PdfReader


BENCHMARK_DIR = Path(__file__).resolve().parent
PDFS = [
    BENCHMARK_DIR / "corpus/full/1504.02490.pdf",
    BENCHMARK_DIR / "corpus/full/botswana-constitution.pdf",
    BENCHMARK_DIR / "corpus/full/2025-HP-Regras_Jogo_Regulamento_Tecnico.pdf",
]
OUTPUT_DIR = BENCHMARK_DIR / "runs"


@dataclass(frozen=True)
class Extraction:
    text: str
    raw_structure: object
    page_count: int
    sorted_text: str | None = None


def format_pages(pages: list[tuple[int, str]]) -> str:
    return "\n\n".join(f"--- page {number} ---\n{text}" for number, text in pages) + "\n"


def extract_with_pypdf(path: Path) -> Extraction:
    reader = PdfReader(path, strict=True)
    pages: list[tuple[int, str]] = []
    for page_number, page in enumerate(reader.pages, start=1):
        if page.get_contents() is None:
            continue
        text = page.extract_text(extraction_mode="layout")
        text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
        if text:
            pages.append((page_number, text))
    return Extraction(
        text=format_pages(pages),
        raw_structure={
            "pages": [{"page_number": number, "text": text} for number, text in pages]
        },
        page_count=len(pages),
    )


def extract_with_pymupdf(path: Path) -> Extraction:
    sorted_pages: list[tuple[int, str]] = []
    original_pages: list[tuple[int, str]] = []
    page_details: list[dict[str, object]] = []
    text_flags = pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES

    with pymupdf.open(path) as document:
        for number, page in enumerate(document, start=1):
            sorted_pages.append((number, page.get_text("text", sort=True)))
            original_pages.append((number, page.get_text("text", sort=False)))
            page_details.append({
                "page_number": number,
                "dict": page.get_text("dict", flags=text_flags, sort=False),
                "words": page.get_text("words", sort=False),
            })

    return Extraction(
        text=format_pages(original_pages),
        sorted_text=format_pages(sorted_pages),
        raw_structure={"pages": page_details},
        page_count=len(page_details),
    )


def make_docling_extractor() -> Callable[[Path], Extraction]:
    options = PdfPipelineOptions(do_ocr=False, do_table_structure=False)
    converter = DocumentConverter(format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=options),
    })
    converter.initialize_pipeline(InputFormat.PDF)

    def extract_with_docling(path: Path) -> Extraction:
        result = converter.convert(path)
        if result.document is None:
            raise RuntimeError(f"Docling returned no document: {result.status}")
        document = result.document
        markdown = document.export_to_markdown()
        return Extraction(
            text=markdown,
            raw_structure=document.export_to_dict(),
            page_count=len(document.pages),
        )

    return extract_with_docling


def compare_one(
    name: str,
    extractor: Callable[[Path], Extraction],
    path: Path,
    output_dir: Path,
) -> None:
    started = perf_counter()
    extraction = extractor(path)
    duration_seconds = perf_counter() - started

    (output_dir / f"{name}.txt").write_text(extraction.text)
    (output_dir / f"{name}.json").write_text(
        json.dumps(extraction.raw_structure, indent=2, ensure_ascii=False) + "\n"
    )
    if extraction.sorted_text is not None:
        (output_dir / f"{name}-sorted.txt").write_text(extraction.sorted_text)

    print(f"{path.name} | {name}: {duration_seconds:.2f}s, {extraction.page_count} pages")


def main() -> None:
    for path in PDFS:
        if not path.is_file():
            raise FileNotFoundError(f"Benchmark PDF not found: {path}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    setup_started = perf_counter()
    docling_extractor = make_docling_extractor()
    print(f"Docling setup: {perf_counter() - setup_started:.2f}s")

    parsers: list[tuple[str, Callable[[Path], Extraction]]] = [
        ("pypdf", extract_with_pypdf),
        ("pymupdf", extract_with_pymupdf),
        ("docling", docling_extractor),
    ]
    for path in PDFS:
        destination = OUTPUT_DIR / path.stem
        destination.mkdir(exist_ok=True)
        for name, extractor in parsers:
            compare_one(name, extractor, path, destination)


if __name__ == "__main__":
    main()
