"""Download an already-authorized object key from the configured S3 bucket."""

from contextlib import closing
import os

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from botocore.response import StreamingBody


class PdfSourceError(ValueError):
    """A permanent source problem with a safe document-facing message."""


def load_pdf_from_s3(storage_key: str) -> bytes:
    max_bytes = int(os.environ.get("PDF_MAX_UPLOAD_SIZE_BYTES", "10485760"))
    if max_bytes <= 0:
        raise ValueError("PDF_MAX_UPLOAD_SIZE_BYTES must be positive")
    path_style = os.environ["S3_FORCE_PATH_STYLE"]
    if path_style not in ("true", "false"):
        raise ValueError("S3_FORCE_PATH_STYLE must be true or false")

    config = Config(
        connect_timeout=5,
        read_timeout=10,
        retries={"mode": "standard", "total_max_attempts": 2},
        s3={"addressing_style": "path" if path_style == "true" else "virtual"},
    )
    with closing(boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        region_name=os.environ["S3_REGION"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
        config=config,
    )) as client:
        try:
            response = client.get_object(Bucket=os.environ["S3_BUCKET"], Key=storage_key)
        except ClientError as error:
            if error.response["Error"]["Code"] in ("NoSuchKey", "404"):
                raise PdfSourceError("The original PDF could not be found.") from None
            raise

        body: StreamingBody = response["Body"]
        with closing(body):
            if response["ContentLength"] > max_bytes:
                raise PdfSourceError("PDF exceeds the configured upload size limit.")
            data = body.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise PdfSourceError("PDF exceeds the configured upload size limit.")
            return data
