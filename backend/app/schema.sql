PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relative_path TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  lab_name TEXT,
  report_date TEXT,
  collected_at TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  skip_reason TEXT,
  last_scanned_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  original_label TEXT NOT NULL,
  analyte_key TEXT,
  analyte_display TEXT,
  normalization_note TEXT,
  value REAL,
  original_unit TEXT,
  unit TEXT,
  reference_low REAL,
  reference_high REAL,
  flag TEXT,
  review_status TEXT NOT NULL,
  raw_excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_results_document_id ON lab_results(document_id);
CREATE INDEX IF NOT EXISTS idx_results_review_status ON lab_results(review_status);
CREATE INDEX IF NOT EXISTS idx_results_analyte_key ON lab_results(analyte_key);
