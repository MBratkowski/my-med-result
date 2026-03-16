import re
import unicodedata
from dataclasses import dataclass


CANONICAL_LABELS: dict[str, tuple[str, str]] = {
    "acth": ("acth", "ACTH"),
    "afp": ("afp", "AFP"),
    "alkaline phosphatase": ("alkaline_phosphatase", "Fosfataza zasadowa"),
    "alt": ("alt", "ALT"),
    "aptt": ("aptt", "APTT"),
    "ast": ("ast", "AST"),
    "bazofile": ("basophils", "Bazofile"),
    "ca 19 9": ("ca_19_9", "CA 19-9"),
    "cholesterol calkowity": ("cholesterol_total", "Cholesterol calkowity"),
    "cholesterol catkowity": ("cholesterol_total", "Cholesterol calkowity"),
    "crp": ("crp", "CRP"),
    "eozynofile": ("eosinophils", "Eozynofile"),
    "erytrocyty": ("red_blood_cells", "Erytrocyty"),
    "fosfataza zasadowa": ("alkaline_phosphatase", "Fosfataza zasadowa"),
    "fsh": ("fsh", "FSH"),
    "ft3": ("ft3", "FT3"),
    "ft4": ("ft4", "FT4"),
    "ggtp": ("ggtp", "GGTP"),
    "glukoza": ("glucose", "Glukoza"),
    "hematokryt": ("hematocrit", "Hematokryt"),
    "hemoglobina": ("hemoglobin", "Hemoglobina"),
    "igf 1": ("igf_1", "IGF-1"),
    "insulina": ("insulin", "Insulina"),
    "kreatynina": ("creatinine", "Kreatynina"),
    "leukocyty": ("white_blood_cells", "Leukocyty"),
    "lh": ("lh", "LH"),
    "limfocyty": ("lymphocytes", "Limfocyty"),
    "mch": ("mch", "MCH"),
    "mchc": ("mchc", "MCHC"),
    "mcv": ("mcv", "MCV"),
    "monocyty": ("monocytes", "Monocyty"),
    "mpv": ("mpv", "MPV"),
    "neutrofile": ("neutrophils", "Neutrofile"),
    "ob": ("ob", "OB"),
    "pct": ("pct", "PCT"),
    "pdw": ("pdw", "PDW"),
    "p lcr": ("p_lcr", "P-LCR"),
    "plytki krwi": ("platelets", "Plytki krwi"),
    "phytki krwi": ("platelets", "Plytki krwi"),
    "prolaktyna": ("prolactin", "Prolaktyna"),
    "prolaktyna 7": ("prolactin", "Prolaktyna"),
    "psa calkowity": ("psa_total", "PSA calkowity"),
    "psa catkowity": ("psa_total", "PSA calkowity"),
    "rdw cv": ("rdw_cv", "RDW-CV"),
    "rdw sd": ("rdw_sd", "RDW-SD"),
    "shbg": ("shbg", "SHBG"),
    "sod": ("sodium", "Sod"),
    "testosteron 1": ("testosterone_total", "Testosteron"),
    "testosteron": ("testosterone_total", "Testosteron"),
    "testosteron wolny": ("testosterone_free", "Testosteron wolny"),
    "tsh": ("tsh", "TSH"),
    "witamina d": ("vitamin_d", "Witamina D"),
    "zelazo": ("iron", "Zelazo"),
}

ENZYME_KEYS = {"alt", "ast", "ggtp", "alkaline_phosphatase"}
COUNT_KEYS = {
    "basophils",
    "eosinophils",
    "lymphocytes",
    "monocytes",
    "neutrophils",
    "niedojrzale_granulocyty_ig_il",
    "nrbc",
    "platelets",
    "white_blood_cells",
}
PERCENT_UNIT_KEYS = {"basophils", "eosinophils", "lymphocytes", "monocytes", "neutrophils"}
SIMPLE_UNIT_MAP = {
    "%": "%",
    "fl": "fl",
    "g_dl": "g/dl",
    "godz": "godz.",
    "mg_dl": "mg/dl",
    "mg_l": "mg/l",
    "mm_h": "mm/h",
    "mmol_1": "mmol/l",
    "mmol_i": "mmol/l",
    "mmol_l": "mmol/l",
    "ng_dl": "ng/dl",
    "ng_ml": "ng/ml",
    "nmol_l": "nmol/l",
    "pg": "pg",
    "pg_ml": "pg/ml",
    "piu_ml": "uIU/ml",
    "ps": "pg",
    "pu_ml": "uIU/ml",
    "uiu_ml": "uIU/ml",
    "ulu_ml": "uIU/ml",
    "mlu_ml": "mIU/ml",
    "miu_ml": "mIU/ml",
    "tys_ul": "tys/ul",
    "u_1": "U/L",
    "u_l": "U/L",
    "u_ml": "U/ml",
    "ug_dl": "ug/dl",
}

GENERIC_REVIEW_LABELS = {"cukrzyca", "glukoza po", "ponizej", "wynik badania"}
FERRITIN_SAFE_UNITS = {"ng/ml", "ug/l"}


@dataclass(slots=True)
class NormalizedResult:
    analyte_key: str | None
    analyte_display: str | None
    unit: str | None
    review_status: str
    normalization_note: str | None


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character))


