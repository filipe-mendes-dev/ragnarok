"""Extract page text without storage, database, or queue access."""

from dataclasses import dataclass
from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError

@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


class PdfExtractionError(ValueError):
    """An expected document rejection with a safe public message."""


def extract_pdf_pages(
    pdf_bytes: bytes, *, max_pages: int | None = None,
    max_characters: int | None = None,
) -> list[ExtractedPage]:
    """Skip empty pages while preserving their original one-based numbering.

    Optional policy limits do not bound parser execution time or memory. The caller
    must bound the downloaded bytes and isolate extraction before handling uploads.
    """
    if not isinstance(pdf_bytes, bytes):
        raise TypeError("PDF source must be bytes")
    for name, value in (("max_pages", max_pages), ("max_characters", max_characters)):
        if value is not None and (type(value) is not int or value <= 0):
            raise ValueError(f"{name} must be a positive integer")

    pages: list[ExtractedPage] = []
    character_count = 0

    try:
        with BytesIO(pdf_bytes) as stream:
            reader = PdfReader(stream, strict=True)
            if reader.is_encrypted:
                raise PdfExtractionError("Encrypted PDFs are not supported.")
            if max_pages is not None and len(reader.pages) > max_pages:
                raise PdfExtractionError(
                    f"PDF has {len(reader.pages):,} pages; the configured limit is {max_pages:,} pages."
                )

            for page_number, page in enumerate(reader.pages, start=1):
                if page.get_contents() is None:
                    continue
                text = page.extract_text(extraction_mode="layout")
                character_count += len(text)
                if max_characters is not None and character_count > max_characters:
                    raise PdfExtractionError(
                        f"PDF text exceeds the {max_characters:,}-character limit "
                        f"(observed {character_count:,} characters by page {page_number})."
                    )

                text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
                if text:
                    pages.append(ExtractedPage(page_number=page_number, text=text))
    except PdfReadError:
        raise PdfExtractionError("PDF could not be read.") from None

    if not pages:
        raise PdfExtractionError("PDF contains no extractable text. OCR is not supported.")

    return pages
