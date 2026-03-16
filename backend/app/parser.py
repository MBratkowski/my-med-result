from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime

from .normalization import normalize_result


NUMBER_PATTERN = r"-?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,]\d+)?"


STRICT_RESULT_PATTERNS = [
    re.compile(
        r"^(?P<label>.+?)(?:\s+\(ICD-9:[^)]+\))?\s+"
        rf"(?P<value>{NUMBER_PATTERN})\s+"
        r"(?P<unit>[A-Za-z%0-9/.*[\]-]+)\s+"
        rf"(?P<low>{NUMBER_PATTERN})\s*[-–]\s*(?P<high>{NUMBER_PATTERN})"
        r"(?:\s+(?P<flag>[HL]))?$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?P<label>.+?)\s+"
        rf"(?P<value>{NUMBER_PATTERN})\s+"
        r"(?P<unit>[A-Za-z%0-9/.*[\]-]+)\s+"
        rf"(?P<low>{NUMBER_PATTERN})\s+"
        rf"(?P<high>{NUMBER_PATTERN})"
        r"(?:\s+(?P<flag>[HL]))?$",
        re.IGNORECASE,
    ),
]

FALLBACK_PATTERN = re.compile(
    rf"^(?P<label>[A-Za-z0-9 /+_.%-]{{2,80}}?)\s+(?P<value>{NUMBER_PATTERN})"
    r"(?:\s+(?P<unit>[A-Za-z%0-9/.*[\]-]+))?",
    re.IGNORECASE,
)

EXCLUDED_PREFIXES = (
    "adres",
    "autoryzowal",
    "badanie wykonano",
    "brak uwag",
    "data ",
    "diagnostyka s.a.",
    "dok.",
    "dowiedz sie",
    "informacje",
    "laboratorium",
    "lekarz kierujacy",
    "medyczne laboratorium",
    "nr ksiegi",
    "odbiorca wyniku",
    "oddzial",
    "pacjent",
    "plec",
    "raport z badania",
    "sprawozdanie z badania",
    "strona:",
    "uwaga!",
    "wersja:",
    "wykonano :",
    "zlecajacy",
)


@dataclass(slots=True)
class ParsedResult:
    page_number: int
    original_label: str
    analyte_key: str | None
    analyte_display: str | None
    normalization_note: str | None
    value: float | None
    original_unit: str | None
    unit: str | None
    reference_low: float | None
    reference_high: float | None
    flag: str | None
    review_status: str
    raw_excerpt: str


@dataclass(slots=True)
class ParsedPage:
    page_number: int
    report_date: str | None
    collected_at: str | None
    lab_name: str | None
    results: list[ParsedResult]


def _clean_line(line: str) -> str:
    line = re.sub(r"\s+", " ", line.replace("\x0c", " ")).strip()
    return line


def _coerce_number(value: str | None) -> float | None:
    if not value:
        return None
    value = value.replace("\u00a0", "").replace(" ", "")
    value = value.replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return None


def _normalize_flag(flag: str | None) -> str | None:
    if not flag:
        return None
    flag = flag.strip().upper()
    return flag if flag in {"H", "L"} else None


def _looks_like_result_label(label: str) -> bool:
    label = label.strip()
    if len(label) < 2 or len(label) > 80:
        return False
    lowered = label.lower()
    if lowered.startswith(EXCLUDED_PREFIXES):
        return False
    if not re.search(r"[A-Za-z]", label):
        return False
    return True


def _compact_numeric_token(value: str | None) -> str | None:
    if not value:
        return None
    compact = value.replace("\u00a0", "").replace(" ", "").strip()
    return compact or None


def _decimal_places(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"[.,](\d+)", value)
    if not match:
        return 0
    return len(match.group(1))


def result_numeric_score(
    value: float | None,
    reference_low: float | None,
    reference_high: float | None,
    flag: str | None,
) -> float:
    score = 0.0
    if value is None:
        return -10.0
    score += 1.0

    if reference_low is None or reference_high is None:
        return score
    if reference_high < reference_low:
        return -10.0

    score += 1.0
    normalized_flag = _normalize_flag(flag)
    if normalized_flag == "L":
        score += 4.0 if value < reference_low else -4.0
        if value > 0 and reference_low > 0 and value < reference_low:
            score += max(0.0, 2.0 - abs(math.log10(reference_low / value)) * 2.0)
    elif normalized_flag == "H":
        score += 4.0 if value > reference_high else -4.0
        if value > 0 and reference_high > 0 and value > reference_high:
            score += max(0.0, 2.0 - abs(math.log10(value / reference_high)) * 2.0)
    elif reference_low <= value <= reference_high:
        score += 3.0

    if value > 0 and max(reference_low, reference_high) > 0:
        midpoint = (reference_low + reference_high) / 2
        ratio = midpoint / value
        if ratio > 500:
            score -= 6.0
        elif ratio > 100:
            score -= 4.0
        elif ratio > 50:
            score -= 2.0

    return score