def normalize_label(label: str) -> str:
    cleaned = _strip_accents(label or "")
    cleaned = re.sub(r"\(icd-9:[^)]+\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("_", " ")
    cleaned = re.sub(r"[^A-Za-z0-9%+\-./ ]+", " ", cleaned)
    cleaned = cleaned.replace("-", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    return cleaned


def canonicalize_analyte(label: str) -> tuple[str | None, str | None]:
    normalized = normalize_label(label)
    if not normalized:
        return None, None

    if normalized in CANONICAL_LABELS:
        return CANONICAL_LABELS[normalized]

    sanitized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    if not sanitized:
        return None, None

    display = " ".join(part.capitalize() for part in normalized.split(" "))
    return sanitized, display


def normalize_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    cleaned = _strip_accents(unit)
    cleaned = cleaned.replace("µ", "u").replace("μ", "u")
    cleaned = cleaned.replace("]", "").replace("*", "").strip()
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned or None


def _unit_key(unit: str | None) -> str:
    normalized = normalize_unit(unit) or ""
    return re.sub(r"[^a-z0-9]+", "_", normalized.lower()).strip("_")


def canonicalize_unit(
    analyte_key: str | None,
    analyte_label: str | None,
    unit: str | None,
) -> str | None:
    normalized_unit = normalize_unit(unit)
    if not normalized_unit:
        return None

    resolved_analyte_key = analyte_key or canonicalize_analyte(analyte_label or "")[0]
    unit_key = _unit_key(normalized_unit)

    if resolved_analyte_key in ENZYME_KEYS and unit_key in {"u", "ui", "u_l", "u_1"}:
        return "U/L"

    if resolved_analyte_key in COUNT_KEYS and unit_key in {"tys_pl", "tys_ul"}:
        return "tys/ul"

    if resolved_analyte_key in PERCENT_UNIT_KEYS and unit_key == "y":
        return "%"

    if unit_key in SIMPLE_UNIT_MAP:
        return SIMPLE_UNIT_MAP[unit_key]

    return normalized_unit


def _is_sodium_like_range(reference_low: float | None, reference_high: float | None) -> bool:
    if reference_low is None or reference_high is None:
        return False
    return 120 <= reference_low <= 140 and 140 <= reference_high <= 155


def _is_iron_like_range(reference_low: float | None, reference_high: float | None) -> bool:
    if reference_low is None or reference_high is None:
        return False
    return 20 <= reference_low <= 60 and 120 <= reference_high <= 250


def normalize_result(
    original_label: str,
    original_unit: str | None,
    reference_low: float | None,
    reference_high: float | None,
) -> NormalizedResult:
    cleaned_label = original_label.strip()
    normalized_label = normalize_label(cleaned_label)
    normalized_unit = normalize_unit(original_unit)
    note_parts: list[str] = []
    label_note: str | None = None

    if normalized_label in GENERIC_REVIEW_LABELS:
        return NormalizedResult(
            analyte_key=None,
            analyte_display=None,
            unit=canonicalize_unit(None, cleaned_label, normalized_unit),
            review_status="needs_review",
            normalization_note="Generic OCR label requires manual review.",
        )

    if normalized_unit and re.fullmatch(r"\d+(?:[.,]\d+)?", normalized_unit):
        return NormalizedResult(
            analyte_key=None,
            analyte_display=None,
            unit=None,
            review_status="needs_review",
            normalization_note="OCR produced an invalid numeric unit and requires manual review.",
        )

    analyte_key: str | None = None
    analyte_display: str | None = None

    if normalized_label == "sed" and normalized_unit is not None and normalized_unit.lower() == "mmol/l" and _is_sodium_like_range(reference_low, reference_high):
        analyte_key, analyte_display = "sodium", "Sod"
        label_note = "Label normalized from OCR spillover to Sod."
    elif re.fullmatch(r"testosteron \d+", normalized_label):
        analyte_key, analyte_display = "testosterone_total", "Testosteron"
        label_note = "Label normalized from OCR spillover to Testosteron."
    elif re.fullmatch(r"prolaktyna \d+", normalized_label):
        analyte_key, analyte_display = "prolactin", "Prolaktyna"
        label_note = "Label normalized from OCR spillover to Prolaktyna."
    else:
        analyte_key, analyte_display = canonicalize_analyte(cleaned_label)

    if label_note is None and analyte_display is not None and normalized_label != normalize_label(analyte_display):
        label_note = f"Label normalized to {analyte_display}."
    if label_note is not None:
        note_parts.append(label_note)

    unit = canonicalize_unit(analyte_key, analyte_display or cleaned_label, normalized_unit)
    if normalized_unit and unit and normalized_unit != unit:
        note_parts.append(f"Unit normalized to {unit}.")

    review_status = "approved"

    if analyte_key == "ferrytyna" and unit not in FERRITIN_SAFE_UNITS:
        review_status = "needs_review"
        note_parts.append("Ferritin unit is ambiguous and requires manual review.")

    if analyte_key == "dhea_so4" and unit == "g/dl":
        review_status = "needs_review"
        note_parts.append("DHEA-SO4 unit is implausible and requires manual review.")

    if analyte_key == "iron" and unit == "g/dl" and _is_iron_like_range(reference_low, reference_high):
        unit = "ug/dl"
        note_parts.append("Unit normalized to ug/dl from OCR error.")

    if analyte_key is None or unit is None:
        review_status = "needs_review"
        if not note_parts:
            note_parts.append("Result requires manual review.")

    return NormalizedResult(
        analyte_key=analyte_key,
        analyte_display=analyte_display,
        unit=unit,
        review_status=review_status,
        normalization_note=" ".join(dict.fromkeys(note_parts)) or None,
    )
