from __future__ import annotations

from common import read_payload, write_payload


def main() -> None:
    payload = read_payload()
    fair_value = float(payload["fair_value_conservative"])
    result = {
        "mos_10": round(fair_value * 0.9, 2),
        "mos_20": round(fair_value * 0.8, 2),
        "mos_30": round(fair_value * 0.7, 2),
        "mos_40": round(fair_value * 0.6, 2),
    }
    write_payload(result)


if __name__ == "__main__":
    main()
