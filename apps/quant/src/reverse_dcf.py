from __future__ import annotations

from common import read_payload, write_payload
from dcf import CALCULATION_ERROR, compute_dcf_value, validate_inputs


def implied_growth(
    current_price_per_share: float,
    normalized_earnings: float,
    wacc: float,
    terminal_growth: float,
    shares_outstanding: float,
) -> float:
    validate_inputs(normalized_earnings, wacc, terminal_growth, shares_outstanding)
    if current_price_per_share <= 0:
        raise ValueError(CALCULATION_ERROR)
    low = -0.2
    high = 2.0
    for _ in range(80):
        mid = (low + high) / 2
        value_per_share = compute_dcf_value(
            normalized_earnings,
            mid,
            wacc,
            terminal_growth,
            shares_outstanding,
        )
        if value_per_share > current_price_per_share:
            high = mid
        else:
            low = mid
    return round((low + high) / 2, 6)


def main() -> None:
    payload = read_payload()
    try:
        rate = implied_growth(
            float(payload["current_price"]),
            float(payload["normalized_earnings"]),
            float(payload["wacc"]),
            float(payload["terminal_growth"]),
            float(payload["shares_outstanding"]),
        )
        write_payload({"implied_growth_rate": rate})
    except (KeyError, TypeError, ValueError):
        write_payload({"error": CALCULATION_ERROR})


if __name__ == "__main__":
    main()
