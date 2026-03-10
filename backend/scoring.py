import json
import os

SCORING_KEY_PATH = os.path.join(os.path.dirname(__file__), "..", "scoring_key.json")

NORMS = {
    "Male": {
        "L":     {"mean": 3.31, "sd": 2.35},
        "F":     {"mean": 4.27, "sd": 3.55},
        "K":     {"mean": 15.31, "sd": 5.20},
        "1_Hs":  {"mean": 4.91, "sd": 3.56},
        "2_D":   {"mean": 17.50, "sd": 5.17},
        "3_Hy":  {"mean": 21.05, "sd": 4.81},
        "4_Pd":  {"mean": 15.41, "sd": 4.57},
        "5_Mf":  {"mean": 25.88, "sd": 5.04},
        "6_Pa":  {"mean": 9.48, "sd": 3.32},
        "7_Pt":  {"mean": 11.90, "sd": 7.15},
        "8_Sc":  {"mean": 11.29, "sd": 7.63},
        "9_Ma":  {"mean": 17.38, "sd": 4.51},
        "0_Si":  {"mean": 25.34, "sd": 9.62},
    },
    "Female": {
        "L":     {"mean": 3.22, "sd": 2.29},
        "F":     {"mean": 3.74, "sd": 3.18},
        "K":     {"mean": 15.02, "sd": 5.00},
        "1_Hs":  {"mean": 5.78, "sd": 3.99},
        "2_D":   {"mean": 19.33, "sd": 5.15},
        "3_Hy":  {"mean": 22.46, "sd": 4.84},
        "4_Pd":  {"mean": 15.40, "sd": 4.51},
        "5_Mf":  {"mean": 36.46, "sd": 4.50},
        "6_Pa":  {"mean": 9.66, "sd": 3.23},
        "7_Pt":  {"mean": 13.90, "sd": 7.66},
        "8_Sc":  {"mean": 12.82, "sd": 8.25},
        "9_Ma":  {"mean": 16.75, "sd": 4.54},
        "0_Si":  {"mean": 27.51, "sd": 9.44},
    },
}

# Map JSON scale keys to the canonical norm keys used throughout the app
SCALE_NORM_MAP = {
    "1_Hs": "1_Hs",
    "2_D": "2_D",
    "3_Hy": "3_Hy",
    "4_Pd": "4_Pd",
    "5_Mf_male": "5_Mf",
    "5_Mf_female": "5_Mf",
    "6_Pa": "6_Pa",
    "7_Pt": "7_Pt",
    "8_Sc": "8_Sc",
    "9_Ma": "9_Ma",
    "0_Si": "0_Si",
}


def load_scoring_key() -> dict:
    with open(SCORING_KEY_PATH, "r") as f:
        data = json.load(f)
    return data.get("MMPI_scoring_key", data)


def _count_scale(answers: dict[int, bool], scale_def: dict) -> int:
    """Count raw score for a scale given answer map {question_number: True/False}."""
    score = 0
    for item in scale_def.get("true_items", []):
        if answers.get(item) is True:
            score += 1
    for item in scale_def.get("false_items", []):
        if answers.get(item) is False:
            score += 1
    return score


def calculate_raw_scores(answers: dict[int, bool], gender: str) -> dict[str, float]:
    key = load_scoring_key()
    raw = {}

    for scale_name, scale_def in key["validity_scales"].items():
        raw[scale_name] = _count_scale(answers, scale_def)

    mf_key = "5_Mf_female" if gender == "Female" else "5_Mf_male"

    for scale_name, scale_def in key["clinical_scales"].items():
        # Pick the gender-appropriate Mf scale, skip the other
        if scale_name in ("5_Mf_male", "5_Mf_female"):
            if scale_name != mf_key:
                continue
            raw["5_Mf"] = _count_scale(answers, scale_def)
        else:
            raw[scale_name] = _count_scale(answers, scale_def)

    return raw


def apply_k_correction(raw_scores: dict[str, float], gender: str) -> dict[str, float]:
    key = load_scoring_key()
    raw_k = raw_scores.get("K", 0)
    corrected = dict(raw_scores)

    mf_key = "5_Mf_female" if gender == "Female" else "5_Mf_male"

    for scale_name, scale_def in key["clinical_scales"].items():
        if scale_name in ("5_Mf_male", "5_Mf_female") and scale_name != mf_key:
            continue

        factor = scale_def.get("k_correction_factor")
        if factor is None or factor == 0:
            continue

        norm_name = SCALE_NORM_MAP.get(scale_name, scale_name)
        if norm_name in corrected:
            corrected[norm_name] = corrected[norm_name] + (factor * raw_k)

    return corrected


def calculate_t_scores(k_corrected: dict[str, float], gender: str) -> dict[str, float]:
    """T = 50 + 10 * (Raw - Mean) / SD"""
    norms = NORMS.get(gender, NORMS["Male"])
    t_scores = {}

    for scale_name, corrected_val in k_corrected.items():
        norm = norms.get(scale_name)
        if norm and norm["sd"] > 0:
            t = 50 + 10 * (corrected_val - norm["mean"]) / norm["sd"]
            t_scores[scale_name] = round(t, 1)
        else:
            t_scores[scale_name] = round(corrected_val, 1)

    return t_scores


def full_scoring_pipeline(answers: dict[int, bool], gender: str) -> dict:
    raw_scores = calculate_raw_scores(answers, gender)
    k_corrected = apply_k_correction(raw_scores, gender)
    t_scores = calculate_t_scores(k_corrected, gender)

    return {
        "raw_scores": raw_scores,
        "k_corrected_scores": k_corrected,
        "t_scores": t_scores,
    }
