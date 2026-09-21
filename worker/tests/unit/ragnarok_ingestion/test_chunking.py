import unittest

from ragnarok_ingestion.chunking import ChunkingSettings, TextChunk, chunk_text


class ChunkTextTests(unittest.TestCase):
    def test_short_document_stays_in_one_chunk(self) -> None:
        self.assertEqual(chunk_text("  A short note.  "), [TextChunk(0, "A short note.")])

    def test_paragraphs_remain_whole_when_they_fit(self) -> None:
        chunks = chunk_text("alpha\n\nbravo\n\ncharlie", ChunkingSettings(8, 0))
        self.assertEqual(
            chunks,
            [TextChunk(0, "alpha"), TextChunk(1, "bravo"), TextChunk(2, "charlie")],
        )

    def test_oversized_word_splits_with_overlap_without_losing_text(self) -> None:
        chunks = chunk_text("abcdefghij", ChunkingSettings(4, 1))
        self.assertEqual(
            chunks, [TextChunk(0, "abcd"), TextChunk(1, "defg"), TextChunk(2, "ghij")]
        )

    def test_repeated_passages_are_not_deduplicated(self) -> None:
        chunks = chunk_text("same\n\nsame\n\nsame", ChunkingSettings(8, 0))
        self.assertEqual(
            chunks, [TextChunk(0, "same"), TextChunk(1, "same"), TextChunk(2, "same")]
        )

    def test_repeated_text_is_preserved_at_the_character_limit(self) -> None:
        chunks = chunk_text("same\n\nsame\n\nsame", ChunkingSettings(4, 0))
        self.assertEqual("".join(chunk.text for chunk in chunks), "samesamesame")
        self.assertTrue(all(0 < len(chunk.text) <= 4 for chunk in chunks))
        self.assertEqual([chunk.ordinal for chunk in chunks], list(range(len(chunks))))

    def test_unicode_size_counts_characters_instead_of_utf8_bytes(self) -> None:
        chunks = chunk_text("é漢字ñø", ChunkingSettings(3, 0))
        self.assertEqual(chunks, [TextChunk(0, "é漢字"), TextChunk(1, "ñø")])

    def test_line_endings_produce_the_same_chunks(self) -> None:
        settings = ChunkingSettings(8, 0)
        expected = [TextChunk(0, "alpha"), TextChunk(1, "bravo")]
        for separator in ("\n\n", "\r\n\r\n", "\r\r"):
            with self.subTest(separator=separator):
                self.assertEqual(chunk_text(f"alpha{separator}bravo", settings), expected)

    def test_repeated_execution_is_deterministic_and_respects_size(self) -> None:
        source = "First paragraph has several words.\n\nSecond paragraph is longer."
        settings = ChunkingSettings(20, 5)
        first = chunk_text(source, settings)
        self.assertEqual(first, chunk_text(source, settings))
        self.assertTrue(first)
        self.assertTrue(all(0 < len(chunk.text) <= 20 for chunk in first))
        self.assertEqual([chunk.ordinal for chunk in first], list(range(len(first))))

    def test_blank_document_is_rejected(self) -> None:
        for text in ("", " \t\r\n "):
            with self.subTest(text=text):
                with self.assertRaisesRegex(ValueError, "non-whitespace"):
                    chunk_text(text)


class ChunkingSettingsTests(unittest.TestCase):
    def test_invalid_size_or_overlap_is_rejected(self) -> None:
        for size, overlap in ((0, 0), (-1, 0), (10, -1), (10, 10), (10, 11)):
            with self.subTest(size=size, overlap=overlap):
                with self.assertRaises(ValueError):
                    ChunkingSettings(size, overlap)
