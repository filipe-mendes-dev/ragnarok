"""Validate the same JSON boundary as TypeScript's ingestion-input.ts."""

from typing import Literal
from uuid import UUID
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class IngestionJobInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)

    version: Literal[1]
    document_id: UUID = Field(alias="documentId")
    revision: int = Field(ge=1, le=2_147_483_647)
    user_id: str = Field(alias="userId")

    @field_validator("document_id", mode="before")
    @classmethod
    def validate_document_id(cls, value: object) -> UUID:
        # Match z.uuid(): canonical UUID versions 1-8, plus nil and max UUIDs.
        pattern = (
            r"(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-"
            r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|"
            r"00000000-0000-0000-0000-000000000000|"
            r"ffffffff-ffff-ffff-ffff-ffffffffffff)"
        )
        if not isinstance(value, str) or re.fullmatch(pattern, value) is None:
            raise ValueError("documentId must be a canonical UUID")
        return UUID(value)

    @field_validator("version", mode="before")
    @classmethod
    def validate_version_type(cls, value: object) -> object:
        # Literal equality alone would accept True or 1.0 as Python's integer 1.
        if type(value) is not int:
            raise ValueError("version must be an integer")
        return value

    @field_validator("user_id")
    @classmethod
    def validate_owner(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("userId must contain non-whitespace characters")
        return value


def parse_ingestion_job_input(body: bytes) -> IngestionJobInput:
    return IngestionJobInput.model_validate_json(body)
