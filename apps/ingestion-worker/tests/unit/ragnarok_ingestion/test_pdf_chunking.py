from pathlib import Path

from ragnarok_ingestion.chunking import ChunkingSettings, TextChunk
from ragnarok_ingestion.pdf_chunking import chunk_pdf


def test_chunks_real_pdf_with_global_ordinals_and_original_page_numbers() -> None:
    source = (
        Path(__file__).resolve().parents[2] / "fixtures" / "pdf" / "three-pages.pdf"
    ).read_bytes()
    settings = ChunkingSettings(chunk_size=10, chunk_overlap=0)

    chunks = chunk_pdf(source, settings)

    assert chunks == [
        TextChunk(ordinal=0, text="Alpha beta", page_number=1),
        TextChunk(ordinal=1, text="gamma", page_number=1),
        TextChunk(ordinal=2, text="delta", page_number=1),
        TextChunk(ordinal=3, text="One two", page_number=3),
        TextChunk(ordinal=4, text="three", page_number=3),
        TextChunk(ordinal=5, text="four", page_number=3),
    ]
    assert chunk_pdf(source, settings) == chunks
