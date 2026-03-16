from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ReviewStatus = Literal["approved", "needs_review"]
DocumentStatus = Literal["ready", "needs_review", "skipped", "error"]


class ScanSummary(BaseModel):
    scanned: int
    skipped_unchanged: int
    updated: int
    removed_documents: int
    approved_results: int
    review_results: int
    skipped_documents: int
    errored_documents: int


class AnalyteOption(BaseModel):
    filter_key: str
    analyte_key: str
    analyte_display: str
    unit: str
    result_count: int


class ResultListItem(BaseModel):
    id: int
    document_id: int
    page_number: int
    original_label: str
    analyte_key: str | None
    analyte_display: str | None
    normalization_note: str | None
    value: float | None
    original_unit: str | None
    unit: str | None
    reference_low: float | None
    reference_high: float | None
    flag: str | None
    review_status: ReviewStatus
    raw_excerpt: str
    relative_path: str
    lab_name: str | None
    report_date: str | None
    collected_at: str | None


class ResultDetail(ResultListItem):
    document_status: DocumentStatus
    skip_reason: str | None
    preview_url: str
    file_url: str


class ReviewUpdate(BaseModel):
    original_label: str | None = None
    analyte_display: str | None = None
    value: float | None = None
    original_unit: str | None = None
    unit: str | None = None
    reference_low: float | None = None
    reference_high: float | None = None
    flag: str | None = Field(default=None, max_length=1)
    review_status: ReviewStatus | None = None


class DocumentSummary(BaseModel):
    id: int
    relative_path: str
    sha256: str
    lab_name: str | None
    report_date: str | None
    collected_at: str | None
    page_count: int
    status: DocumentStatus
    skip_reason: str | None


class ReviewQueue(BaseModel):
    results: list[ResultListItem]
    skipped_documents: list[DocumentSummary]