def _reference_range_candidates(
    low_text: str | None,
    high_text: str | None,
    reference_low: float | None,
    reference_high: float | None,
) -> list[tuple[float, float]]:
    if reference_low is None or reference_high is None:
        return []

    candidates: list[tuple[float, float]] = [(reference_low, reference_high)]
    normalized_low = _compact_numeric_token(low_text)
    normalized_high = _compact_numeric_token(high_text)
    if not normalized_low or not normalized_high:
        return candidates
    if not re.fullmatch(r"-?\d{4,6}", normalized_low) or not re.fullmatch(r"-?\d{4,6}", normalized_high):
        return candidates
    if any(separator in normalized_low for separator in ",.") or any(separator in normalized_high for separator in ",."):
        return candidates

    low_base = float(int(normalized_low))
    high_base = float(int(normalized_high))
    for scale in (10.0, 100.0, 1000.0):
        low_candidate = low_base / scale
        high_candidate = high_base / scale
        if high_candidate >= low_candidate:
            candidates.append((low_candidate, high_candidate))
    return candidates


def _repair_reference_range(
    value: float | None,
    low_text: str | None,
    high_text: str | None,
    reference_low: float | None,
    reference_high: float | None,
    flag: str | None,
) -> tuple[float | None, float | None]:
    candidates = _reference_range_candidates(
        low_text=low_text,
        high_text=high_text,
        reference_low=reference_low,
        reference_high=reference_high,
    )
    if not candidates:
        return reference_low, reference_high

    best_low, best_high = candidates[0]
    best_score = result_numeric_score(value, best_low, best_high, flag)
    for candidate_low, candidate_high in candidates[1:]:
        candidate_score = result_numeric_score(value, candidate_low, candidate_high, flag)
        if candidate_score > best_score:
            best_low = candidate_low
            best_high = candidate_high
            best_score = candidate_score
    return best_low, best_high


def _value_candidates(
    value_text: str | None,
    numeric_value: float | None,
    low_text: str | None,
    high_text: str | None,
    reference_low: float | None,
    reference_high: float | None,
    flag: str | None,
) -> list[float]:
    if numeric_value is None:
        return []

    candidates = [numeric_value]
    compact_value = _compact_numeric_token(value_text)
    if not compact_value:
        return candidates
    if any(separator in compact_value for separator in ",."):
        return candidates
    if not re.fullmatch(r"\d{2,6}", compact_value):
        return candidates
    if _normalize_flag(flag) is not None:
        return candidates
    if reference_low is None or reference_high is None:
        return candidates
    if reference_high <= 0 or reference_high >= 20:
        return candidates
    if numeric_value <= reference_high:
        return candidates

    low_places = _decimal_places(low_text)
    high_places = _decimal_places(high_text)
    if low_places is None or high_places is None or low_places == 0 or high_places == 0:
        return candidates
    if low_places != high_places:
        return candidates

    scale = 10 ** low_places
    candidate = float(int(compact_value)) / scale
    if candidate != numeric_value:
        candidates.append(candidate)
    return candidates


def _repair_numeric_value(
    value_text: str | None,
    numeric_value: float | None,
    low_text: str | None,
    high_text: str | None,
    reference_low: float | None,
    reference_high: float | None,
    flag: str | None,
) -> tuple[float | None, bool]:
    candidates = _value_candidates(
        value_text=value_text,
        numeric_value=numeric_value,
        low_text=low_text,
        high_text=high_text,
        reference_low=reference_low,
        reference_high=reference_high,
        flag=flag,
    )
    if not candidates:
        return numeric_value, False

    best_value = candidates[0]
    best_score = result_numeric_score(best_value, reference_low, reference_high, flag)
    for candidate in candidates[1:]:
        candidate_score = result_numeric_score(candidate, reference_low, reference_high, flag)
        if candidate_score > best_score:
            best_value = candidate
            best_score = candidate_score

    repaired = best_value != numeric_value and best_score >= result_numeric_score(numeric_value, reference_low, reference_high, flag) + 2.0
    return best_value, repaired


def _parse_datetime(raw_value: str) -> str | None:
    raw_value = raw_value.strip()
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(raw_value, pattern).isoformat(timespec="minutes")
        except ValueError:
            continue
    return None


def _parse_date(raw_value: str) -> str | None:
    raw_value = raw_value.strip()
    for pattern in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(raw_value, pattern).date().isoformat()
        except ValueError:
            continue
    return None


def infer_report_date_from_relative_path(relative_path: str) -> str | None:
    match = re.search(r"(?:^|/)(\d{4}-\d{2}-\d{2})(?:/|$)", relative_path)
    if not match:
        return None
    return _parse_date(match.group(1))


