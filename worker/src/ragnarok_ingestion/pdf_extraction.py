"""Extract page text without storage, database, or queue access."""

from dataclasses import dataclass
from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_PDF_PAGES = 100
MAX_EXTRACTED_CHARACTERS = 100_000


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


class PdfExtractionError(ValueError):
    """An expected document rejection with a safe public message."""


def extract_pdf_pages(pdf_bytes: bytes) -> list[ExtractedPage]:
    """Skip empty pages while preserving their original one-based numbering.

    These output limits do not bound parser execution time or memory. The caller
    must bound the downloaded bytes and isolate extraction before handling uploads.
    """
    if not isinstance(pdf_bytes, bytes):
        raise TypeError("PDF source must be bytes")

    pages: list[ExtractedPage] = []
    character_count = 0

    try:
        with BytesIO(pdf_bytes) as stream:
            reader = PdfReader(stream, strict=True)
            if reader.is_encrypted:
                raise PdfExtractionError("Encrypted PDFs are not supported.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise PdfExtractionError("PDF must contain at most 100 pages.")

            for page_number, page in enumerate(reader.pages, start=1):
                if page.get_contents() is None:
                    continue
                text = page.extract_text(extraction_mode="layout")
                character_count += len(text)
                if character_count > MAX_EXTRACTED_CHARACTERS:
                    raise PdfExtractionError("PDF text must not exceed 100,000 characters.")

                text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
                if text:
                    pages.append(ExtractedPage(page_number=page_number, text=text))
    except PdfReadError:
        raise PdfExtractionError("PDF could not be read.") from None

    if not pages:
        raise PdfExtractionError("PDF contains no extractable text. OCR is not supported.")

    return pages
