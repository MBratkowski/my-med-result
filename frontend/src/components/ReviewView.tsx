import { useState } from "react";

import type { DocumentSummary, LabResult, ReviewQueue, ReviewUpdate } from "../types";

function coerceNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ReviewRowEditor({
  result,
  onSave,
}: {
  result: LabResult;
  onSave: (resultId: number, payload: ReviewUpdate) => Promise<void>;
}) {
  const [label, setLabel] = useState(result.original_label);
  const [display, setDisplay] = useState(result.analyte_display ?? result.original_label);
  const [value, setValue] = useState(result.value?.toString() ?? "");
  const [originalUnit, setOriginalUnit] = useState(result.original_unit ?? result.unit ?? "");
  const [unit, setUnit] = useState(result.unit ?? "");
  const [referenceLow, setReferenceLow] = useState(result.reference_low?.toString() ?? "");
  const [referenceHigh, setReferenceHigh] = useState(result.reference_high?.toString() ?? "");
  const [flag, setFlag] = useState(result.flag ?? "");
  const [reviewStatus, setReviewStatus] = useState<"approved" | "needs_review">(result.review_status);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(result.id, {
        original_label: label,
        analyte_display: display,
        value: coerceNumber(value),
        original_unit: originalUnit || null,
        unit: unit || null,
        reference_low: coerceNumber(referenceLow),
        reference_high: coerceNumber(referenceHigh),
        flag: flag || null,
        review_status: reviewStatus,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="review-card">
      <div className="review-card__header">
        <div>
          <p className="eyebrow">Needs review</p>
          <h3>{result.relative_path}</h3>
        </div>
        <span className={`review-badge review-badge--${result.review_status}`}>{result.review_status}</span>
      </div>

      <p className="review-excerpt">{result.raw_excerpt}</p>

      <div className="review-grid">
        <label className="field">
          <span>Original label</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="field">
          <span>Canonical label</span>
          <input value={display} onChange={(event) => setDisplay(event.target.value)} />
        </label>
        <label className="field">
          <span>Value</span>
          <input value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <label className="field">
          <span>Original OCR unit</span>
          <input value={originalUnit} onChange={(event) => setOriginalUnit(event.target.value)} />
        </label>
        <label className="field">
          <span>Canonical unit</span>
          <input value={unit} onChange={(event) => setUnit(event.target.value)} />
        </label>
        <label className="field">
          <span>Reference low</span>
          <input value={referenceLow} onChange={(event) => setReferenceLow(event.target.value)} />
        </label>
        <label className="field">
          <span>Reference high</span>
          <input value={referenceHigh} onChange={(event) => setReferenceHigh(event.target.value)} />
        </label>
        <label className="field">
          <span>Flag</span>
          <input value={flag} onChange={(event) => setFlag(event.target.value.slice(0, 1).toUpperCase())} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as "approved" | "needs_review")}>
            <option value="needs_review">Needs review</option>
            <option value="approved">Approve</option>
          </select>
        </label>
      </div>
      {result.original_unit && result.original_unit !== result.unit ? (
        <p className="field-note">
          OCR reported `{result.original_unit}`, normalized to `{result.unit}`.
        </p>
      ) : null}
      {result.normalization_note ? <p className="field-note">{result.normalization_note}</p> : null}

      <button className="primary-button" disabled={isSaving} onClick={handleSave} type="button">
        {isSaving ? "Saving..." : "Save review"}
      </button>
    </article>
  );
}

function SkippedDocumentCard({ document }: { document: DocumentSummary }) {
  return (
    <article className="review-card">
      <div className="review-card__header">
        <div>
          <p className="eyebrow">Skipped document</p>
          <h3>{document.relative_path}</h3>
        </div>
        <span className="review-badge review-badge--skipped">{document.status}</span>
      </div>
      <p className="muted">{document.skip_reason ?? "No reason captured."}</p>
      <dl className="skipped-meta">
        <div>
          <dt>Pages</dt>
          <dd>{document.page_count}</dd>
        </div>
        <div>
          <dt>Report date</dt>
          <dd>{document.report_date ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Collected</dt>
          <dd>{document.collected_at ?? "Unknown"}</dd>
        </div>
      </dl>
    </article>
  );
}

export function ReviewView({
  queue,
  isLoading,
  onSave,
}: {
  queue: ReviewQueue | null;
  isLoading: boolean;
  onSave: (resultId: number, payload: ReviewUpdate) => Promise<void>;
}) {
  const results = queue?.results ?? [];
  const skippedDocuments = queue?.skipped_documents ?? [];

  return (
    <div className="review-layout">
      <section className="table-card">
        <div className="table-card__header">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>{results.length} rows need human confirmation</h2>
          </div>
          {isLoading ? <p className="muted">Refreshing review queue...</p> : null}
        </div>
        {results.length === 0 ? (
          <div className="empty-state">
            <h3>No unresolved rows</h3>
            <p className="muted">Approved results stay out of this queue by default.</p>
          </div>
        ) : (
          <div className="stack">
            {results.map((result) => (
              <ReviewRowEditor key={result.id} result={result} onSave={onSave} />
            ))}
          </div>
        )}
      </section>

      <section className="table-card">
        <div className="table-card__header">
          <div>
            <p className="eyebrow">Skipped files</p>
            <h2>{skippedDocuments.length} documents were not converted</h2>
          </div>
        </div>
        {skippedDocuments.length === 0 ? (
          <div className="empty-state">
            <h3>No skipped files</h3>
            <p className="muted">Files without parseable lab rows will surface here.</p>
          </div>
        ) : (
          <div className="stack">
            {skippedDocuments.map((document) => (
              <SkippedDocumentCard key={document.id} document={document} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
