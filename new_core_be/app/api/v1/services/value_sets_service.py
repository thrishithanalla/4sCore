"""
ValueSets Service Module
Provides centralized business logic for enum/value set management with caching
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Set, Tuple, Iterable
from bson import ObjectId
from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.utils.validators import validate_unique_constraint, validate_module_exists
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error
from app.constants.collections import Collections
from app.api.v1.schemas.value_sets_schema import ValueSetCreateSchema, ValueSetUpdateSchema

logger = logging.getLogger(__name__)


# ============================================================================
# In-memory Cache with TTL
# ============================================================================

class ValueSetCache:
    """Simple in-memory cache with 10-minute TTL"""

    def __init__(self, ttl_minutes: int = 10):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._timestamps: Dict[str, datetime] = {}
        self.ttl_minutes = ttl_minutes

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cached value if not expired"""
        if key not in self._cache:
            return None

        # Check if expired
        if get_ist_now() - self._timestamps[key] > timedelta(minutes=self.ttl_minutes):
            self._cache.pop(key, None)
            self._timestamps.pop(key, None)
            return None

        return self._cache[key]

    def set(self, key: str, value: Dict[str, Any]) -> None:
        """Set cache value with current timestamp"""
        self._cache[key] = value
        self._timestamps[key] = get_ist_now()

    def delete(self, key: str) -> None:
        """Remove key from cache"""
        self._cache.pop(key, None)
        self._timestamps.pop(key, None)

    def clear(self) -> int:
        """Clear all cache entries and return count"""
        count = len(self._cache)
        self._cache.clear()
        self._timestamps.clear()
        return count

    def get_all_keys(self) -> List[str]:
        """Get all cached keys"""
        return list(self._cache.keys())


# Global cache instance
_value_set_cache = ValueSetCache(ttl_minutes=10)


# ============================================================================
# Helper Functions
# ============================================================================

def convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    if not document:
        return document

    # Convert _id
    if "_id" in document:
        document["_id"] = str(document["_id"])

    # Convert ObjectId fields
    objectid_fields = ["createdBy", "updatedBy"]
    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    datetime_fields = ["createdAt", "updatedAt"]
    for field in datetime_fields:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


def _resolve_labels(items: List[Dict], lang: str = "en") -> List[Dict[str, str]]:
    """
    Resolve item labels to target language with fallback to English
    Returns: [{"code": "...", "label": "..."}]
    """
    resolved = []
    for item in items:
        code = item.get("code", "")
        labels = item.get("labels", {})

        # Try target language, fallback to English
        label = labels.get(lang, labels.get("en", code))

        resolved.append({"code": code, "label": label})

    return resolved


async def _load_value_set_to_cache(key: str, db) -> Optional[Dict]:
    """Load a value set from DB and populate cache"""
    value_set = await db[Collections.VALUE_SETS].find_one({
        "key": key,
        "isDelete": False,
        "isActive": True
    })

    if not value_set:
        return None

    # Build cache entry
    items_by_code = {item["code"]: item for item in value_set.get("items", [])}

    cache_entry = {
        "key": key,
        "isActive": value_set.get("isActive", True),
        "isDelete": value_set.get("isDelete", False),
        "items": value_set.get("items", []),
        "itemsByCode": items_by_code,
        "resolved_en": _resolve_labels(value_set.get("items", []), "en"),
    }

    _value_set_cache.set(key, cache_entry)
    return cache_entry


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_value_set(data: ValueSetCreateSchema, current_user_id: str, client_ip: Optional[str] = None) -> dict:
    """
    Create a new value set

    Args:
        data: Value set creation schema
        current_user_id: ID of the user creating the record
        client_ip: IP address of the client making the request

    Returns:
        Created value set document

    Raises:
        HTTPException: If validation fails or key already exists
    """
    db = get_database()

    # Validate unique constraint for key (check against all records including deleted)
    await validate_unique_constraint(
        db,
        Collections.VALUE_SETS,
        {"key": data.key},
        exclude_id=None,
        include_deleted=True
    )

    # Validate module exists (if provided)
    if data.module:
        await validate_module_exists(db, data.module, "module")

    # Prepare document
    value_set_dict = data.model_dump()
    value_set_dict["createdBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    value_set_dict["createdAt"] = get_ist_now()
    if client_ip:
        value_set_dict["createdIp"] = client_ip
    value_set_dict["isActive"] = True
    value_set_dict["isDelete"] = False

    # Insert into database
    try:
        result = await db[Collections.VALUE_SETS].insert_one(value_set_dict)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="key")
        )

    created_value_set = await db[Collections.VALUE_SETS].find_one({"_id": result.inserted_id})

    # Invalidate cache
    _value_set_cache.delete(data.key)

    return convert_objectid_to_str(created_value_set)


