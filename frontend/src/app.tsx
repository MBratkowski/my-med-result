import { startTransition, useEffect, useState } from "react";

import { getAnalytes, getResult, getResults, getReviewQueue, scanDocuments, updateResult } from "./api";
import { DashboardView } from "./components/DashboardView";
import { ReviewView } from "./components/ReviewView";
import type { AnalyteOption, ResultDetail, ReviewQueue, ReviewUpdate, ScanSummary, LabResult } from "./types";

type ViewMode = "dashboard" | "review";

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [analytes, setAnalytes] = useState<AnalyteOption[]>([]);
  const [results, setResults] = useState<LabResult[]>([]);
  const [selectedAnalytes, setSelectedAnalytes] = useState<string[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueue | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ResultDetail | null>(null);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getAnalytes()
      .then(setAnalytes)
      .catch((error: Error) => setErrorMessage(error.message));
  }, [refreshCounter]);

  useEffect(() => {
    setIsLoadingResults(true);
    getResults(selectedAnalytes)
      .then(setResults)
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setIsLoadingResults(false));
  }, [selectedAnalytes, refreshCounter]);

  useEffect(() => {
    if (viewMode !== "review") {
      return;
    }
    setIsLoadingReview(true);
    getReviewQueue()
      .then(setReviewQueue)
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setIsLoadingReview(false));
  }, [viewMode, refreshCounter]);

  async function handleScan() {
    setIsScanning(true);
    setErrorMessage(null);
    try {
      const summary = await scanDocuments();
      setScanSummary(summary);
      startTransition(() => {
        setRefreshCounter((value) => value + 1);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Scan failed.");
    } finally {
      setIsScanning(false);
    }
  }

  async function handleResultSelect(resultId: number) {
    setErrorMessage(null);
    try {
      const detail = await getResult(resultId);
      setSelectedDetail(detail);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not open result detail.");
    }
  }

  async function handleReviewSave(resultId: number, payload: ReviewUpdate) {
    setErrorMessage(null);
    try {
      await updateResult(resultId, payload);
      startTransition(() => {
        setRefreshCounter((value) => value + 1);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save review.");
      throw error;
    }
  }

  return (
    <main className="app-shell">
      <aside className="rail">
        <p className="rail__eyebrow">Local-first record</p>
        <h1 className="rail__title">My Med Result</h1>
        <p className="rail__copy">
          A physician-ready view of OCR-extracted blood tests, designed to move from trend to proof in one click.
        </p>

        <nav className="mode-tabs" aria-label="Primary navigation">
          <button
            className={viewMode === "dashboard" ? "mode-tabs__button is-active" : "mode-tabs__button"}
            onClick={() => setViewMode("dashboard")}
            type="button"
          >
            Dashboard
          </button>
          <button
            className={viewMode === "review" ? "mode-tabs__button is-active" : "mode-tabs__button"}
            onClick={() => setViewMode("review")}
            type="button"
          >
            Review
          </button>
        </nav>

        <dl className="rail-stats">
          <div>
            <dt>Analytes</dt>
            <dd>{analytes.length}</dd>
          </div>
          <div>
            <dt>Loaded rows</dt>
            <dd>{results.length}</dd>
          </div>
          <div>
            <dt>Review queue</dt>
            <dd>{reviewQueue?.results.length ?? 0}</dd>
          </div>
        </dl>
      </aside>

      <section className="content-stage">
        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
        {viewMode === "dashboard" ? (
          <DashboardView
            analytes={analytes}
            results={results}
            scanSummary={scanSummary}
            selectedAnalytes={selectedAnalytes}
            isLoading={isLoadingResults}
            isScanning={isScanning}
            selectedDetail={selectedDetail}
            onAnalyteChange={setSelectedAnalytes}
            onScan={handleScan}
            onResultSelect={handleResultSelect}
            onCloseDetail={() => setSelectedDetail(null)}
          />
        ) : (
          <ReviewView queue={reviewQueue} isLoading={isLoadingReview} onSave={handleReviewSave} />
        )}
      </section>
    </main>
  );
}
