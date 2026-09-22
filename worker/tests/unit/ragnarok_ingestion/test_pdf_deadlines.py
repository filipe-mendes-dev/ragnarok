import os
from pathlib import Path
import sys
import json
from io import BytesIO, TextIOWrapper

import pytest

from ragnarok_ingestion import pdf_processing
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
    with pytest.raises(PdfExtractionError, match="2-second limit"):
        pdf_processing.process_pdf("owned/source.pdf")

    pid = int(pid_file.read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_child_applies_configured_page_limit(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    def load_fixture(storage_key: str) -> bytes:
        return (Path(__file__).resolve().parents[2] / "fixtures" / "pdf" / "three-pages.pdf").read_bytes()

    monkeypatch.setattr(pdf_processing, "load_pdf_from_s3", load_fixture)
    monkeypatch.setenv("PDF_MAX_PAGES", "2")
    monkeypatch.delenv("PDF_MAX_EXTRACTED_CHARACTERS", raising=False)
    with TextIOWrapper(BytesIO(b"private-object-key")) as stdin:
        monkeypatch.setattr(sys, "stdin", stdin)
        with pytest.raises(SystemExit) as error:
            pdf_processing.main()
    assert error.value.code == 2
    assert json.loads(capsys.readouterr().out) == "PDF has 3 pages; the configured limit is 2 pages."
