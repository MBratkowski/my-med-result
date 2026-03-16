import { useState } from "react";

import type { AnalyteOption, LabResult, ResultDetail, ScanSummary } from "../types";
import { AnalyteMultiSelect } from "./AnalyteMultiSelect";
import {
  FULL_DATE_FORMATTER,
  chartDateKey,
  chartTimestamp,
  exactDateLabel,
  exactDateLabelFromKey,
  formatDeltaValue,
  formatMetricValue,
  formatPercentDelta,
  parseChartDate,
  pointStatus,
  statusLabel,
} from "./chartUtils";
import { LineChart } from "./LineChart";
import { ProofDrawer } from "./ProofDrawer";

function formatValue(result: LabResult): string {
  if (result.value === null) {
    return "Needs review";
  }
  return `${result.value} ${result.unit ?? ""}`.trim();
}

function formatReference(result: LabResult): string {
  if (result.reference_low === null || result.reference_high === null) {
    return "n/a";
  }
  return `${result.reference_low} - ${result.reference_high}`;
}

function sourceFileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function sourceSecondaryLabel(result: LabResult): string {
  if (result.lab_name) {
    return result.lab_name;
  }
  return result.relative_path.split("/").at(-2) ?? "Local file";
}

function formatDate(result: LabResult): string {
  const date = parseChartDate(result);
  if (!date) {
    return "Unknown";
  }
  return FULL_DATE_FORMATTER.format(date);
}

function formatFlagMeta(result: LabResult): { label: string; tone: "normal" | "high" | "low" | "neutral" } {
  const normalizedFlag = result.flag?.trim().toUpperCase() ?? "";
  if (normalizedFlag.startsWith("H")) {
    return { label: "High", tone: "high" };
  }
  if (normalizedFlag.startsWith("L")) {
    return { label: "Low", tone: "low" };
  }

  const status = pointStatus(result);
  if (status === "above-range") {
    return { label: "High", tone: "high" };
  }
  if (status === "below-range") {
    return { label: "Low", tone: "low" };
  }
  if (status === "in-range") {
    return { label: "Normal", tone: "normal" };
  }

  return { label: "No range", tone: "neutral" };
}

function resultFilterKey(result: LabResult): string | null {
  if (!result.analyte_key || !result.unit) {
    return null;
  }
  return `${result.analyte_key}::${result.unit}`;
}

type ComparisonMode = "trend" | "snapshot";

