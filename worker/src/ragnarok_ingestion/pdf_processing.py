"""Run one PDF's download and extraction in one bounded child."""

from dataclasses import asdict
import json
import logging
import subprocess
import sys

from pydantic import TypeAdapter

from ragnarok_ingestion.diagnostics import safe_error_details
from ragnarok_ingestion.pdf_extraction import ExtractedPage, PdfExtractionError, extract_pdf_pages
from ragnarok_ingestion.s3_source import PdfDownloadError, PdfSourceError, load_pdf_from_s3

PDF_PROCESSING_TIMEOUT_SECONDS = 30
logger = logging.getLogger(__name__)


def process_pdf(storage_key: str) -> list[ExtractedPage]:
    try:
        result = subprocess.run(
            [sys.executable, "-m", "ragnarok_ingestion.pdf_processing"],
            input=storage_key.encode("utf-8"), capture_output=True,
            timeout=PDF_PROCESSING_TIMEOUT_SECONDS, check=False,
        )
    except subprocess.TimeoutExpired:
        logger.error("event=pdf_child_timeout timeout_seconds=%s", PDF_PROCESSING_TIMEOUT_SECONDS)
        raise PdfExtractionError("PDF processing exceeded the 30-second limit.") from None
    if result.returncode == 2:
        raise PdfExtractionError(TypeAdapter(str).validate_json(result.stdout, strict=True))
    if result.returncode != 0:
        try:
            diagnostic = TypeAdapter(str).validate_json(result.stdout, strict=True)
        except ValueError:
            diagnostic = "Child exited without diagnostic details"
        logger.error("event=pdf_child_failed exit_code=%s error=%s", result.returncode, diagnostic)
    if result.returncode == 3:
        raise PdfDownloadError("PDF download failed.")
    if result.returncode != 0:
        raise RuntimeError("PDF processing child failed")
    return TypeAdapter(list[ExtractedPage]).validate_json(result.stdout, strict=True)


def main() -> None:
    storage_key = sys.stdin.buffer.read().decode("utf-8")
    try:
        pdf_bytes = load_pdf_from_s3(storage_key)
    except PdfSourceError as error:
        print(json.dumps(str(error)))
        raise SystemExit(2) from None
    except Exception as error:
        print(json.dumps(safe_error_details(error)))
        raise SystemExit(3) from None

    try:
        pages = extract_pdf_pages(pdf_bytes)
    except PdfExtractionError as error:
        print(json.dumps(str(error)))
        raise SystemExit(2) from None
    except Exception as error:
        print(json.dumps(safe_error_details(error)))
        raise SystemExit(1) from None
    print(json.dumps([asdict(page) for page in pages]))


if __name__ == "__main__":
    main()
