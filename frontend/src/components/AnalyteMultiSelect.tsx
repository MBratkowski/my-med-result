import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import type { AnalyteOption } from "../types";
import { buildSavedPanels } from "./analytePanels";

function formatAnalyteLabel(analyte: AnalyteOption): string {
  return `${analyte.analyte_display} (${analyte.unit})`;
}

const RECENT_ANALYTES_STORAGE_KEY = "med-result-recent-analytes";

function recentStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return null;
  }

  return storage;
}

function readRecentAnalytes(): string[] {
  const storage = recentStorage();
  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(RECENT_ANALYTES_STORAGE_KEY);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function AnalyteMultiSelect({
  analytes,
  selectedValues,
  onChange,
  maxSelected = 4,
}: {
  analytes: AnalyteOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  maxSelected?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentValues, setRecentValues] = useState<string[]>(() => readRecentAnalytes());
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const analyteKeys = new Set(analytes.map((analyte) => analyte.filter_key));
  const savedPanels = buildSavedPanels(analytes, maxSelected);

  const selectedAnalytes = selectedValues
    .map((value) => analytes.find((analyte) => analyte.filter_key === value))
    .filter((analyte): analyte is AnalyteOption => analyte !== undefined);

  const recentAnalytes = recentValues
    .filter((value) => analyteKeys.has(value))
    .map((value) => analytes.find((analyte) => analyte.filter_key === value))
    .filter((analyte): analyte is AnalyteOption => analyte !== undefined)
    .filter((analyte) => !selectedValues.includes(analyte.filter_key))
    .slice(0, 6);

  const filteredAnalytes = analytes.filter((analyte) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      analyte.analyte_display,
      analyte.analyte_key,
      analyte.unit,
      analyte.filter_key,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  useEffect(() => {
    const nextRecentValues = recentValues.filter((value) => analytes.some((analyte) => analyte.filter_key === value));
    if (nextRecentValues.length === recentValues.length) {
      return;
    }
    setRecentValues(nextRecentValues);
    const storage = recentStorage();
    if (storage) {
      storage.setItem(RECENT_ANALYTES_STORAGE_KEY, JSON.stringify(nextRecentValues));
    }
  }, [analytes, recentValues]);

  const closePicker = useEffectEvent(() => {
    setIsOpen(false);
    setQuery("");
  });

  const rememberValues = useEffectEvent((values: string[]) => {
    const nextRecentValues = [...values, ...recentValues.filter((value) => !values.includes(value))]
      .filter((value) => analyteKeys.has(value))
      .slice(0, 8);
    setRecentValues(nextRecentValues);
    const storage = recentStorage();
    if (storage) {
      storage.setItem(RECENT_ANALYTES_STORAGE_KEY, JSON.stringify(nextRecentValues));
    }
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!rootRef.current?.contains(target)) {
        closePicker();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePicker();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker]);

  function toggleValue(value: string) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }

    if (selectedValues.length >= maxSelected) {
      return;
    }

    rememberValues([value]);
    onChange([...selectedValues, value]);
  }

  function applyPanel(values: string[]) {
    rememberValues(values);
    onChange(values);
  }

  return (
    <div className="multi-select" ref={rootRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={isOpen ? "multi-select__trigger is-open" : "multi-select__trigger"}
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <span className="multi-select__trigger-copy">
          <span className="multi-select__trigger-label">Analytes</span>
          <span className="multi-select__trigger-value">
            {selectedValues.length === 0 ? "All approved results" : `${selectedValues.length} selected for comparison`}
          </span>
        </span>
        <span aria-hidden="true" className="multi-select__trigger-icon">
          {isOpen ? "▴" : "▾"}
        </span>
      </button>

      {selectedAnalytes.length > 0 ? (
        <div className="multi-select__chips" aria-label="Selected analytes">
          {selectedAnalytes.slice(0, 2).map((analyte) => (
            <button
              aria-label={`Remove ${formatAnalyteLabel(analyte)}`}
              className="multi-select__chip"
              key={analyte.filter_key}
              onClick={() => toggleValue(analyte.filter_key)}
              type="button"
            >
              <span>{formatAnalyteLabel(analyte)}</span>
              <span aria-hidden="true" className="multi-select__chip-remove">
                ×
              </span>
            </button>
          ))}
          {selectedAnalytes.length > 2 ? (
            <span className="multi-select__chip multi-select__chip--summary">{`+${selectedAnalytes.length - 2}`}</span>
          ) : null}
        </div>
      ) : null}

      {isOpen ? (
        <div className="multi-select__popover">
          {savedPanels.length > 0 ? (
            <div className="multi-select__section">
              <div className="multi-select__section-header">
                <strong>Saved panels</strong>
                <span>{`Quick-load up to ${maxSelected} markers`}</span>
              </div>
              <div className="multi-select__panel-list">
                {savedPanels.map((panel) => {
                  const isActive =
                    panel.values.length === selectedValues.length &&
                    panel.values.every((value, index) => value === selectedValues[index]);

                  return (
                    <button
                      className={isActive ? "multi-select__panel is-active" : "multi-select__panel"}
                      key={panel.key}
                      onClick={() => applyPanel(panel.values)}
                      type="button"
                    >
                      <span className="multi-select__panel-copy">
                        <strong>{panel.label}</strong>
                        <span>
                          {panel.totalMatches > panel.values.length
                            ? `${panel.description} · top ${panel.values.length} of ${panel.totalMatches}`
                            : `${panel.description} · ${panel.totalMatches} markers`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {recentAnalytes.length > 0 ? (
            <div className="multi-select__section">
              <div className="multi-select__section-header">
                <strong>Recent picks</strong>
                <span>Fast add from your last comparisons</span>
              </div>
              <div className="multi-select__quick-list">
                {recentAnalytes.map((analyte) => (
                  <button
                    className="multi-select__quick-chip"
                    key={analyte.filter_key}
                    onClick={() => toggleValue(analyte.filter_key)}
                    type="button"
                  >
                    {formatAnalyteLabel(analyte)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="multi-select__toolbar">
            <input
              aria-label="Filter analytes"
              className="multi-select__search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter analytes..."
              ref={searchRef}
              type="search"
              value={query}
            />
            <button
              className="multi-select__clear"
              disabled={selectedValues.length === 0}
              onClick={() => onChange([])}
              type="button"
            >
              Clear all
            </button>
          </div>

          <div className="multi-select__meta">
            <span>{`${selectedValues.length}/${maxSelected} selected`}</span>
            <span>{`Choose up to ${maxSelected} records`}</span>
          </div>

          <div
            aria-label="Analyte options"
            aria-multiselectable="true"
            className="multi-select__options"
            id={listboxId}
            role="listbox"
          >
            {filteredAnalytes.length === 0 ? (
              <div className="multi-select__empty">No analytes match this search.</div>
            ) : (
              filteredAnalytes.map((analyte) => {
                const isSelected = selectedValues.includes(analyte.filter_key);
                const isDisabled = !isSelected && selectedValues.length >= maxSelected;
                return (
                  <button
                    aria-disabled={isDisabled}
                    aria-selected={isSelected}
                    className={[
                      "multi-select__option",
                      isSelected ? "is-selected" : "",
                      isDisabled ? "is-disabled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={isDisabled}
                    key={analyte.filter_key}
                    onClick={() => toggleValue(analyte.filter_key)}
                    role="option"
                    type="button"
                  >
                    <span className="multi-select__option-copy">
                      <strong>{analyte.analyte_display}</strong>
                      <span>{`${analyte.unit} · ${analyte.result_count} results`}</span>
                    </span>
                    <span aria-hidden="true" className="multi-select__option-check">
                      {isSelected ? "Selected" : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