async def get_value_set(value_set_id: str) -> Optional[dict]:
    """
    Get a value set by ID (includes soft-deleted records)

    Args:
        value_set_id: The value set ID

    Returns:
        Value set document or None
    """
    db = get_database()

    if not ObjectId.is_valid(value_set_id):
        return None

    value_set = await db[Collections.VALUE_SETS].find_one({"_id": ObjectId(value_set_id)})

    if value_set:
        return convert_objectid_to_str(value_set)

    return None


async def get_value_set_by_key(key: str, lang: str = "en") -> Optional[dict]:
    """
    Get a value set by key with resolved labels

    Args:
        key: Value set key
        lang: Language code for labels (default: "en")

    Returns:
        Value set document with resolved labels or None
    """
    db = get_database()

    value_set = await db[Collections.VALUE_SETS].find_one({"key": key})

    if not value_set:
        return None

    # Convert ObjectIds
    value_set = convert_objectid_to_str(value_set)

    # Resolve labels if language specified
    if lang and value_set.get("items"):
        value_set["items"] = _resolve_labels(value_set["items"], lang)

    return value_set


async def update_value_set(value_set_id: str, update_data: dict, current_user_id: str, client_ip: Optional[str] = None) -> dict:
    """
    Update a value set record

    Args:
        value_set_id: The value set ID to update
        update_data: Fields to update
        current_user_id: ID of the user performing update
        client_ip: IP address of the client making the request

    Returns:
        Updated value set document

    Raises:
        HTTPException: If validation fails or value set not found
    """
    db = get_database()

    if not ObjectId.is_valid(value_set_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="value_set_id")
        )

    object_id = ObjectId(value_set_id)

    # Check if value set exists and not deleted
    existing = await db[Collections.VALUE_SETS].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("value_set_not_found_or_deleted")
        )

    # Filter out None values (except updatedIp which we handle separately)
    filtered_update = {k: v for k, v in update_data.items() if v is not None and k != "updatedIp"}

    if not filtered_update:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("no_fields_to_update")
        )

    # Validate unique constraint for key if it's being updated (check against all records including deleted)
    if "key" in filtered_update and filtered_update["key"] != existing.get("key"):
        await validate_unique_constraint(
            db,
            Collections.VALUE_SETS,
            {"key": filtered_update["key"]},
            exclude_id=value_set_id,
            include_deleted=True
        )

    # Validate module exists (if being updated)
    if "module" in filtered_update:
        await validate_module_exists(db, filtered_update["module"], "module")

    # Convert items to dict format if present
    if "items" in filtered_update and filtered_update["items"]:
        filtered_update["items"] = [
            item.model_dump() if hasattr(item, 'model_dump') else item
            for item in filtered_update["items"]
        ]

    # Set updatedBy, updatedAt, and updatedIp
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()
    if client_ip:
        filtered_update["updatedIp"] = client_ip

    # Update in database
    old_key = existing.get("key")
    try:
        await db[Collections.VALUE_SETS].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="key")
        )

    updated_value_set = await db[Collections.VALUE_SETS].find_one({"_id": object_id})

    # Invalidate cache for old and new keys
    _value_set_cache.delete(old_key)
    if "key" in filtered_update:
        _value_set_cache.delete(filtered_update["key"])

    return convert_objectid_to_str(updated_value_set)


