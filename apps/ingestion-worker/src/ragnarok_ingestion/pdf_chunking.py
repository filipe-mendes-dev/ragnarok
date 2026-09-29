"""Extract and split PDF pages, preserving citation metadata."""

from ragnarok_ingestion.chunking import ChunkingSettings, TextChunk, chunk_text
from ragnarok_ingestion.pdf_extraction import extract_pdf_pages


def chunk_pdf(
    pdf_bytes: bytes,
    settings: ChunkingSettings = ChunkingSettings(),
) -> list[TextChunk]:
    chunks: list[TextChunk] = []
    for page in extract_pdf_pages(pdf_bytes):
        for chunk in chunk_text(page.text, settings):
            chunks.append(TextChunk(
                ordinal=len(chunks),
                text=chunk.text,
                page_number=page.page_number,
            ))
    return chunks
