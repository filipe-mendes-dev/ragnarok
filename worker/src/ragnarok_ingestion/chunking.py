"""Deterministic text splitting without database or queue access."""

from dataclasses import dataclass
from collections.abc import Callable

from langchain_text_splitters import RecursiveCharacterTextSplitter

CHUNKING_METHOD = "recursive-character-v1"


@dataclass(frozen=True)
class ChunkingSettings:
    """Sizes use Unicode code points unless the caller supplies a token counter."""

    chunk_size: int = 1_000
    chunk_overlap: int = 150

    def __post_init__(self) -> None:
        if type(self.chunk_size) is not int or self.chunk_size <= 0:
            raise ValueError("chunk_size must be a positive integer")
        if (
            type(self.chunk_overlap) is not int
            or not 0 <= self.chunk_overlap < self.chunk_size
        ):
            raise ValueError("chunk_overlap must be an integer from 0 to chunk_size - 1")


@dataclass(frozen=True)
class TextChunk:
    """A zero-based position and its text within one split source."""

    ordinal: int
    text: str
    page_number: int | None = None


def chunk_text(
    text: str,
    settings: ChunkingSettings = ChunkingSettings(),
    *,
    length_function: Callable[[str], int] = len,
) -> list[TextChunk]:
    """Normalize line endings, then prefer paragraphs, lines, and word boundaries.

    Overlap is a target, not an exact guarantee at every boundary. Whitespace
    around chunks is stripped. An oversized word falls back to character splits.
    This function receives extracted text; it does not parse PDFs.
    """
    if not isinstance(text, str):
        raise TypeError("text must be a string")

    normalized_text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized_text:
        raise ValueError("Document text must contain non-whitespace characters")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        length_function=length_function,
        separators=["\n\n", "\n", " ", ""],
        keep_separator=True,
        is_separator_regex=False,
        strip_whitespace=True,
    )

    return [
        TextChunk(ordinal=ordinal, text=chunk)
        for ordinal, chunk in enumerate(splitter.split_text(normalized_text))
    ]
