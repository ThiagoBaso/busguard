import os
from datetime import datetime, timezone


def describe_communication(received_at: datetime | None) -> dict:
    try:
        stale_after = max(1, int(os.getenv('COMMUNICATION_STALE_SECONDS', '300')))
    except ValueError:
        stale_after = 300
    if received_at is None:
        return {'received_at': None, 'status': 'unknown', 'stale_after_seconds': stale_after}
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    age = (now - received_at).total_seconds()
    status = 'unknown' if age < -30 else 'stale' if age > stale_after else 'recent'
    return {'received_at': received_at.isoformat() + 'Z', 'status': status, 'stale_after_seconds': stale_after}
