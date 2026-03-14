"""
Mongo helpers (ObjectId parsing).
"""

from bson import ObjectId

def parse_object_id(value: str) -> ObjectId:
    """Parse hex string → ObjectId or raise ValueError."""
    try:
        return ObjectId(value)
    except Exception as exc:
        raise ValueError("must be a valid ObjectId hex string") from exc
