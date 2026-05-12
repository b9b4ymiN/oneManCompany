from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"


def run_script(name: str, payload: dict[str, object]) -> dict[str, object]:
    proc = subprocess.run(
        ["python3", str(ROOT / name)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout)


def test_dcf_known_value() -> None:
    result = run_script(
        "dcf.py",
        {
            "normalized_earnings": 400,
            "growth_rates": [0.1, 0.1, 0.1],
            "wacc": 0.09,
            "terminal_growth": 0.03,
        },
    )
    assert abs(float(result["fair_value_conservative"]) - 11730.78) < 1


def test_reverse_dcf() -> None:
    result = run_script(
        "reverse_dcf.py",
        {
            "current_price": 11730.78,
            "normalized_earnings": 400,
            "wacc": 0.09,
            "terminal_growth": 0.03,
        },
    )
    assert abs(float(result["implied_growth_rate"]) - 0.1) < 0.01


def test_mos_table() -> None:
    result = run_script("mos_table.py", {"fair_value_conservative": 100})
    assert result == {"mos_10": 90.0, "mos_20": 80.0, "mos_30": 70.0, "mos_40": 60.0}


def test_sensitivity_matrix() -> None:
    result = run_script(
        "sensitivity.py",
        {
            "normalized_earnings": 400,
            "growth_rate": 0.1,
            "wacc_values": [0.08, 0.09],
            "terminal_growth_values": [0.02, 0.03],
        },
    )
    assert len(result["rows"]) == 4


def test_normalizer() -> None:
    result = run_script(
        "normalizer.py",
        {
            "reported_profit": 450,
            "operating_cash_flow": 495,
            "one_off_items": [{"item": "gain", "amount": 50}],
        },
    )
    assert result["normalized_earnings"] == 400.0
    assert abs(float(result["cashflow_quality_score"]) - 1.1) < 0.0001
