from pathlib import Path

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
