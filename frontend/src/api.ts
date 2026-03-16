import type {
  AnalyteOption,
  LabResult,
  ResultDetail,
  ReviewQueue,
  ReviewUpdate,
  ScanSummary,
} from "./types";

const API_ROOT = import.meta.env.VITE_API_BASE ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function scanDocuments(): Promise<ScanSummary> {
  return request<ScanSummary>("/api/import/scan", { method: "POST" });
}

export function getAnalytes(): Promise<AnalyteOption[]> {
  return request<AnalyteOption[]>("/api/analytes");
}

export function getResults(analyteKeys: string[], query = ""): Promise<LabResult[]> {
  const params = new URLSearchParams();
  for (const analyteKey of analyteKeys) {
    params.append("analyte_key", analyteKey);
  }
  if (query.trim()) {
    params.set("q", query.trim());
  }
  return request<LabResult[]>(`/api/results?${params.toString()}`);
}

export function getResult(resultId: number): Promise<ResultDetail> {
  return request<ResultDetail>(`/api/results/${resultId}`);
}

export function updateResult(resultId: number, payload: ReviewUpdate): Promise<ResultDetail> {
  return request<ResultDetail>(`/api/results/${resultId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getReviewQueue(): Promise<ReviewQueue> {
  return request<ReviewQueue>("/api/review/queue");
}