async def update_value_set_by_key(key: str, update_data: dict, current_user_id: str, client_ip: Optional[str] = None) -> dict:
    """
    Update a value set record by key

    Args:
        key: The value set key to update
        update_data: Fields to update
        current_user_id: ID of the user performing update
        client_ip: IP address of the client making the request

    Returns:
        Updated value set document

    Raises:
        HTTPException: If validation fails or value set not found
    """
    db = get_database()

    # Check if value set exists and not deleted (case insensitive)
    existing = await db[Collections.VALUE_SETS].find_one({
        "key": {"$regex": f"^{key}$", "$options": "i"},
        "isDelete": False
    })
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("value_set_not_found_or_deleted")
        )

    object_id = existing["_id"]

    # Filter out None values (except updatedIp which we handle separately)
    filtered_update = {k: v for k, v in update_data.items() if v is not None and k != "updatedIp"}

    if not filtered_update:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("no_fields_to_update")
        )

    # Validate unique constraint for key if it's being updated (check against all records including deleted)
    if "key" in filtered_update and filtered_update["key"].lower() != existing.get("key", "").lower():
        await validate_unique_constraint(
            db,
            Collections.VALUE_SETS,
            {"key": filtered_update["key"]},
            exclude_id=str(object_id),
            include_deleted=True
        )

    # Validate module exists (if being updated)
    if "module" in filtered_update:
        await validate_module_exists(db, filtered_update["module"], "module")

    # Convert items to dict format if present
    if "items" in filtered_update and filtered_update["items"]:
        filtered_update["items"] = [
            item.model_dump() if hasattr(item, 'model_dump') else item
            for item in filtered_update["items"]
        ]

    # Set updatedBy, updatedAt, and updatedIp
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()
    if client_ip:
        filtered_update["updatedIp"] = client_ip

    # Update in database
    old_key = existing.get("key")
    try:
        await db[Collections.VALUE_SETS].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="key")
        )

    updated_value_set = await db[Collections.VALUE_SETS].find_one({"_id": object_id})

    # Invalidate cache for old and new keys
    _value_set_cache.delete(old_key)
    if "key" in filtered_update:
        _value_set_cache.delete(filtered_update["key"])

    return convert_objectid_to_str(updated_value_set)


async def delete_value_set_by_key(key: str, current_user_id: str, client_ip: Optional[str] = None) -> bool:
    """
    Soft delete a value set record by key

    Args:
        key: The value set key to delete
        current_user_id: ID of the user performing delete
        client_ip: IP address of the client making the request

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If value set not found
    """
    db = get_database()

    # Check if value set exists and not already deleted (case insensitive)
    existing = await db[Collections.VALUE_SETS].find_one({
        "key": {"$regex": f"^{key}$", "$options": "i"},
        "isDelete": False
    })
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("value_set_not_found_or_deleted")
        )

    object_id = existing["_id"]

    # Soft delete
    await db[Collections.VALUE_SETS].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
                "updatedAt": get_ist_now(),
                "updatedIp": client_ip
            }
        }
    )

    # Invalidate cache
    _value_set_cache.delete(existing.get("key"))

    return True


async def restore_value_set_by_key(key: str, current_user_id: str, client_ip: Optional[str] = None) -> bool:
    """
    Restore a soft-deleted value set record by key

    Args:
        key: The value set key to restore
        current_user_id: ID of the user performing restore
        client_ip: IP address of the client making the request

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If value set not found or not deleted
    """
    db = get_database()

    # Check if value set exists and is deleted (case insensitive)
    existing = await db[Collections.VALUE_SETS].find_one({
        "key": {"$regex": f"^{key}$", "$options": "i"},
        "isDelete": True
    })
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("value_set_not_found_or_not_deleted")
        )

    object_id = existing["_id"]

    # Restore (only set isDelete=False, isActive should be managed separately)
    await db[Collections.VALUE_SETS].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": False,
                "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
                "updatedAt": get_ist_now(),
                "updatedIp": client_ip
            }
        }
    )

    return True


async def delete_value_set(value_set_id: str, current_user_id: str, client_ip: Optional[str] = None) -> bool:
    """
    Soft delete a value set record

    Args:
        value_set_id: The value set ID to delete
        current_user_id: ID of the user performing delete
        client_ip: IP address of the client making the request

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If value set not found
    """
    db = get_database()

    if not ObjectId.is_valid(value_set_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="value_set_id")
        )

    object_id = ObjectId(value_set_id)

    # Check if value set exists and not already deleted
    existing = await db[Collections.VALUE_SETS].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("value_set_not_found_or_deleted")
        )

    # Soft delete
    await db[Collections.VALUE_SETS].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
                "updatedAt": get_ist_now(),
                "updatedIp": client_ip
            }
        }
    )

    # Invalidate cache
    _value_set_cache.delete(existing.get("key"))

    return True


async def restore_value_set(value_set_id: str, current_user_id: str, client_ip: Optional[str] = None) -> bool:
    """
    Restore a soft-deleted value set record

    Args:
        value_set_id: The value set ID to restore
        current_user_id: ID of the user performing restore
        client_ip: IP address of the client making the request

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If value set not found or not deleted
    """
    db = get_database()

    if not ObjectId.is_valid(value_set_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="value_set_id")
        )

    object_id = ObjectId(value_set_id)

    # Check if value set exists
    existing = await db[Collections.VALUE_SETS].find_one({"_id": object_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("value_set_not_found")
        )

    # Check if already active
    if not existing.get("isDelete", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_field_error("value_set_already_active")
        )

    # Restore (only set isDelete=False, isActive should be managed separately)
    await db[Collections.VALUE_SETS].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": False,
                "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
                "updatedAt": get_ist_now(),
                "updatedIp": client_ip
            }
        }
    )

    return True


