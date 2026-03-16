from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import DATA_DIR, FRONTEND_DIST_DIR, PREVIEW_DIR, ensure_runtime_dirs
from .importer import ImportService
from .repository import Repository
from .schemas import (
    AnalyteOption,
    DocumentSummary,
    ResultDetail,
    ResultListItem,
    ReviewQueue,
    ReviewUpdate,
    ScanSummary,
)


repository = Repository()
import_service = ImportService(repository=repository)
app = FastAPI(title="Medical Result Explorer", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _result_to_item(row) -> ResultListItem:
    return ResultListItem.model_validate(dict(row))


def _result_to_detail(row) -> ResultDetail:
    payload = dict(row)
    payload["preview_url"] = f"/api/documents/{row['document_id']}/pages/{row['page_number']}/preview"
    payload["file_url"] = f"/api/documents/{row['document_id']}/file"
    return ResultDetail.model_validate(payload)


@app.on_event("startup")
def on_startup() -> None:
    ensure_runtime_dirs()


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/import/scan", response_model=ScanSummary)
def trigger_scan() -> ScanSummary:
    return import_service.scan()


@app.get("/api/analytes", response_model=list[AnalyteOption])
def list_analytes() -> list[AnalyteOption]:
    rows = repository.list_analytes()
    analytes = []
    for row in rows:
        analytes.append(
            AnalyteOption(
                filter_key=f"{row['analyte_key']}::{row['unit']}",
                analyte_key=row["analyte_key"],
                analyte_display=row["analyte_display"],
                unit=row["unit"],
                result_count=row["result_count"],
            )
        )
    return analytes


@app.get("/api/results", response_model=list[ResultListItem])
def list_results(
    analyte_key: list[str] | None = Query(default=None),
    q: str | None = Query(default=None),
    review_status: str = Query(default="approved"),
) -> list[ResultListItem]:
    rows = repository.list_results(analyte_filters=analyte_key, query=q, review_status=review_status)
    return [_result_to_item(row) for row in rows]


@app.get("/api/results/{result_id}", response_model=ResultDetail)
def get_result(result_id: int) -> ResultDetail:
    row = repository.get_result(result_id)
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    return _result_to_detail(row)


@app.patch("/api/results/{result_id}", response_model=ResultDetail)
def update_result(result_id: int, update: ReviewUpdate) -> ResultDetail:
    row = repository.update_result(result_id, update)
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    return _result_to_detail(row)


@app.get("/api/review/queue", response_model=ReviewQueue)
def get_review_queue() -> ReviewQueue:
    result_rows, skipped_rows = repository.get_review_queue()
    return ReviewQueue(
        results=[_result_to_item(row) for row in result_rows],
        skipped_documents=[DocumentSummary.model_validate(dict(row)) for row in skipped_rows],
    )


@app.get("/api/documents/{document_id}/file")
def open_document(document_id: int) -> FileResponse:
    document = repository.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    absolute_path = DATA_DIR.parent / document["relative_path"]
    if not absolute_path.exists():
        raise HTTPException(status_code=404, detail="PDF file missing on disk")
    return FileResponse(path=absolute_path, media_type="application/pdf", filename=absolute_path.name)


@app.get("/api/documents/{document_id}/pages/{page_number}/preview")
def get_preview(document_id: int, page_number: int) -> FileResponse:
    document = repository.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    preview_path = PREVIEW_DIR / document["sha256"] / f"page-{page_number:06d}.png"
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview not found")
    return FileResponse(path=preview_path, media_type="image/png", filename=preview_path.name)


if FRONTEND_DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="frontend")
else:
    @app.get("/")
    def frontend_placeholder() -> JSONResponse:
        return JSONResponse(
            {
                "message": "Frontend build not found.",
                "hint": "Run the Vite frontend in dev mode or build it into frontend/dist.",
            }
        )
