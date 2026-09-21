import json

from botocore.exceptions import ClientError
import pytest

from ragnarok_ingestion.chunking import ChunkingSettings
from ragnarok_ingestion.diagnostics import safe_error_details
from ragnarok_ingestion.pdf_processing import process_pdf
from ragnarok_ingestion.s3_source import PdfDownloadError


def test_exception_details_keep_locations_without_secret_messages() -> None:
    try:
        raise RuntimeError("secret-connection-url")
    except RuntimeError as error:
        details = json.loads(safe_error_details(error))

    assert details["type"] == "RuntimeError"
    assert "test_diagnostics.py:" in details["frames"][-1]
    assert "secret-connection-url" not in json.dumps(details)


def test_storage_details_keep_code_without_response_contents() -> None:
    error = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "secret-object-key"}},
        "GetObject",
    )
    details = safe_error_details(error)
    assert json.loads(details)["storage_code"] == "AccessDenied"
    assert "secret-object-key" not in details


def test_child_reports_missing_configuration_without_object_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.delenv("S3_FORCE_PATH_STYLE", raising=False)
    monkeypatch.setenv("PDF_MAX_UPLOAD_SIZE_BYTES", "10485760")

    with pytest.raises(PdfDownloadError):
        process_pdf("private-object-key", ChunkingSettings())

    assert "event=pdf_child_failed" in caplog.text
    assert "S3_FORCE_PATH_STYLE" in caplog.text
    assert "KeyError" in caplog.text
    assert "private-object-key" not in caplog.text
