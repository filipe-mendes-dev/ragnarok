import json

from pydantic import ValidationError
import pytest

from ragnarok_ingestion.ingestion_input import parse_ingestion_job_input


@pytest.fixture
def message() -> dict[str, object]:
    return {
        "version": 1,
        "documentId": "c186bf9b-4ac2-4a43-8e1b-62d2d9963cab",
        "revision": 2,
        "userId": "owner",
    }


def test_accepts_typescript_field_names(message: dict[str, object]) -> None:
    job = parse_ingestion_job_input(json.dumps(message).encode())
    assert str(job.document_id) == message["documentId"]
    assert job.user_id == "owner"
    assert job.revision == 2


@pytest.mark.parametrize("field,value", [
    ("version", 2), ("version", True), ("version", "1"),
    ("revision", "2"), ("revision", True), ("revision", 0),
    ("revision", 2_147_483_648), ("documentId", "invalid"),
    ("userId", "  "), ("userId", 42), ("sourceText", "private source"),
])
def test_rejects_invalid_messages(
    message: dict[str, object], field: str, value: object
) -> None:
    message[field] = value
    with pytest.raises(ValidationError):
        parse_ingestion_job_input(json.dumps(message).encode())


@pytest.mark.parametrize("body", [b"not-json", b"{}", b"[]", b"null"])
def test_rejects_missing_or_malformed_inputs(body: bytes) -> None:
    with pytest.raises(ValidationError):
        parse_ingestion_job_input(body)
