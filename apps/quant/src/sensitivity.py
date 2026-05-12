from __future__ import annotations

from common import read_payload, write_payload
from dcf import compute_dcf_value


def main() -> None:
    payload = read_payload()
    normalized_earnings = float(payload["normalized_earnings"])
    growth_rate = float(payload["growth_rate"])
    shares_outstanding = float(payload["shares_outstanding"])
    wacc_values = [float(value) for value in payload["wacc_values"]]
    terminal_growth_values = [
        float(value) for value in payload["terminal_growth_values"]
    ]
    rows = []
    for wacc in wacc_values:
        for terminal_growth in terminal_growth_values:
            rows.append(
                {
                    "wacc": wacc,
                    "terminal_growth": terminal_growth,
                    "fair_value": compute_dcf_value(
                        normalized_earnings,
                        growth_rate,
                        wacc,
                        terminal_growth,
                        shares_outstanding,
                    ),
                }
            )
    write_payload({"rows": rows})


if __name__ == "__main__":
    main()
