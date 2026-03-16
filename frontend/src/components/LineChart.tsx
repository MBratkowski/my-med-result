import type { LabResult } from "../types";
import {
  VALUE_FORMATTER,
  chartDateKey,
  chartLabel,
  chartTimestamp,
  exactDateLabel,
  exactDateLabelFromKey,
  formatMetricValue,
  parseChartDate,
  pointStatus,
  referenceLabel,
} from "./chartUtils";

function uniqueTickIndices(length: number, limit: number): number[] {
  if (length <= limit) {
    return Array.from({ length }, (_, index) => index);
  }

  const indices = new Set<number>();
  const step = (length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    indices.add(Math.round(index * step));
  }
  return [...indices].sort((left, right) => left - right);
}

export function LineChart({
  results,
  title,
  unit,
  xDomain,
  hoveredDateKey,
  onHoveredDateChange,
  onPointSelect,
}: {
  results: LabResult[];
  title: string;
  unit?: string | null;
  xDomain?: { min: number; max: number } | null;
  hoveredDateKey?: string | null;
  onHoveredDateChange?: (dateKey: string | null) => void;
  onPointSelect?: (resultId: number) => void;
}) {
  const filtered = [...results]
    .filter((result) => result.value !== null)
    .sort((left, right) => chartTimestamp(left) - chartTimestamp(right));
  const displayUnit = unit ?? filtered[0]?.unit ?? null;
  const chartTitle = displayUnit ? `${title} (${displayUnit})` : title;
  const ariaLabel = `${title} trend chart`;

  if (filtered.length === 0) {
    return (
      <section aria-label={ariaLabel} className="chart-card">
        <div className="chart-header">
          <div>
            <p className="eyebrow">Trend</p>
            <h3>{title}</h3>
          </div>
          {displayUnit ? <p className="muted">{displayUnit}</p> : null}
        </div>
        <p className="muted">Approved rows for this record do not include numeric values to draw a trend.</p>
      </section>
    );
  }

  const width = 860;
  const height = 360;
  const marginTop = 24;
  const marginRight = 22;
  const marginBottom = 78;
  const marginLeft = 90;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;
  const values = filtered.map((result) => result.value ?? 0);
  const timestamps = filtered.map((result) => chartTimestamp(result));
  const referenceValues = filtered.flatMap((result) => {
    const bounds: number[] = [];
    if (result.reference_low !== null) {
      bounds.push(result.reference_low);
    }
    if (result.reference_high !== null) {
      bounds.push(result.reference_high);
    }
    return bounds;
  });
  const chartValues = [...values, ...referenceValues];
  const min = Math.min(...chartValues);
  const max = Math.max(...chartValues);
  const rawRange = max - min;
  const paddingValue = rawRange === 0 ? Math.max(Math.abs(min) * 0.1, 1) : rawRange * 0.08;
  const chartMin = Math.max(0, min - paddingValue);
  const chartMax = max + paddingValue;
  const chartRange = chartMax - chartMin || 1;
  const domainMin = xDomain?.min ?? Math.min(...timestamps);
  const domainMax = xDomain?.max ?? Math.max(...timestamps);
  const domainRange = domainMax - domainMin;
  const hasMultipleYears =
    new Set(
      filtered
        .map((result) => parseChartDate(result)?.getFullYear())
        .filter((year): year is number => typeof year === "number"),
    ).size > 1;

  function valueToY(value: number): number {
    return marginTop + ((chartMax - value) / chartRange) * plotHeight;
  }

  const tickValues = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    return chartMax - ratio * chartRange;
  });

  const points = filtered.map((result, index) => {
    const timestamp = chartTimestamp(result);
    const x = domainRange === 0 ? marginLeft + plotWidth / 2 : marginLeft + ((timestamp - domainMin) / domainRange) * plotWidth;
    return {
      x,
      y: valueToY(result.value ?? min),
      lowY: result.reference_low === null ? null : valueToY(result.reference_low),
      highY: result.reference_high === null ? null : valueToY(result.reference_high),
      status: pointStatus(result),
      dateKey: chartDateKey(result),
      result,
    };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const xTickIndices = uniqueTickIndices(points.length, 6);
  const hasReferenceBand = points.every((point) => point.lowY !== null && point.highY !== null);
  const referenceBandPath =
    hasReferenceBand && points.length > 1
      ? [
          points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.highY?.toFixed(2)}`).join(" "),
          points
            .slice()
            .reverse()
            .map((point) => `L ${point.x.toFixed(2)} ${point.lowY?.toFixed(2)}`)
            .join(" "),
          "Z",
        ].join(" ")
      : hasReferenceBand
        ? `M ${marginLeft} ${points[0].highY?.toFixed(2)} L ${width - marginRight} ${points[0].highY?.toFixed(2)} L ${width - marginRight} ${points[0].lowY?.toFixed(2)} L ${marginLeft} ${points[0].lowY?.toFixed(2)} Z`
        : null;
  const referenceHighPath =
    hasReferenceBand && points.length > 1
      ? points
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.highY?.toFixed(2)}`)
          .join(" ")
      : hasReferenceBand
        ? `M ${marginLeft} ${points[0].highY?.toFixed(2)} L ${width - marginRight} ${points[0].highY?.toFixed(2)}`
        : null;
  const referenceLowPath =
    hasReferenceBand && points.length > 1
      ? points
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.lowY?.toFixed(2)}`)
          .join(" ")
      : hasReferenceBand
        ? `M ${marginLeft} ${points[0].lowY?.toFixed(2)} L ${width - marginRight} ${points[0].lowY?.toFixed(2)}`
        : null;
  const focusedPoints = hoveredDateKey ? points.filter((point) => point.dateKey === hoveredDateKey) : [];
  const focusedPoint = focusedPoints[0] ?? null;
  const focusLabel =
    focusedPoint && hoveredDateKey
      ? `${exactDateLabelFromKey(hoveredDateKey)} · ${formatMetricValue(focusedPoint.result.value, focusedPoint.result.unit)}`
      : null;
  const focusLabelWidth = focusLabel ? focusLabel.length * 7 + 18 : 0;
  const focusLabelX = focusedPoint
    ? Math.min(width - marginRight - focusLabelWidth, Math.max(marginLeft, focusedPoint.x - focusLabelWidth / 2))
    : 0;
  const focusLabelY = focusedPoint ? Math.max(marginTop + 6, focusedPoint.y - 38) : 0;
  const handleHoveredDateChange = (dateKey: string | null) => {
    if (dateKey !== hoveredDateKey) {
      onHoveredDateChange?.(dateKey);
    }
  };

  return (
    <section className="chart-card" aria-label={ariaLabel}>
      <div className="chart-header">
        <div>
          <p className="eyebrow">Trend</p>
          <h3>{title}</h3>
        </div>
        <div className="chart-header__meta">
          {hoveredDateKey ? <p className="chart-focus-label">{exactDateLabelFromKey(hoveredDateKey)}</p> : null}
          {displayUnit ? <p className="muted">{displayUnit}</p> : null}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="line-chart"
        onMouseLeave={() => handleHoveredDateChange(null)}
        role="img"
      >
        {referenceBandPath ? (
          <>
            <rect
              x={marginLeft}
              y={marginTop}
              width={plotWidth}
              height={plotHeight}
              className="line-chart__reference-zone"
            />
            <path d={referenceBandPath} className="line-chart__reference-band" />
            {referenceHighPath ? <path d={referenceHighPath} className="line-chart__reference-edge" /> : null}
            {referenceLowPath ? <path d={referenceLowPath} className="line-chart__reference-edge" /> : null}
          </>
        ) : null}
        {focusedPoint ? (
          <line
            x1={focusedPoint.x}
            x2={focusedPoint.x}
            y1={marginTop}
            y2={height - marginBottom}
            className="line-chart__focus-line"
          />
        ) : null}
        {tickValues.map((tickValue, index) => {
          const y = marginTop + (index / 4) * plotHeight;
          return (
            <g key={tickValue} className="line-chart__grid">
              <line
                x1={marginLeft}
                x2={width - marginRight}
                y1={y}
                y2={y}
                className="line-chart__grid-line"
              />
              <text x={marginLeft - 12} y={y + 4} textAnchor="end" className="line-chart__tick-label line-chart__tick-label--y">
                {VALUE_FORMATTER.format(tickValue)}
              </text>
            </g>
          );
        })}
        <line x1={marginLeft} x2={marginLeft} y1={marginTop} y2={height - marginBottom} className="line-chart__axis" />
        <line
          x1={marginLeft}
          x2={width - marginRight}
          y1={height - marginBottom}
          y2={height - marginBottom}
          className="line-chart__axis"
        />
        <path d={path} className="line-chart__path" />
        {points.map((point) => (
          <g key={point.result.id}>
            {point.dateKey === hoveredDateKey ? (
              <circle cx={point.x} cy={point.y} r="10" className="line-chart__point-glow" />
            ) : null}
            <circle
              cx={point.x}
              cy={point.y}
              className={`line-chart__point line-chart__point--${point.status}`}
              r={point.dateKey === hoveredDateKey ? "6.5" : "5"}
            />
            <circle
              aria-label={`Open ${title} result from ${exactDateLabel(point.result)}`}
              cx={point.x}
              cy={point.y}
              className="line-chart__point-hitbox"
              fill="transparent"
              onClick={() => onPointSelect?.(point.result.id)}
              onFocus={() => handleHoveredDateChange(point.dateKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPointSelect?.(point.result.id);
                }
              }}
              onMouseEnter={() => handleHoveredDateChange(point.dateKey)}
              onBlur={() => handleHoveredDateChange(null)}
              r="12"
              role="button"
              tabIndex={0}
            />
            <title>
              {`${exactDateLabel(point.result)}: ${VALUE_FORMATTER.format(point.result.value ?? 0)} ${point.result.unit ?? ""}\n${referenceLabel(point.result)}`}
            </title>
          </g>
        ))}
        {focusedPoint && focusLabel ? (
          <g className="line-chart__focus-callout">
            <rect
              x={focusLabelX}
              y={focusLabelY}
              width={focusLabelWidth}
              height="24"
              rx="12"
              className="line-chart__focus-pill"
            />
            <text x={focusLabelX + focusLabelWidth / 2} y={focusLabelY + 16} textAnchor="middle" className="line-chart__focus-text">
              {focusLabel}
            </text>
          </g>
        ) : null}
        {xTickIndices.map((index) => {
          const point = points[index];
          return (
            <g key={point.result.id}>
              <line
                x1={point.x}
                x2={point.x}
                y1={height - marginBottom}
                y2={height - marginBottom + 8}
                className="line-chart__axis-tick"
              />
              <text x={point.x} y={height - marginBottom + 26} textAnchor="middle" className="line-chart__tick-label">
                {chartLabel(point.result, hasMultipleYears)}
              </text>
            </g>
          );
        })}
        <text
          x={22}
          y={marginTop + plotHeight / 2}
          transform={`rotate(-90 22 ${marginTop + plotHeight / 2})`}
          textAnchor="middle"
          className="line-chart__axis-title"
        >
          {chartTitle}
        </text>
      </svg>
    </section>
  );
}
