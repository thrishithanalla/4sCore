"""
Datetime helpers.
"""

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Naive UTC datetime for Mongo (no tzinfo)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
