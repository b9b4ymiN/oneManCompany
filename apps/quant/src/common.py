from __future__ import annotations

import json
import sys
from typing import Any, cast

MAX_PAYLOAD_BYTES = 100_000


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read(MAX_PAYLOAD_BYTES + 1).strip()
    if len(raw) > MAX_PAYLOAD_BYTES:
        raise ValueError("CALCULATION_ERROR")
    if not raw:
        return {}
    return cast(dict[str, Any], json.loads(raw))


def write_payload(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
