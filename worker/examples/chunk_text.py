"""From worker/: uv run python examples/chunk_text.py"""

from ragnarok_ingestion.chunking import CHUNKING_METHOD, ChunkingSettings, chunk_text

SAMPLE_TEXT = """Uploads

RAGnarok stores original PDFs in object storage. Submitted text stays in PostgreSQL.

Processing

The worker extracts readable text and splits it into chunks. Each chunk keeps its
position so the application can present passages in their original order.

Retries

An interrupted document can be processed again. Saving the same revision twice
must not create duplicate persisted chunks.
"""


def main() -> None:
    for size in (100, 180):
        settings = ChunkingSettings(chunk_size=size, chunk_overlap=20)
        print(f"\n{CHUNKING_METHOD}: {settings}")
        for chunk in chunk_text(SAMPLE_TEXT, settings):
            print(f"\nChunk {chunk.ordinal}, {len(chunk.text)} characters")
            print(chunk.text)


if __name__ == "__main__":
    main()
