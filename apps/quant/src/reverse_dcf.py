from __future__ import annotations

from common import read_payload, write_payload
from dcf import compute_dcf_value


def implied_growth(
    current_price: float,
    normalized_earnings: float,
    wacc: float,
    terminal_growth: float,
) -> float:
    low = -0.5
    high = 0.8
    for _ in range(80):
        mid = (low + high) / 2
        value = compute_dcf_value(normalized_earnings, mid, wacc, terminal_growth)
        if value > current_price:
            high = mid
        else:
            low = mid
    return round((low + high) / 2, 6)


def main() -> None:
    payload = read_payload()
    result = {
        "implied_growth_rate": implied_growth(
            float(payload["current_price"]),
            float(payload["normalized_earnings"]),
            float(payload["wacc"]),
            float(payload["terminal_growth"]),
        )
    }
    write_payload(result)


if __name__ == "__main__":
    main()
