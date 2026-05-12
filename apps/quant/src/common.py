from __future__ import annotations

import json
import sys
from typing import Any, cast


def read_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    return cast(dict[str, Any], json.loads(raw))


def write_payload(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload))
