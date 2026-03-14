from datetime import datetime, timedelta
from typing import Dict, Set, Tuple
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.time_utils import get_ist_now
from app.constants.collections import Collections

# Cache the canonical codes and a lowercase→canonical map
_CACHE_CODES: Dict[str, Set[str]] = {}
_CACHE_CANON: Dict[str, Dict[str, str]] = {}  # key -> {lower: canonical}
_TTL: Dict[str, datetime] = {}
_TTL_DELTA = timedelta(minutes=5)

async def _load_codes(db: AsyncIOMotorDatabase, key: str) -> Tuple[Set[str], Dict[str, str]]:
    vs = await db[Collections.VALUE_SETS].find_one({"key": key, "status": {"$ne": "archived"}})
    if not vs:
        return set(), {}
    canon_set = {i["code"] for i in vs.get("items", []) if i.get("active", True)}
    lower_map = {c.lower(): c for c in canon_set}
    return canon_set, lower_map

async def _ensure(db: AsyncIOMotorDatabase, key: str):
    now = get_ist_now()
    if key not in _TTL or _TTL[key] <= now:
        codes, cmap = await _load_codes(db, key)
        _CACHE_CODES[key] = codes
        _CACHE_CANON[key] = cmap
        _TTL[key] = now + _TTL_DELTA

async def normalize_code(db: AsyncIOMotorDatabase, key: str, incoming: str) -> str:
    """Return the canonical code from valueSets, accepting any case; raise if unknown."""
    await _ensure(db, key)
    canon = _CACHE_CANON[key].get((incoming or "").lower())
    if not canon:
        allowed = ", ".join(sorted(_CACHE_CODES.get(key, set()))) or "<none>"
        raise ValueError(f"Invalid {key}: '{incoming}'. Allowed: {allowed} (case-insensitive)")
    return canon

# Backward-compatible helper: still available if some code expects a boolean check
async def assert_allowed_code(db: AsyncIOMotorDatabase, key: str, code: str):
    # Now simply calls normalize to trigger the same behavior/exception text
    await normalize_code(db, key, code)


async def get_all_codes(db: AsyncIOMotorDatabase, key: str) -> Set[str]:
    """
    Get all canonical codes for a valueSet key.

    Args:
        db: Database connection
        key: ValueSet key (e.g., 'sourceType', 'errorSeverity')

    Returns:
        Set of canonical codes (e.g., {'API', 'SCREEN', 'THIRDPARTY', 'FUNCTION'})
    """
    await _ensure(db, key)
    return _CACHE_CODES.get(key, set())
