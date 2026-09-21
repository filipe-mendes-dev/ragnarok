"""Run one PDF's download, extraction, and chunking in one bounded child."""

from dataclasses import asdict
import json
import subprocess
import sys

from pydantic import TypeAdapter

from ragnarok_ingestion.chunking import ChunkingSettings, TextChunk
from ragnarok_ingestion.pdf_chunking import chunk_pdf
from ragnarok_ingestion.pdf_extraction import PdfExtractionError
from ragnarok_ingestion.s3_source import PdfDownloadError, PdfSourceError, load_pdf_from_s3

PDF_PROCESSING_TIMEOUT_SECONDS = 30


def process_pdf(
    storage_key: str, settings: ChunkingSettings,
) -> list[TextChunk]:
    try:
        result = subprocess.run(
            [sys.executable, "-m", "ragnarok_ingestion.pdf_processing",
             str(settings.chunk_size), str(settings.chunk_overlap)],
            input=storage_key.encode("utf-8"), capture_output=True,
            timeout=PDF_PROCESSING_TIMEOUT_SECONDS, check=False,
        )
    except subprocess.TimeoutExpired:
        raise PdfExtractionError("PDF processing exceeded the 30-second limit.") from None
    if result.returncode == 2:
        raise PdfExtractionError(TypeAdapter(str).validate_json(result.stdout, strict=True))
    if result.returncode == 3:
        raise PdfDownloadError("PDF download failed.")
    if result.returncode != 0:
        raise RuntimeError("PDF processing child failed")
    return TypeAdapter(list[TextChunk]).validate_json(result.stdout, strict=True)


def main() -> None:
    settings = ChunkingSettings(int(sys.argv[1]), int(sys.argv[2]))
    storage_key = sys.stdin.buffer.read().decode("utf-8")
    try:
        pdf_bytes = load_pdf_from_s3(storage_key)
    except PdfSourceError as error:
        print(json.dumps(str(error)))
        raise SystemExit(2) from None
    except Exception:
        raise SystemExit(3) from None

    try:
        chunks = chunk_pdf(pdf_bytes, settings)
    except PdfExtractionError as error:
        print(json.dumps(str(error)))
        raise SystemExit(2) from None
    except Exception:
        raise SystemExit(1) from None
    print(json.dumps([asdict(chunk) for chunk in chunks]))


if __name__ == "__main__":
    main()