def extract_report_date(text: str) -> str | None:
    patterns = [
        r"Data rejestracji:\s*(\d{4}-\d{2}-\d{2})",
        r"Data rej:\s*(\d{2}\.\d{2}\.\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return _parse_date(match.group(1))
    return None


def extract_collected_at(text: str) -> str | None:
    patterns = [
        r"Data/godz\.\s*pobrania:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})",
        r"Data pobrania\s*:?\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})",
        r"Data pobrania\s*:?\s*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return _parse_datetime(match.group(1))
    return None


def extract_lab_name(text: str) -> str | None:
    lines = [_clean_line(line) for line in text.splitlines()]
    for line in lines:
        if "MEDYCZNE LABORATORIUM DIAGNOSTYKA" in line.upper():
            return "Medyczne Laboratorium Diagnostyka"
    for line in lines:
        if "LABORATORIUM" in line.upper():
            return line
    for line in lines:
        if "DIAGNOSTYKA" in line.upper():
            return line
    return None


def _build_result(
    page_number: int,
    label: str,
    value: str | None,
    unit: str | None,
    low: str | None,
    high: str | None,
    flag: str | None,
    raw_excerpt: str,
) -> ParsedResult | None:
    cleaned_label = re.sub(r"\(ICD-9:[^)]+\)", "", label, flags=re.IGNORECASE).strip(" -")
    if not _looks_like_result_label(cleaned_label):
        return None

    numeric_value = _coerce_number(value)
    reference_low = _coerce_number(low)
    reference_high = _coerce_number(high)
    cleaned_unit = unit.strip() if unit else None
    normalized_result = normalize_result(
        original_label=cleaned_label,
        original_unit=cleaned_unit,
        reference_low=reference_low,
        reference_high=reference_high,
    )
    reference_low, reference_high = _repair_reference_range(
        value=numeric_value,
        low_text=low,
        high_text=high,
        reference_low=reference_low,
        reference_high=reference_high,
        flag=flag,
    )
    numeric_value, repaired_value = _repair_numeric_value(
        value_text=value,
        numeric_value=numeric_value,
        low_text=low,
        high_text=high,
        reference_low=reference_low,
        reference_high=reference_high,
        flag=flag,
    )

    review_status = normalized_result.review_status
    if numeric_value is None:
        review_status = "needs_review"

    normalization_note = normalized_result.normalization_note
    if repaired_value:
        repair_note = "Value decimal restored from OCR using the reference range."
        normalization_note = f"{normalization_note} {repair_note}".strip() if normalization_note else repair_note

    return ParsedResult(
        page_number=page_number,
        original_label=cleaned_label,
        analyte_key=normalized_result.analyte_key,
        analyte_display=normalized_result.analyte_display,
        normalization_note=normalization_note,
        value=numeric_value,
        original_unit=cleaned_unit,
        unit=normalized_result.unit,
        reference_low=reference_low,
        reference_high=reference_high,
        flag=_normalize_flag(flag),
        review_status=review_status,
        raw_excerpt=raw_excerpt,
    )


def parse_results(text: str, page_number: int) -> list[ParsedResult]:
    results: list[ParsedResult] = []
    seen_lines: set[str] = set()

    for raw_line in text.splitlines():
        line = _clean_line(raw_line)
        if not line or line in seen_lines:
            continue
        seen_lines.add(line)

        strict_match = None
        for pattern in STRICT_RESULT_PATTERNS:
            strict_match = pattern.match(line)
            if strict_match:
                break

        if strict_match:
            result = _build_result(
                page_number=page_number,
                label=strict_match.group("label"),
                value=strict_match.group("value"),
                unit=strict_match.group("unit"),
                low=strict_match.group("low"),
                high=strict_match.group("high"),
                flag=strict_match.groupdict().get("flag"),
                raw_excerpt=line,
            )
            if result:
                results.append(result)
            continue

        if "(ICD-9:" not in line and "/" not in line and "%" not in line:
            continue

        fallback_match = FALLBACK_PATTERN.match(line)
        if not fallback_match:
            continue

        result = _build_result(
            page_number=page_number,
            label=fallback_match.group("label"),
            value=fallback_match.group("value"),
            unit=fallback_match.group("unit"),
            low=None,
            high=None,
            flag=None,
            raw_excerpt=line,
        )
        if result:
            result.review_status = "needs_review"
            results.append(result)

    return results


def parse_page(text: str, page_number: int) -> ParsedPage:
    return ParsedPage(
        page_number=page_number,
        report_date=extract_report_date(text),
        collected_at=extract_collected_at(text),
        lab_name=extract_lab_name(text),
        results=parse_results(text, page_number),
    )
