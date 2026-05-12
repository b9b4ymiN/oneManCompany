from __future__ import annotations

from common import read_payload, write_payload


def compute_dcf_value(
    normalized_earnings: float, growth_rate: float, wacc: float, terminal_growth: float
) -> float:
    cash_flow = normalized_earnings
    present_value = 0.0
    for year in range(1, 11):
        cash_flow *= 1 + growth_rate
        present_value += cash_flow / ((1 + wacc) ** year)
    terminal_value = cash_flow * (1 + terminal_growth) / (wacc - terminal_growth)
    present_value += terminal_value / ((1 + wacc) ** 10)
    return round(present_value, 2)


def main() -> None:
    payload = read_payload()
    normalized_earnings = float(payload["normalized_earnings"])
    growth_rates = payload.get("growth_rates", [0.06, 0.1, 0.14])
    wacc = float(payload["wacc"])
    terminal_growth = float(payload["terminal_growth"])
    result = {
        "fair_value_conservative": compute_dcf_value(
            normalized_earnings, float(growth_rates[0]), wacc, terminal_growth
        ),
        "fair_value_base": compute_dcf_value(
            normalized_earnings, float(growth_rates[1]), wacc, terminal_growth
        ),
        "fair_value_optimistic": compute_dcf_value(
            normalized_earnings, float(growth_rates[2]), wacc, terminal_growth
        ),
    }
    write_payload(result)


if __name__ == "__main__":
    main()
