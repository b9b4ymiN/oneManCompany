from __future__ import annotations

from common import read_payload, write_payload


def main() -> None:
    payload = read_payload()
    reported_profit = float(payload["reported_profit"])
    operating_cash_flow = float(payload["operating_cash_flow"])
    one_off_items = payload.get("one_off_items", [])
    total_one_off = sum(float(item["amount"]) for item in one_off_items)
    normalized_earnings = reported_profit - total_one_off
    cashflow_quality_score = (
        round(operating_cash_flow / reported_profit, 4) if reported_profit else 0.0
    )
    write_payload(
        {
            "normalized_earnings": round(normalized_earnings, 2),
            "cashflow_quality_score": cashflow_quality_score,
            "stripped_items": [
                {"item": str(item["item"]), "amount": float(item["amount"])}
                for item in one_off_items
            ],
        }
    )


if __name__ == "__main__":
    main()
