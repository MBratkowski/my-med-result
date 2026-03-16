export type ScanSummary = {
  scanned: number;
  skipped_unchanged: number;
  updated: number;
  removed_documents: number;
  approved_results: number;
  review_results: number;
  skipped_documents: number;
  errored_documents: number;
};

export type AnalyteOption = {
  filter_key: string;
  analyte_key: string;
  analyte_display: string;
  unit: string;
  result_count: number;
};

export type LabResult = {
  id: number;
  document_id: number;
  page_number: number;
  original_label: string;
  analyte_key: string | null;
  analyte_display: string | null;
  normalization_note: string | null;
  value: number | null;
  original_unit: string | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  flag: string | null;
  review_status: "approved" | "needs_review";
  raw_excerpt: string;
  relative_path: string;
  lab_name: string | null;
  report_date: string | null;
  collected_at: string | null;
};

export type ResultDetail = LabResult & {
  document_status: "ready" | "needs_review" | "skipped" | "error";
  skip_reason: string | null;
  preview_url: string;
  file_url: string;
};

export type ReviewUpdate = {
  original_label?: string;
  analyte_display?: string;
  value?: number | null;
  original_unit?: string | null;
  unit?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  flag?: string | null;
  review_status?: "approved" | "needs_review";
};

export type DocumentSummary = {
  id: number;
  relative_path: string;
  sha256: string;
  lab_name: string | null;
  report_date: string | null;
  collected_at: string | null;
  page_count: number;
  status: "ready" | "needs_review" | "skipped" | "error";
  skip_reason: string | null;
};

export type ReviewQueue = {
  results: LabResult[];
  skipped_documents: DocumentSummary[];
};