export function DashboardView({
  analytes,
  results,
  scanSummary,
  selectedAnalytes,
  isLoading,
  isScanning,
  selectedDetail,
  onAnalyteChange,
  onScan,
  onResultSelect,
  onCloseDetail,
}: {
  analytes: AnalyteOption[];
  results: LabResult[];
  scanSummary: ScanSummary | null;
  selectedAnalytes: string[];
  isLoading: boolean;
  isScanning: boolean;
  selectedDetail: ResultDetail | null;
  onAnalyteChange: (value: string[]) => void;
  onScan: () => void;
  onResultSelect: (resultId: number) => void;
  onCloseDetail: () => void;
}) {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("trend");
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const chartGroups = selectedAnalytes.map((filterKey) => {
    const analyte = analytes.find((option) => option.filter_key === filterKey);
    const chartResults = results
      .filter((result) => resultFilterKey(result) === filterKey)
      .sort((left, right) => chartTimestamp(left) - chartTimestamp(right));
    const numericResults = chartResults.filter((result) => result.value !== null);
    const latestResult = numericResults.at(-1) ?? null;
    const previousResult = numericResults.at(-2) ?? null;
    const hoveredResult = hoveredDateKey
      ? numericResults.find((result) => chartDateKey(result) === hoveredDateKey) ?? null
      : null;
    const fallbackLabel = analyte?.analyte_display ?? chartResults[0]?.analyte_display ?? filterKey.split("::", 1)[0];
    const fallbackUnit = analyte?.unit ?? chartResults[0]?.unit ?? filterKey.split("::")[1] ?? null;
    const snapshotResultsByDate = new Map<string, LabResult>();
    for (const result of numericResults) {
      const dateKey = chartDateKey(result);
      if (dateKey) {
        snapshotResultsByDate.set(dateKey, result);
      }
    }
    return {
      filterKey,
      title: fallbackLabel,
      unit: fallbackUnit,
      results: chartResults,
      numericResults,
      latestResult,
      previousResult,
      hoveredResult,
      latestStatus: latestResult ? pointStatus(latestResult) : "no-range",
      snapshotResultsByDate,
    };
  });
  const numericComparisonResults = chartGroups.flatMap((group) => group.numericResults);
  const numericComparisonResultsSorted = [...numericComparisonResults].sort((left, right) => chartTimestamp(left) - chartTimestamp(right));
  const snapshotDateKeys = Array.from(
    new Set(
      numericComparisonResultsSorted
        .map((result) => chartDateKey(result))
        .filter((dateKey): dateKey is string => dateKey !== null),
    ),
  );
  const visibleSnapshotDateKeys = snapshotDateKeys.slice(-4);
  const comparisonDomain =
    numericComparisonResults.length > 0
      ? {
          min: Math.min(...numericComparisonResults.map((result) => chartTimestamp(result))),
          max: Math.max(...numericComparisonResults.map((result) => chartTimestamp(result))),
        }
      : null;
  const earliestResult = numericComparisonResultsSorted[0] ?? null;
  const latestResult = numericComparisonResultsSorted.at(-1) ?? null;
  const focusedDateLabel = exactDateLabelFromKey(hoveredDateKey);

  return (
    <>
      <section className="hero-card">
        <div>
          <p className="eyebrow">Doctor dashboard</p>
          <h1>Blood tests with source proof</h1>
          <p className="muted">
            Pick analytes from the searchable dropdown, compare multiple records side by side, then open the exact PDF
            page that backs any row.
          </p>
        </div>
        <button className="primary-button" disabled={isScanning} onClick={onScan} type="button">
          {isScanning ? "Scanning..." : "Scan data folder"}
        </button>
      </section>

      {scanSummary ? (
        <section className="summary-strip" aria-label="Last scan summary">
          <div>
            <strong>{scanSummary.updated}</strong>
            <span>updated documents</span>
          </div>
          <div>
            <strong>{scanSummary.approved_results}</strong>
            <span>approved rows</span>
          </div>
          <div>
            <strong>{scanSummary.review_results}</strong>
            <span>needs review</span>
          </div>
          <div>
            <strong>{scanSummary.removed_documents}</strong>
            <span>removed stale docs</span>
          </div>
          <div>
            <strong>{scanSummary.skipped_documents}</strong>
            <span>skipped files</span>
          </div>
        </section>
      ) : null}

      <section className="filters-card">
        <div className="field">
          <span>Analyte</span>
          <AnalyteMultiSelect analytes={analytes} onChange={onAnalyteChange} selectedValues={selectedAnalytes} />
        </div>

        <section aria-label="Comparison controls" className="workspace-panel">
          <div className="workspace-panel__header">
            <div>
              <p className="eyebrow">Comparison</p>
              <h2>
                {selectedAnalytes.length > 0
                  ? `${selectedAnalytes.length} record${selectedAnalytes.length === 1 ? "" : "s"} ready to compare`
                  : "Choose records to start"}
              </h2>
            </div>
            {selectedAnalytes.length > 0 ? (
              <button
                className="ghost-button"
                onClick={() => {
                  setHoveredDateKey(null);
                  onAnalyteChange([]);
                }}
                type="button"
              >
                Clear selection
              </button>
            ) : null}
          </div>

          <p className="muted">
            {selectedAnalytes.length > 0
              ? "Trend keeps the selected markers on one shared timeline. Snapshot lines up the latest report dates so you can compare rows without scanning multiple charts."
              : "Use the analyte dropdown search to find markers quickly. The table below stays on all approved rows until you pick records for comparison."}
          </p>

          <div className="workspace-panel__stats" aria-label="Comparison summary">
            <div>
              <strong>{selectedAnalytes.length}</strong>
              <span>records selected</span>
            </div>
            <div>
              <strong>{results.length}</strong>
              <span>{selectedAnalytes.length > 0 ? "rows in scope" : "approved rows loaded"}</span>
            </div>
            <div>
              <strong>{comparisonMode === "trend" ? "Trend" : "Snapshot"}</strong>
              <span>active view</span>
            </div>
          </div>

          <div className="workspace-panel__footer">
            <div aria-label="Comparison mode" className="comparison-mode-tabs" role="group">
              <button
                aria-pressed={comparisonMode === "trend"}
                className={comparisonMode === "trend" ? "comparison-mode-tab is-active" : "comparison-mode-tab"}
                onClick={() => setComparisonMode("trend")}
                type="button"
              >
                Trend
              </button>
              <button
                aria-pressed={comparisonMode === "snapshot"}
                className={comparisonMode === "snapshot" ? "comparison-mode-tab is-active" : "comparison-mode-tab"}
                onClick={() => {
                  setHoveredDateKey(null);
                  setComparisonMode("snapshot");
                }}
                type="button"
              >
                Snapshot
              </button>
            </div>
            <span className="workspace-panel__hint">
              {comparisonMode === "trend"
                ? "Hover any point to sync focus across charts."
                : "Compare the latest report dates in one matrix."}
            </span>
          </div>
        </section>
      </section>

      {chartGroups.length > 0 ? (
        <>
          <section className="comparison-overview">
            <div className="comparison-overview__copy">
              <p className="eyebrow">Comparison workspace</p>
              <h2>{`${chartGroups.length} markers across ${numericComparisonResults.length} numeric results`}</h2>
              <p className="muted">
                {comparisonMode === "trend" && earliestResult && latestResult
                  ? `Shared timeline ${exactDateLabel(earliestResult)} to ${exactDateLabel(latestResult)}. Hover any point to sync all charts and click a point to open the proof drawer.`
                  : comparisonMode === "snapshot" && visibleSnapshotDateKeys.length > 0
                    ? `Snapshot mode lines up the latest ${visibleSnapshotDateKeys.length} report dates so you can compare markers row by row and open proof from any cell.`
                    : "Pick analytes with numeric values to unlock synchronized comparison."}
              </p>
            </div>
            <div className="comparison-overview__actions">
              <div className="comparison-overview__badges">
                <span className="comparison-badge">{`${chartGroups.length} selected`}</span>
                {comparisonMode === "trend" && focusedDateLabel ? (
                  <span className="comparison-badge comparison-badge--active">{`Focused ${focusedDateLabel}`}</span>
                ) : null}
                {comparisonMode === "snapshot" && visibleSnapshotDateKeys.length > 0 ? (
                  <span className="comparison-badge comparison-badge--active">{`Latest ${visibleSnapshotDateKeys.length} dates`}</span>
                ) : null}
              </div>
            </div>
          </section>

          <section aria-label="Comparison summary" className="comparison-summary-grid">
            {chartGroups.map((group) => {
              const delta =
                group.latestResult && group.previousResult ? group.latestResult.value! - group.previousResult.value! : null;
              const percentDelta =
                group.latestResult && group.previousResult
                  ? formatPercentDelta(group.latestResult.value, group.previousResult.value)
                  : null;

              return (
                <article
                  className={`comparison-card comparison-card--${group.latestStatus}`}
                  key={`${group.filterKey}-summary`}
                >
                  <div className="comparison-card__header">
                    <div>
                      <p className="eyebrow">Selected analyte</p>
                      <h3>{group.title}</h3>
                      {group.unit ? <p className="muted">{group.unit}</p> : null}
                    </div>
                    <span className={`comparison-status comparison-status--${group.latestStatus}`}>
                      {statusLabel(group.latestStatus)}
                    </span>
                  </div>

                  <p className="comparison-card__value">
                    {group.latestResult ? formatMetricValue(group.latestResult.value, group.latestResult.unit) : "No numeric result"}
                  </p>

                  <div className="comparison-card__meta">
                    <div>
                      <span>Previous</span>
                      <strong>
                        {group.previousResult ? formatMetricValue(group.previousResult.value, group.previousResult.unit) : "No baseline"}
                      </strong>
                    </div>
                    <div>
                      <span>Change</span>
                      <strong>{`${formatDeltaValue(delta, group.unit)}${percentDelta ? ` · ${percentDelta}` : ""}`}</strong>
                    </div>
                    <div>
                      <span>Last measured</span>
                      <strong>{group.latestResult ? exactDateLabel(group.latestResult) : "Unknown"}</strong>
                    </div>
                    <div>
                      <span>Records</span>
                      <strong>{group.numericResults.length}</strong>
                    </div>
                  </div>

                  {group.hoveredResult ? (
                    <div className="comparison-card__focus">
                      <span>{`Focused ${exactDateLabel(group.hoveredResult)}`}</span>
                      <strong>{formatMetricValue(group.hoveredResult.value, group.hoveredResult.unit)}</strong>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>

          {comparisonMode === "trend" ? (
            <section aria-label="Result comparison charts" className="comparison-grid">
              {chartGroups.map((group) => (
                <LineChart
                  hoveredDateKey={hoveredDateKey}
                  key={group.filterKey}
                  onHoveredDateChange={setHoveredDateKey}
                  onPointSelect={onResultSelect}
                  results={group.results}
                  title={group.title}
                  unit={group.unit}
                  xDomain={comparisonDomain}
                />
              ))}
            </section>
          ) : (
            <section aria-label="Snapshot comparison" className="snapshot-card">
              <div className="snapshot-card__header">
                <div>
                  <p className="eyebrow">Snapshot comparison</p>
                  <h3>{visibleSnapshotDateKeys.length > 0 ? `Latest ${visibleSnapshotDateKeys.length} report dates` : "No dated numeric results"}</h3>
                </div>
                <p className="muted">Each cell opens the original proof for that analyte and date.</p>
              </div>

              {visibleSnapshotDateKeys.length === 0 ? (
                <div className="empty-state">
                  <h3>No snapshots yet</h3>
                  <p className="muted">Choose analytes with dated numeric results to build the comparison matrix.</p>
                </div>
              ) : (
                <div className="snapshot-table-wrap">
                  <table className="snapshot-table">
                    <thead>
                      <tr>
                        <th>Analyte</th>
                        {visibleSnapshotDateKeys.map((dateKey) => (
                          <th key={dateKey}>{exactDateLabelFromKey(dateKey)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartGroups.map((group) => (
                        <tr key={`${group.filterKey}-snapshot`}>
                          <th scope="row">
                            <div className="snapshot-row-label">
                              <strong>{group.title}</strong>
                              {group.unit ? <span>{group.unit}</span> : null}
                            </div>
                          </th>
                          {visibleSnapshotDateKeys.map((dateKey) => {
                            const result = group.snapshotResultsByDate.get(dateKey) ?? null;
                            const status = result ? pointStatus(result) : "no-range";

                            return (
                              <td key={`${group.filterKey}-${dateKey}`}>
                                {result ? (
                                  <button
                                    aria-label={`Open ${group.title} snapshot from ${exactDateLabelFromKey(dateKey)}`}
                                    className={`snapshot-cell snapshot-cell--${status}`}
                                    onClick={() => onResultSelect(result.id)}
                                    type="button"
                                  >
                                    <strong>{formatMetricValue(result.value, result.unit)}</strong>
                                    <span>{statusLabel(status)}</span>
                                  </button>
                                ) : (
                                  <div className="snapshot-cell snapshot-cell--empty">
                                    <strong>—</strong>
                                    <span>No result</span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      ) : null}

      <section className="table-card">
        <div className="table-card__header">
          <div>
            <p className="eyebrow">Results</p>
            <h2>{results.length} approved rows</h2>
          </div>
          {isLoading ? <p className="muted">Refreshing results...</p> : null}
        </div>

        {results.length === 0 ? (
          <div className="empty-state">
            <h3>No approved rows yet</h3>
            <p className="muted">Run a scan or loosen the filters.</p>
          </div>
        ) : (
          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Analyte</th>
                  <th>Value</th>
                  <th>Reference</th>
                  <th>Flag</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const flag = formatFlagMeta(result);
                  return (
                    <tr
                      key={result.id}
                      onClick={() => onResultSelect(result.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onResultSelect(result.id);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="results-table__date">{formatDate(result)}</td>
                      <td>
                        <div className="results-table__analyte">
                          <strong>{result.analyte_display ?? result.original_label}</strong>
                          {result.unit ? <span>{result.unit}</span> : null}
                        </div>
                      </td>
                      <td>{formatValue(result)}</td>
                      <td>{formatReference(result)}</td>
                      <td>
                        <span className={`result-flag result-flag--${flag.tone}`}>{flag.label}</span>
                      </td>
                      <td>
                        <div className="results-table__source">
                          <strong title={result.relative_path}>{sourceFileName(result.relative_path)}</strong>
                          <span>{sourceSecondaryLabel(result)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ProofDrawer detail={selectedDetail} onClose={onCloseDetail} />
    </>
  );
}
