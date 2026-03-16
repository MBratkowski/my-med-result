from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, UTC
from pathlib import Path
from typing import Iterator

from .database import get_connection, init_db
from .normalization import normalize_result
from .parser import ParsedResult, infer_report_date_from_relative_path, parse_results, result_numeric_score
from .schemas import ReviewUpdate


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Repository:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path
        init_db(db_path)
        self.backfill_documents()
        self.backfill_results()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = get_connection(self.db_path)
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def get_document_by_relative_path(self, relative_path: str) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(
                "SELECT * FROM documents WHERE relative_path = ?",
                (relative_path,),
            ).fetchone()

    def delete_documents_missing_from_relative_paths(self, relative_paths: set[str]) -> list[sqlite3.Row]:
        with self.connection() as connection:
            if relative_paths:
                placeholders = ", ".join("?" for _ in relative_paths)
                stale_documents = connection.execute(
                    f"SELECT * FROM documents WHERE relative_path NOT IN ({placeholders})",
                    tuple(sorted(relative_paths)),
                ).fetchall()
            else:
                stale_documents = connection.execute("SELECT * FROM documents").fetchall()

            if stale_documents:
                connection.executemany(
                    "DELETE FROM documents WHERE id = ?",
                    [(document["id"],) for document in stale_documents],
                )

            return stale_documents

    def replace_document(self, document: dict, results: list[dict]) -> int:
        timestamp = utc_now()
        with self.connection() as connection:
            existing = connection.execute(
                "SELECT id FROM documents WHERE relative_path = ?",
                (document["relative_path"],),
            ).fetchone()
            if existing:
                connection.execute("DELETE FROM documents WHERE id = ?", (existing["id"],))

            cursor = connection.execute(
                """
                INSERT INTO documents (
                  relative_path, sha256, lab_name, report_date, collected_at,
                  page_count, status, skip_reason, last_scanned_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document["relative_path"],
                    document["sha256"],
                    document.get("lab_name"),
                    document.get("report_date"),
                    document.get("collected_at"),
                    document.get("page_count", 0),
                    document["status"],
                    document.get("skip_reason"),
                    timestamp,
                    timestamp,
                    timestamp,
                ),
            )
            document_id = int(cursor.lastrowid)
            for result in results:
                connection.execute(
                    """
                INSERT INTO lab_results (
                      document_id, page_number, original_label, analyte_key, analyte_display,
                      normalization_note, value, original_unit, unit, reference_low, reference_high, flag, review_status, raw_excerpt,
                      created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        document_id,
                        result["page_number"],
                        result["original_label"],
                        result.get("analyte_key"),
                        result.get("analyte_display"),
                        result.get("normalization_note"),
                        result.get("value"),
                        result.get("original_unit"),
                        result.get("unit"),
                        result.get("reference_low"),
                        result.get("reference_high"),
                        result.get("flag"),
                        result["review_status"],
                        result["raw_excerpt"],
                        timestamp,
                        timestamp,
                    ),
                )

            return document_id

    def _refresh_document_status(
        self,
        connection: sqlite3.Connection,
        document_id: int,
        timestamp: str,
    ) -> None:
        summary = connection.execute(
            """
            SELECT
              COUNT(*) AS total_count,
              SUM(CASE WHEN review_status = 'needs_review' THEN 1 ELSE 0 END) AS review_count
            FROM lab_results
            WHERE document_id = ?
            """,
            (document_id,),
        ).fetchone()

        if summary["total_count"] == 0:
            return

        status = "ready"
        if summary["review_count"] > 0:
            status = "needs_review"

        connection.execute(
            "UPDATE documents SET status = ?, updated_at = ? WHERE id = ?",
            (status, timestamp, document_id),
        )

    def _repair_result_from_excerpt(self, row: sqlite3.Row) -> ParsedResult | None:
        raw_excerpt = row["raw_excerpt"]
        reparsed_results = parse_results(raw_excerpt, int(row["page_number"]))
        if len(reparsed_results) != 1:
            return None

        reparsed = reparsed_results[0]
        current_score = result_numeric_score(
            value=row["value"],
            reference_low=row["reference_low"],
            reference_high=row["reference_high"],
            flag=row["flag"],
        )
        reparsed_score = result_numeric_score(
            value=reparsed.value,
            reference_low=reparsed.reference_low,
            reference_high=reparsed.reference_high,
            flag=reparsed.flag,
        )

        changed = (
            reparsed.original_label != row["original_label"]
            or reparsed.value != row["value"]
            or reparsed.original_unit != row["original_unit"]
            or reparsed.unit != row["unit"]
            or reparsed.reference_low != row["reference_low"]
            or reparsed.reference_high != row["reference_high"]
            or reparsed.flag != row["flag"]
        )
        if not changed:
            return None

        if reparsed_score >= current_score + 2.0:
            return reparsed
        return None

    def backfill_documents(self) -> None:
        timestamp = utc_now()
        with self.connection() as connection:
            rows = connection.execute(
                """
                SELECT id, relative_path, report_date
                FROM documents
                """
            ).fetchall()

            updates: list[tuple[str, str, int]] = []
            for row in rows:
                if row["report_date"]:
                    continue
                inferred_report_date = infer_report_date_from_relative_path(row["relative_path"])
                if inferred_report_date:
                    updates.append((inferred_report_date, timestamp, int(row["id"])))

            if updates:
                connection.executemany(
                    """
                    UPDATE documents
                    SET report_date = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    updates,
                )

    def backfill_results(self) -> None:
        timestamp = utc_now()
        with self.connection() as connection:
            rows = connection.execute(
                """
                SELECT
                  id,
                  document_id,
                  page_number,
                  original_label,
                  analyte_key,
                  analyte_display,
                  original_unit,
                  unit,
                  reference_low,
                  reference_high,
                  value,
                  flag,
                  review_status,
                  normalization_note,
                  raw_excerpt
                FROM lab_results
                """
            ).fetchall()

            updates: list[tuple[object, ...]] = []
            touched_document_ids: set[int] = set()
            for row in rows:
                repaired = self._repair_result_from_excerpt(row)
                original_label = repaired.original_label if repaired else row["original_label"]
                value = repaired.value if repaired else row["value"]
                original_unit = (
                    repaired.original_unit if repaired and repaired.original_unit is not None else row["original_unit"] or row["unit"]
                )
                reference_low = repaired.reference_low if repaired else row["reference_low"]
                reference_high = repaired.reference_high if repaired else row["reference_high"]
                flag = repaired.flag if repaired else row["flag"]
                normalized = normalize_result(
                    original_label=original_label,
                    original_unit=original_unit,
                    reference_low=reference_low,
                    reference_high=reference_high,
                )
                normalization_note = repaired.normalization_note if repaired else normalized.normalization_note
                review_status = normalized.review_status
                if value is None:
                    review_status = "needs_review"

                if (
                    original_label != row["original_label"]
                    or original_unit != row["original_unit"]
                    or value != row["value"]
                    or normalized.analyte_key != row["analyte_key"]
                    or normalized.analyte_display != row["analyte_display"]
                    or normalized.unit != row["unit"]
                    or reference_low != row["reference_low"]
                    or reference_high != row["reference_high"]
                    or flag != row["flag"]
                    or review_status != row["review_status"]
                    or normalization_note != row["normalization_note"]
                ):
                    updates.append(
                        (
                            original_label,
                            normalized.analyte_key,
                            normalized.analyte_display,
                            normalization_note,
                            value,
                            original_unit,
                            normalized.unit,
                            reference_low,
                            reference_high,
                            flag,
                            review_status,
                            timestamp,
                            row["id"],
                        )
                    )
                    touched_document_ids.add(int(row["document_id"]))

            if updates:
                connection.executemany(
                    """
                    UPDATE lab_results
                    SET
                      original_label = ?,
                      analyte_key = ?,
                      analyte_display = ?,
                      normalization_note = ?,
                      value = ?,
                      original_unit = ?,
                      unit = ?,
                      reference_low = ?,
                      reference_high = ?,
                      flag = ?,
                      review_status = ?,
                      updated_at = ?
                    WHERE id = ?
                    """,
                    updates,
                )
                for document_id in touched_document_ids:
                    self._refresh_document_status(connection, document_id, timestamp)

    def list_analytes(self) -> list[sqlite3.Row]:
        with self.connection() as connection:
            return connection.execute(
                """
                SELECT
                  analyte_key,
                  MIN(COALESCE(analyte_display, original_label)) AS analyte_display,
                  unit,
                  COUNT(*) AS result_count
                FROM lab_results
                WHERE review_status = 'approved'
                  AND analyte_key IS NOT NULL
                  AND unit IS NOT NULL
                GROUP BY analyte_key, unit
                ORDER BY LOWER(MIN(COALESCE(analyte_display, original_label))), LOWER(unit)
                """
            ).fetchall()

    def list_results(
        self,
        analyte_filters: list[str] | None = None,
        query: str | None = None,
        review_status: str | None = "approved",
    ) -> list[sqlite3.Row]:
        where_clauses = ["1 = 1"]
        parameters: list[object] = []

        if review_status:
            where_clauses.append("r.review_status = ?")
            parameters.append(review_status)

        if analyte_filters:
            analyte_clauses: list[str] = []
            for analyte_filter in analyte_filters:
                if "::" in analyte_filter:
                    analyte_key, unit = analyte_filter.split("::", maxsplit=1)
                    analyte_clauses.append("(r.analyte_key = ? AND r.unit = ?)")
                    parameters.extend([analyte_key, unit])
                else:
                    analyte_clauses.append("(r.analyte_key = ?)")
                    parameters.append(analyte_filter)
            if analyte_clauses:
                where_clauses.append(f"({' OR '.join(analyte_clauses)})")

        if query:
            like_query = f"%{query.lower()}%"
            where_clauses.append(
                "("
                "LOWER(COALESCE(r.analyte_display, '')) LIKE ? OR "
                "LOWER(COALESCE(r.original_label, '')) LIKE ? OR "
                "LOWER(COALESCE(d.lab_name, '')) LIKE ? OR "
                "LOWER(COALESCE(d.relative_path, '')) LIKE ?"
                ")"
            )
            parameters.extend([like_query, like_query, like_query, like_query])

        sql = f"""
            SELECT
              r.*,
              d.relative_path,
              d.lab_name,
              d.report_date,
              d.collected_at,
              d.status AS document_status,
              d.skip_reason
            FROM lab_results r
            JOIN documents d ON d.id = r.document_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY
              COALESCE(d.collected_at, d.report_date, d.created_at) ASC,
              r.page_number ASC,
              r.id ASC
        """
        with self.connection() as connection:
            return connection.execute(sql, parameters).fetchall()

    def get_result(self, result_id: int) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(
                """
                SELECT
                  r.*,
                  d.relative_path,
                  d.lab_name,
                  d.report_date,
                  d.collected_at,
                  d.status AS document_status,
                  d.skip_reason
                FROM lab_results r
                JOIN documents d ON d.id = r.document_id
                WHERE r.id = ?
                """,
                (result_id,),
            ).fetchone()

    def get_document(self, document_id: int) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(
                "SELECT * FROM documents WHERE id = ?",
                (document_id,),
            ).fetchone()

    def update_result(self, result_id: int, update: ReviewUpdate) -> sqlite3.Row | None:
        existing = self.get_result(result_id)
        if not existing:
            return None

        original_label = (
            update.original_label
            if "original_label" in update.model_fields_set
            else existing["original_label"]
        )
        analyte_display = (
            update.analyte_display
            if "analyte_display" in update.model_fields_set
            else existing["analyte_display"] or original_label
        )
        value = update.value if "value" in update.model_fields_set else existing["value"]
        original_unit = (
            update.original_unit
            if "original_unit" in update.model_fields_set
            else existing["original_unit"] if existing["original_unit"] is not None else existing["unit"]
        )
        if isinstance(original_unit, str):
            original_unit = original_unit.strip() or None

        unit_input = (
            update.unit
            if "unit" in update.model_fields_set
            else original_unit if "original_unit" in update.model_fields_set
            else existing["unit"]
        )
        if isinstance(unit_input, str):
            unit_input = unit_input.strip() or None

        reference_low = (
            update.reference_low if "reference_low" in update.model_fields_set else existing["reference_low"]
        )
        reference_high = (
            update.reference_high if "reference_high" in update.model_fields_set else existing["reference_high"]
        )
        flag = update.flag if "flag" in update.model_fields_set else existing["flag"]
        requested_review_status = (
            update.review_status if "review_status" in update.model_fields_set else existing["review_status"]
        )
        normalized = normalize_result(
            original_label=analyte_display or original_label,
            original_unit=unit_input or original_unit,
            reference_low=reference_low,
            reference_high=reference_high,
        )
        review_status = normalized.review_status
        if value is None:
            review_status = "needs_review"
        elif normalized.review_status == "approved":
            review_status = requested_review_status
        timestamp = utc_now()

        with self.connection() as connection:
            connection.execute(
                """
                UPDATE lab_results
                SET
                  original_label = ?,
                  analyte_key = ?,
                  analyte_display = ?,
                  normalization_note = ?,
                  value = ?,
                  original_unit = ?,
                  unit = ?,
                  reference_low = ?,
                  reference_high = ?,
                  flag = ?,
                  review_status = ?,
                  updated_at = ?
                WHERE id = ?
                """,
                (
                    original_label,
                    normalized.analyte_key,
                    normalized.analyte_display,
                    normalized.normalization_note,
                    value,
                    original_unit,
                    normalized.unit,
                    reference_low,
                    reference_high,
                    flag,
                    review_status,
                    timestamp,
                    result_id,
                ),
            )

            document_id = existing["document_id"]
            self._refresh_document_status(connection, document_id, timestamp)

        return self.get_result(result_id)

    def get_review_queue(self) -> tuple[list[sqlite3.Row], list[sqlite3.Row]]:
        review_results = self.list_results(review_status="needs_review")
        with self.connection() as connection:
            skipped_documents = connection.execute(
                """
                SELECT id, relative_path, sha256, lab_name, report_date, collected_at,
                       page_count, status, skip_reason
                FROM documents
                WHERE status = 'skipped'
                ORDER BY COALESCE(report_date, created_at) DESC, relative_path ASC
                """
            ).fetchall()
        return review_results, skipped_documents
