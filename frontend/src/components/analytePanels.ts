import type { AnalyteOption } from "../types";

export type SavedAnalytePanel = {
  key: string;
  label: string;
  description: string;
  values: string[];
  totalMatches: number;
};

const PANEL_DEFINITIONS = [
  {
    key: "hormones",
    label: "Hormones",
    description: "Sex hormones and thyroid markers",
    patterns: [
      "testosterone",
      "prolact",
      "estradi",
      "progester",
      "dhea",
      "cortisol",
      "shbg",
      "lh",
      "fsh",
      "tsh",
      "ft3",
      "ft4",
      "thyroid",
      "t3",
      "t4",
    ],
  },
  {
    key: "cbc",
    label: "CBC",
    description: "Blood count markers",
    patterns: [
      "leuko",
      "erytro",
      "hemoglobin",
      "hematokryt",
      "hematocrit",
      "mcv",
      "mch",
      "mchc",
      "rdw",
      "platelet",
      "płyt",
      "plt",
      "neut",
      "lymph",
      "mono",
      "eos",
      "baso",
      "mpv",
    ],
  },
  {
    key: "liver",
    label: "Liver",
    description: "Enzymes and bilirubin",
    patterns: ["alt", "ast", "ggt", "alp", "bilirubin", "albumin"],
  },
  {
    key: "metabolic",
    label: "Metabolic",
    description: "Glucose, insulin, lipids, kidney",
    patterns: [
      "glucose",
      "gluko",
      "insulin",
      "hba1c",
      "cholesterol",
      "ldl",
      "hdl",
      "trigly",
      "creatin",
      "kreatyn",
      "egfr",
      "urea",
      "kwas mocz",
      "uric",
    ],
  },
];

function analyteHaystack(analyte: AnalyteOption): string {
  return [analyte.analyte_display, analyte.analyte_key, analyte.unit, analyte.filter_key].join(" ").toLowerCase();
}

export function buildSavedPanels(analytes: AnalyteOption[], maxSelected: number): SavedAnalytePanel[] {
  return PANEL_DEFINITIONS.map((panel) => {
    const matches = analytes
      .filter((analyte) => panel.patterns.some((pattern) => analyteHaystack(analyte).includes(pattern)))
      .sort((left, right) => {
        if (right.result_count !== left.result_count) {
          return right.result_count - left.result_count;
        }
        return left.analyte_display.localeCompare(right.analyte_display, "pl");
      });

    return {
      key: panel.key,
      label: panel.label,
      description: panel.description,
      values: matches.slice(0, maxSelected).map((analyte) => analyte.filter_key),
      totalMatches: matches.length,
    };
  }).filter((panel) => panel.values.length >= 2);
}
