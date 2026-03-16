import { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type { ResultDetail } from "../types";
import { FULL_DATE_FORMATTER, parseChartDate } from "./chartUtils";

GlobalWorkerOptions.workerSrc = workerUrl;

function PdfCanvas({ fileUrl, pageNumber, scale }: { fileUrl: string; pageNumber: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const loadingTask = getDocument(fileUrl);
    loadingTask.promise
      .then((pdf) => pdf.getPage(pageNumber))
      .then((page) => {
        if (cancelled || !canvas) {
          return;
        }
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas context unavailable.");
        }
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        return page.render({ canvasContext: context, viewport }).promise;
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not render PDF page.");
        }
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [fileUrl, pageNumber, scale]);

  if (error) {
    return <p className="muted">{error}</p>;
  }

  return <canvas ref={canvasRef} className="pdf-canvas" />;
}

export function ProofDrawer({
  detail,
  onClose,
}: {
  detail: ResultDetail | null;
  onClose: () => void;
}) {
  const [activeView, setActiveView] = useState<"preview" | "render">("preview");
  const [zoomScale, setZoomScale] = useState(1.35);

  useEffect(() => {
    setActiveView("preview");
    setZoomScale(1.35);
  }, [detail?.id]);

  if (!detail) {
    return null;
  }

  const reportDate = detail.report_date
    ? FULL_DATE_FORMATTER.format(parseChartDate({ ...detail, collected_at: null }) ?? new Date(detail.report_date))
    : "Unknown";
  const collectedDate = detail.collected_at
    ? FULL_DATE_FORMATTER.format(parseChartDate(detail) ?? new Date(detail.collected_at))
    : "Unknown";
  const fileName = detail.relative_path.split("/").at(-1) ?? detail.relative_path;
  const zoomPercent = Math.round(zoomScale * 100);

  function adjustZoom(direction: "out" | "in") {
    setZoomScale((current) => {
      const next = direction === "in" ? current + 0.2 : current - 0.2;
      return Math.min(2.4, Math.max(1, Number(next.toFixed(2))));
    });
  }

  return (
    <aside className="proof-drawer" aria-label="Source proof panel">
      <div className="proof-drawer__header">
        <div>
          <p className="eyebrow">Proof</p>
          <h2>{detail.analyte_display ?? detail.original_label}</h2>
        </div>
        <button className="ghost-button" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <div className="proof-grid">
        <section className="proof-card">
          <div className="proof-card__header">
            <div>
              <p className="eyebrow">Source record</p>
              <h3>{fileName}</h3>
            </div>
            <a className="primary-button" href={`${detail.file_url}#page=${detail.page_number}`} target="_blank" rel="noreferrer">
              Open original PDF
            </a>
          </div>
          <dl className="proof-meta">
            <div>
              <dt>Value</dt>
              <dd>
                {detail.value ?? "Unknown"} {detail.unit ?? ""}
              </dd>
            </div>
            <div>
              <dt>Canonical unit</dt>
              <dd>{detail.unit ?? "Unknown"}</dd>
            </div>
            {detail.original_unit && detail.original_unit !== detail.unit ? (
              <div>
                <dt>OCR unit</dt>
                <dd>{detail.original_unit}</dd>
              </div>
            ) : null}
            {detail.normalization_note ? (
              <div>
                <dt>Normalization</dt>
                <dd>{detail.normalization_note}</dd>
              </div>
            ) : null}
            <div>
              <dt>File</dt>
              <dd>{detail.relative_path}</dd>
            </div>
            <div>
              <dt>Lab</dt>
              <dd>{detail.lab_name ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Report date</dt>
              <dd>{reportDate}</dd>
            </div>
            <div>
              <dt>Collected</dt>
              <dd>{collectedDate}</dd>
            </div>
            <div>
              <dt>Page</dt>
              <dd>{detail.page_number}</dd>
            </div>
            <div>
              <dt>OCR excerpt</dt>
              <dd>{detail.raw_excerpt}</dd>
            </div>
          </dl>
        </section>

        <section className="proof-card proof-card--viewer">
          <div className="proof-card__header">
            <div>
              <p className="eyebrow">Source page</p>
              <h3>{activeView === "preview" ? "Page preview" : "PDF render"}</h3>
            </div>
            <div className="proof-toolbar">
              <div aria-label="Proof view" className="proof-view-tabs" role="group">
                <button
                  aria-pressed={activeView === "preview"}
                  className={activeView === "preview" ? "proof-view-tab is-active" : "proof-view-tab"}
                  onClick={() => setActiveView("preview")}
                  type="button"
                >
                  Page preview
                </button>
                <button
                  aria-pressed={activeView === "render"}
                  className={activeView === "render" ? "proof-view-tab is-active" : "proof-view-tab"}
                  onClick={() => setActiveView("render")}
                  type="button"
                >
                  PDF render
                </button>
              </div>
              <div aria-label="Proof zoom" className="proof-zoom-controls" role="group">
                <button
                  aria-label="Zoom out"
                  className="proof-zoom-button"
                  disabled={zoomScale <= 1}
                  onClick={() => adjustZoom("out")}
                  type="button"
                >
                  -
                </button>
                <span className="proof-zoom-value">{`${zoomPercent}%`}</span>
                <button
                  aria-label="Zoom in"
                  className="proof-zoom-button"
                  disabled={zoomScale >= 2.4}
                  onClick={() => adjustZoom("in")}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <p className="muted">
            {activeView === "preview"
              ? "Fast proof image for quick verification. Use zoom when OCR details feel too small."
              : "Higher-fidelity PDF.js render with zoom for inspecting the source page."}
          </p>
          <div className="proof-viewer-stage">
            {activeView === "preview" ? (
              <img
                alt={`Preview for page ${detail.page_number}`}
                className="proof-preview"
                src={detail.preview_url}
                style={{ width: `${zoomPercent}%` }}
              />
            ) : (
              <PdfCanvas fileUrl={detail.file_url} pageNumber={detail.page_number} scale={zoomScale} />
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}
