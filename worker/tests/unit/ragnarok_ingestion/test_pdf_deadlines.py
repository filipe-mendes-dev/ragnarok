import os
from pathlib import Path
import sys

import pytest

from ragnarok_ingestion import pdf_processing
from ragnarok_ingestion.chunking import ChunkingSettings
from ragnarok_ingestion.pdf_extraction import PdfExtractionError


def test_deadline_terminates_and_reaps_the_child(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    executable = tmp_path / "stalled-worker"
    pid_file = tmp_path / "child.pid"
    executable.write_text('#!/bin/sh\necho $$ > "$TEST_CHILD_PID_FILE"\nexec sleep 60\n')
    executable.chmod(0o700)
    monkeypatch.setenv("TEST_CHILD_PID_FILE", str(pid_file))
    monkeypatch.setattr(sys, "executable", str(executable))

    monkeypatch.setattr(pdf_processing, "PDF_PROCESSING_TIMEOUT_SECONDS", 2)
    with pytest.raises(PdfExtractionError, match="30-second limit"):
        pdf_processing.process_pdf("owned/source.pdf", ChunkingSettings())

    pid = int(pid_file.read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)
