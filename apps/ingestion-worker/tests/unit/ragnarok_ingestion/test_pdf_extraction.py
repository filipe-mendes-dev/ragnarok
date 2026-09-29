from pathlib import Path

import pymupdf
import pytest

from ragnarok_ingestion.pdf_extraction import (
    ExtractedPage, PdfExtractionError, extract_pdf_pages,
)

PDF_FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "pdf"


def test_preserves_original_page_numbers_when_skipping_blank_pages() -> None:
    source = (PDF_FIXTURES / "three-pages.pdf").read_bytes()
    assert extract_pdf_pages(source) == [
        ExtractedPage(page_number=1, text="Alpha beta gamma delta"),
        ExtractedPage(page_number=3, text="One two three four"),
    ]


@pytest.mark.parametrize("filename, message", [
    ("blank.pdf", "PDF contains no extractable text. OCR is not supported."),
    ("encrypted.pdf", "Encrypted PDFs are not supported."),
])
def test_rejects_unsupported_documents(filename: str, message: str) -> None:
    with pytest.raises(PdfExtractionError) as error:
        extract_pdf_pages((PDF_FIXTURES / filename).read_bytes())
    assert str(error.value) == message


def test_rejects_malformed_bytes() -> None:
    with pytest.raises(PdfExtractionError, match="PDF could not be read"):
        extract_pdf_pages(b"not a PDF")


def test_default_accepts_more_than_old_page_and_character_limits() -> None:
    with pymupdf.open() as document:
        for _ in range(101):
            page = document.new_page()
            for line in range(60):
                page.insert_text((72, 72 + line * 11), "Alpha beta gamma delta", fontsize=9)
        pages = extract_pdf_pages(document.tobytes())
    assert len(pages) == 101
    assert sum(len(page.text) for page in pages) > 100_000


def test_optional_page_limit_reports_actual_and_allowed_counts() -> None:
    with pytest.raises(PdfExtractionError, match="PDF has 3 pages; the configured limit is 2 pages"):
        extract_pdf_pages((PDF_FIXTURES / "three-pages.pdf").read_bytes(), max_pages=2)
    assert len(extract_pdf_pages((PDF_FIXTURES / "three-pages.pdf").read_bytes(), max_pages=3)) == 2


def test_optional_character_limit_reports_count_and_page() -> None:
    with pytest.raises(PdfExtractionError, match=r"1-character limit \(observed \d+ characters by page 1\)"):
        extract_pdf_pages((PDF_FIXTURES / "three-pages.pdf").read_bytes(), max_characters=1)


@pytest.mark.parametrize("limit", [0, -1, True])
def test_optional_limits_must_be_positive_integers(limit: int) -> None:
    with pytest.raises(ValueError, match="max_pages must be a positive integer"):
        extract_pdf_pages((PDF_FIXTURES / "three-pages.pdf").read_bytes(), max_pages=limit)