async def list_value_sets(
    include_deleted: bool = False,
    search: Optional[str] = None,
    module: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Tuple[List[dict], int]:
    """
    List value sets with optional pagination and filters

    Args:
        include_deleted: Whether to include soft-deleted records
        search: Search term for key or description
        module: Filter by module name
        page: Page number (optional)
        page_size: Items per page (optional)

    Returns:
        Tuple of (list of value sets, total count)
    """
    db = get_database()

    # Build query
    query = {}
    if not include_deleted:
        query["isDelete"] = False

    # Search by key or description
    if search:
        query["$or"] = [
            {"key": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]

    # Filter by module
    if module:
        query["module"] = {"$regex": module, "$options": "i"}

    # Get total count
    total = await db[Collections.VALUE_SETS].count_documents(query)

    # Build cursor
    cursor = db[Collections.VALUE_SETS].find(query).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    value_sets_list = await cursor.to_list(length=None)

    # Convert documents for JSON
    result_list = [convert_objectid_to_str(vs) for vs in value_sets_list]

    return result_list, total


# ============================================================================
# Bootstrap (App Preload)
# ============================================================================

async def bootstrap_value_sets(lang: str = "en") -> Dict[str, List[Dict[str, str]]]:
    """
    Get all active value sets with resolved labels for front-end preload

    Args:
        lang: Language code for labels (default: "en")

    Returns:
        Dictionary mapping set keys to their items
    """
    db = get_database()

    # Get all active value sets
    cursor = db[Collections.VALUE_SETS].find({"isDelete": False, "isActive": True})
    value_sets = await cursor.to_list(length=None)

    # Build bootstrap response
    bootstrap_data = {}

    for value_set in value_sets:
        key = value_set.get("key")
        items = value_set.get("items", [])

        # Resolve labels for this language
        resolved_items = _resolve_labels(items, lang)
        bootstrap_data[key] = resolved_items

    return bootstrap_data


# ============================================================================
# Integration Helpers (Fast Paths with Caching)
# ============================================================================

async def validate_enum(key: str, code: str) -> bool:
    """
    Validate if a code exists in a value set (cached, fast)

    Args:
        key: Value set key
        code: Code to validate

    Returns:
        True if code exists in active set, False otherwise
    """
    # Check cache first
    cached = _value_set_cache.get(key)

    if not cached:
        # Load from DB
        db = get_database()
        cached = await _load_value_set_to_cache(key, db)

        if not cached:
            return False

    # Check if code exists and set is active
    if cached.get("isDelete", False) or not cached.get("isActive", True):
        return False

    return code in cached.get("itemsByCode", {})


async def ensure_enum(key: str, code: str) -> None:
    """
    Validate enum code and raise exception if invalid

    Args:
        key: Value set key
        code: Code to validate

    Raises:
        ValueError: If code is invalid or set is not active
    """
    is_valid = await validate_enum(key, code)

    if not is_valid:
        raise ValueError(f"Invalid enum value '{code}' for set '{key}'")


async def get_enum_items(key: str, lang: str = "en") -> List[Dict[str, str]]:
    """
    Get all items for a value set with labels in specified language

    Args:
        key: Value set key
        lang: Language code (default: "en")

    Returns:
        List of {"code": "...", "label": "..."} dictionaries
    """
    # Check cache first
    cached = _value_set_cache.get(key)

    if not cached:
        # Load from DB
        db = get_database()
        cached = await _load_value_set_to_cache(key, db)

        if not cached:
            return []

    # Check if active
    if cached.get("isDelete", False) or not cached.get("isActive", True):
        return []

    # Return cached English if requested
    if lang == "en":
        return cached.get("resolved_en", [])

    # Resolve for other languages
    return _resolve_labels(cached.get("items", []), lang)


async def get_label(key: str, code: str, lang: str = "en") -> str:
    """
    Get the label for a specific code in a value set

    Args:
        key: Value set key
        code: Code to get label for
        lang: Language code (default: "en")

    Returns:
        Label string (falls back to code if not found)
    """
    # Check cache first
    cached = _value_set_cache.get(key)

    if not cached:
        # Load from DB
        db = get_database()
        cached = await _load_value_set_to_cache(key, db)

        if not cached:
            return code  # Fallback to code itself

    # Get item
    items_by_code = cached.get("itemsByCode", {})
    item = items_by_code.get(code)

    if not item:
        return code  # Fallback to code itself

    # Get label with fallback
    labels = item.get("labels", {})
    return labels.get(lang, labels.get("en", code))


async def preload_enums(keys: Optional[List[str]] = None, lang: str = "en") -> Dict[str, List[Dict[str, str]]]:
    """
    Preload specific value sets into cache (batch operation)

    Args:
        keys: List of value set keys to preload (None = all active sets)
        lang: Language code for resolved labels

    Returns:
        Dictionary mapping keys to resolved items
    """
    db = get_database()

    # Build query
    query = {"isDelete": False, "isActive": True}
    if keys:
        query["key"] = {"$in": keys}

    # Load all matching sets
    cursor = db[Collections.VALUE_SETS].find(query)
    value_sets = await cursor.to_list(length=None)

    result = {}

    for value_set in value_sets:
        key = value_set.get("key")
        items = value_set.get("items", [])

        # Populate cache
        items_by_code = {item["code"]: item for item in items}
        cache_entry = {
            "key": key,
            "isActive": value_set.get("isActive", True),
            "isDelete": value_set.get("isDelete", False),
            "items": items,
            "itemsByCode": items_by_code,
            "resolved_en": _resolve_labels(items, "en"),
        }
        _value_set_cache.set(key, cache_entry)

        # Add to result
        result[key] = _resolve_labels(items, lang)

    return result


async def refresh_enum_cache(key: Optional[str] = None) -> int:
    """
    Manually refresh cache for one or all value sets

    Args:
        key: Specific value set key to refresh (None = refresh all)

    Returns:
        Number of cache entries refreshed
    """
    db = get_database()

    if key:
        # Refresh single key
        _value_set_cache.delete(key)
        cached = await _load_value_set_to_cache(key, db)
        return 1 if cached else 0

    else:
        # Refresh all active sets
        _value_set_cache.clear()

        cursor = db[Collections.VALUE_SETS].find({"isDelete": False, "isActive": True})
        value_sets = await cursor.to_list(length=None)

        count = 0
        for value_set in value_sets:
            key = value_set.get("key")
            await _load_value_set_to_cache(key, db)
            count += 1

        return count


# ============================================================================
# Legacy Support - Uppercased code validation cache
# ============================================================================

_VALUE_SETS_CACHE: Dict[str, Set[str]] = {}
_CACHE_EXPIRES_AT: Optional[datetime] = None
_CACHE_TTL = timedelta(minutes=5)


def _now() -> datetime:
    return get_ist_now()


def _expired() -> bool:
    return _CACHE_EXPIRES_AT is None or _now() >= _CACHE_EXPIRES_AT


async def _fetch_codes_upper_for_keys(db, keys: Iterable[str]) -> Dict[str, Set[str]]:
    keys_list = list({k for k in keys if k})
    if not keys_list:
        return {}

    pipeline = [
        {"$match": {"key": {"$in": keys_list}, "isDelete": {"$ne": True}}},
        {
            "$project": {
                "key": 1,
                "codesUpper": {
                    "$map": {
                        "input": {"$ifNull": ["$items", []]},
                        "as": "it",
                        "in": {"$toUpper": {"$ifNull": ["$$it.code", ""]}},
                    }
                },
            }
        },
    ]

    out: Dict[str, Set[str]] = {k: set() for k in keys_list}
    async for doc in db[Collections.VALUE_SETS].aggregate(pipeline):
        codes_upper = {c for c in (doc.get("codesUpper") or []) if c}
        out[doc["key"]] = codes_upper
    return out


async def ensure_value_sets_loaded(db, keys: Iterable[str]) -> Dict[str, Set[str]]:
    """
    Returns an uppercased code set per key. Uses a small TTL cache.
    """
    global _VALUE_SETS_CACHE, _CACHE_EXPIRES_AT

    keys_set = set(keys or [])
    if not keys_set:
        return {}

    # Refresh whole cache if expired
    if _expired():
        fetched = await _fetch_codes_upper_for_keys(db, keys_set)
        _VALUE_SETS_CACHE.update(fetched)
        _CACHE_EXPIRES_AT = _now() + _CACHE_TTL
    else:
        # Fetch any missing keys individually
        missing = [k for k in keys_set if k not in _VALUE_SETS_CACHE]
        if missing:
            fetched = await _fetch_codes_upper_for_keys(db, missing)
            _VALUE_SETS_CACHE.update(fetched)

    # Return a view of the requested keys
    return {k: set(_VALUE_SETS_CACHE.get(k, set())) for k in keys_set}
