import type { LabResult } from "../types";

export const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "short",
});
const SHORT_DATE_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
export const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const VALUE_FORMATTER = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2,
});

export type PointStatus = "below-range" | "in-range" | "above-range" | "no-range";

export function chartDate(result: LabResult): string {
  return result.collected_at ?? result.report_date ?? "";
}

export function parseChartDate(result: LabResult): Date | null {
  const value = chartDate(result);
  if (!value) {
    return null;
  }

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3]),
      12,
      0,
      0,
    );
  }

  const dateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (dateTimeMatch) {
    return new Date(
      Number(dateTimeMatch[1]),
      Number(dateTimeMatch[2]) - 1,
      Number(dateTimeMatch[3]),
      Number(dateTimeMatch[4]),
      Number(dateTimeMatch[5]),
      0,
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function chartTimestamp(result: LabResult): number {
  return parseChartDate(result)?.getTime() ?? 0;
}

export function chartDateKey(result: LabResult): string | null {
  const date = parseChartDate(result);
  if (!date) {
    return null;
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function exactDateLabel(result: LabResult): string {
  const date = parseChartDate(result);
  if (!date) {
    return "Brak daty";
  }
  return FULL_DATE_FORMATTER.format(date);
}

export function exactDateLabelFromKey(dateKey: string | null): string | null {
  if (!dateKey) {
    return null;
  }
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return dateKey;
  }
  return FULL_DATE_FORMATTER.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
}

export function chartLabel(result: LabResult, includeYear: boolean): string {
  const date = parseChartDate(result);
  if (!date) {
    return "Brak daty";
  }
  return (includeYear ? SHORT_DATE_WITH_YEAR_FORMATTER : SHORT_DATE_FORMATTER).format(date);
}

export function referenceLabel(result: LabResult): string {
  if (result.reference_low === null || result.reference_high === null) {
    return "Brak zakresu referencyjnego";
  }
  return `Zakres referencyjny: ${VALUE_FORMATTER.format(result.reference_low)} - ${VALUE_FORMATTER.format(result.reference_high)} ${result.unit ?? ""}`.trim();
}

export function pointStatus(result: LabResult): PointStatus {
  if (result.value === null || result.reference_low === null || result.reference_high === null) {
    return "no-range";
  }
  if (result.value < result.reference_low) {
    return "below-range";
  }
  if (result.value > result.reference_high) {
    return "above-range";
  }
  return "in-range";
}

export function statusLabel(status: PointStatus): string {
  switch (status) {
    case "below-range":
      return "Below range";
    case "above-range":
      return "Above range";
    case "in-range":
      return "Within range";
    case "no-range":
      return "No range";
  }
}

export function formatMetricValue(value: number | null, unit?: string | null): string {
  if (value === null) {
    return "No numeric result";
  }
  return `${VALUE_FORMATTER.format(value)} ${unit ?? ""}`.trim();
}

export function formatDeltaValue(delta: number | null, unit?: string | null): string {
  if (delta === null) {
    return "No baseline";
  }
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${VALUE_FORMATTER.format(delta)} ${unit ?? ""}`.trim();
}

export function formatPercentDelta(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  const delta = ((current - previous) / previous) * 100;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${VALUE_FORMATTER.format(delta)}%`;
}
