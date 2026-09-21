"""Exception context without messages, source lines, locals, or connection URLs."""

import json
from pathlib import Path
import re
import traceback

from botocore.exceptions import ClientError
from psycopg import Error as PostgresError

ENVIRONMENT_KEYS = frozenset({
    "DATABASE_URL", "RABBITMQ_URL", "INGESTION_QUEUE_NAME",
    "INGESTION_REJECTED_QUEUE_NAME", "S3_ENDPOINT", "S3_REGION", "S3_BUCKET",
    "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE",
    "PDF_MAX_UPLOAD_SIZE_BYTES",
})


def safe_error_details(error: Exception) -> str:
    details: dict[str, str | list[str]] = {
        "type": type(error).__name__,
        "frames": [
            f"{Path(frame.f_code.co_filename).name}:{line}:{frame.f_code.co_name}"
            for frame, line in traceback.walk_tb(error.__traceback__)
        ][-6:],
    }
    if isinstance(error, KeyError) and error.args:
        key = error.args[0]
        if isinstance(key, str) and key in ENVIRONMENT_KEYS:
            details["missing_environment_key"] = key
    if isinstance(error, PostgresError) and error.sqlstate:
        details["sqlstate"] = error.sqlstate
    if isinstance(error, ClientError):
        code = error.response.get("Error", {}).get("Code")
        if isinstance(code, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", code):
            details["storage_code"] = code
    return json.dumps(details)
