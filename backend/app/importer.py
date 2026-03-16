from __future__ import annotations

import hashlib
import shutil
from dataclasses import asdict
from pathlib import Path

from .config import DATA_DIR, PREVIEW_DIR
from .ocr import OCRService
from .parser import infer_report_date_from_relative_path, parse_page
from .repository import Repository
from .schemas import ScanSummary


class ImportService:
    def __init__(
        self,
        repository: Repository,
        ocr_service: OCRService | None = None,
        data_dir: Path | None = None,
    ):
        self.repository = repository
        self.ocr_service = ocr_service or OCRService()
        self.data_dir = data_dir or DATA_DIR

    def _pdf_files(self) -> list[Path]:
        return sorted(path for path in self.data_dir.rglob("*.pdf") if path.is_file())

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as file_handle:
            for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def scan(self) -> ScanSummary:
        scanned = 0
        skipped_unchanged = 0
        updated = 0
        removed_documents = 0
        approved_results = 0
        review_results = 0
        skipped_documents = 0
        errored_documents = 0
        pdf_files = self._pdf_files()
        relative_paths = {pdf_path.relative_to(self.data_dir.parent).as_posix() for pdf_path in pdf_files}
        removed = self.repository.delete_documents_missing_from_relative_paths(relative_paths)
        removed_documents = len(removed)

        for document in removed:
            preview_dir = PREVIEW_DIR / document["sha256"]
            if preview_dir.exists():
                shutil.rmtree(preview_dir)

        for pdf_path in pdf_files:
            scanned += 1
            relative_path = pdf_path.relative_to(self.data_dir.parent).as_posix()
            sha256 = self._sha256(pdf_path)
            existing = self.repository.get_document_by_relative_path(relative_path)
            if existing and existing["sha256"] == sha256 and existing["status"] != "error":
                skipped_unchanged += 1
                continue

            try:
                ocr_document = self.ocr_service.process(pdf_path, sha256)
                parsed_pages = [parse_page(page.text, page.page_number) for page in ocr_document.pages]

                lab_name = next((page.lab_name for page in parsed_pages if page.lab_name), None)
                report_date = next((page.report_date for page in parsed_pages if page.report_date), None)
                collected_at = next((page.collected_at for page in parsed_pages if page.collected_at), None)
                if report_date is None:
                    report_date = infer_report_date_from_relative_path(relative_path)

                results = []
                for page in parsed_pages:
                    for result in page.results:
                        serialized = asdict(result)
                        results.append(serialized)
                        if result.review_status == "approved":
                            approved_results += 1
                        else:
                            review_results += 1

                document_payload = {
                    "relative_path": relative_path,
                    "sha256": sha256,
                    "lab_name": lab_name,
                    "report_date": report_date,
                    "collected_at": collected_at,
                    "page_count": ocr_document.page_count,
                    "status": "ready",
                    "skip_reason": None,
                }

                if not results:
                    document_payload["status"] = "skipped"
                    document_payload["skip_reason"] = "No blood-test rows were parsed from OCR output."
                    skipped_documents += 1
                elif any(result["review_status"] == "needs_review" for result in results):
                    document_payload["status"] = "needs_review"

                self.repository.replace_document(document_payload, results)
                updated += 1
            except Exception as error:  # pragma: no cover - exercised in manual runs
                errored_documents += 1
                self.repository.replace_document(
                    {
                        "relative_path": relative_path,
                        "sha256": sha256,
                        "lab_name": None,
                        "report_date": None,
                        "collected_at": None,
                        "page_count": 0,
                        "status": "error",
                        "skip_reason": str(error),
                    },
                    [],
                )

        return ScanSummary(
            scanned=scanned,
            skipped_unchanged=skipped_unchanged,
            updated=updated,
            removed_documents=removed_documents,
            approved_results=approved_results,
            review_results=review_results,
            skipped_documents=skipped_documents,
            errored_documents=errored_documents,
        )
