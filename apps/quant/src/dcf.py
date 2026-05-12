from __future__ import annotations

import math

from common import read_payload, write_payload

CALCULATION_ERROR = "CALCULATION_ERROR"


def validate_inputs(
    normalized_earnings: float,
    wacc: float,
    terminal_growth: float,
    shares_outstanding: float,
    growth_rate: float | None = None,
) -> None:
    values = [normalized_earnings, wacc, terminal_growth, shares_outstanding]
    if not all(math.isfinite(value) for value in values):
        raise ValueError(CALCULATION_ERROR)
    if shares_outstanding <= 0:
        raise ValueError(CALCULATION_ERROR)
    if wacc <= terminal_growth:
        raise ValueError(CALCULATION_ERROR)
    if growth_rate is not None and (growth_rate < -0.5 or growth_rate > 2.0):
        raise ValueError(CALCULATION_ERROR)


def compute_total_equity_value(
    normalized_earnings: float,
    growth_rate: float,
    wacc: float,
    terminal_growth: float,
) -> float:
    cash_flow = normalized_earnings
    present_value = 0.0
    for year in range(1, 11):
        cash_flow *= 1 + growth_rate
        present_value += cash_flow / ((1 + wacc) ** year)
    terminal_value = cash_flow * (1 + terminal_growth) / (wacc - terminal_growth)
    present_value += terminal_value / ((1 + wacc) ** 10)
    return present_value


def compute_dcf_value(
    normalized_earnings: float,
    growth_rate: float,
    wacc: float,
    terminal_growth: float,
    shares_outstanding: float,
) -> float:
    validate_inputs(
        normalized_earnings, wacc, terminal_growth, shares_outstanding, growth_rate
    )
    total_equity_value = compute_total_equity_value(
        normalized_earnings, growth_rate, wacc, terminal_growth
    )
    return round(total_equity_value / shares_outstanding, 2)


def main() -> None:
    payload = read_payload()
    try:
        normalized_earnings = float(payload["normalized_earnings"])
        growth_rates = payload.get("growth_rates", [0.06, 0.1, 0.14])
        wacc = float(payload["wacc"])
        terminal_growth = float(payload["terminal_growth"])
        shares_outstanding = float(payload["shares_outstanding"])
        result = {
            "fair_value_conservative": compute_dcf_value(
                normalized_earnings,
                float(growth_rates[0]),
                wacc,
                terminal_growth,
                shares_outstanding,
            ),
            "fair_value_base": compute_dcf_value(
                normalized_earnings,
                float(growth_rates[1]),
                wacc,
                terminal_growth,
                shares_outstanding,
            ),
            "fair_value_optimistic": compute_dcf_value(
                normalized_earnings,
                float(growth_rates[2]),
                wacc,
                terminal_growth,
                shares_outstanding,
            ),
        }
        write_payload(result)
    except (KeyError, TypeError, ValueError):
        write_payload({"error": CALCULATION_ERROR})


if __name__ == "__main__":
    main()
