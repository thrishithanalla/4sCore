"""
ObjectId Helpers
Utilities for converting between ObjectId and string representations
"""
from typing import Any, Dict, List, Optional, Union
from bson import ObjectId
from bson.errors import InvalidId
import logging

logger = logging.getLogger(__name__)


def safe_objectid(value: Any) -> Optional[ObjectId]:
    """
    Safely convert a value to ObjectId.
    Returns None if conversion fails instead of raising an exception.

    Args:
        value: Value to convert (string, ObjectId, or None)

    Returns:
        ObjectId if valid, None otherwise
    """
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        if ObjectId.is_valid(value):
            return ObjectId(value)
    except (InvalidId, TypeError):
        pass
    return None


def to_objectid(value: Any, field_name: str = "id") -> ObjectId:
    """
    Convert a value to ObjectId, raising ValueError if invalid.

    Args:
        value: Value to convert
        field_name: Name of field for error message

    Returns:
        ObjectId

    Raises:
        ValueError: If value cannot be converted to ObjectId
    """
    if value is None:
        raise ValueError(f"Invalid {field_name} ID format: value is None")
    if isinstance(value, ObjectId):
        return value
    try:
        if ObjectId.is_valid(value):
            return ObjectId(value)
    except (InvalidId, TypeError):
        pass
    raise ValueError(f"Invalid {field_name} ID format")


def objectid_to_str(value: Any) -> Optional[str]:
    """
    Convert ObjectId to string.

    Args:
        value: ObjectId or string value

    Returns:
        String representation or None
    """
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


def convert_objectids_to_str(document: Optional[Dict]) -> Optional[Dict]:
    """
    Convert all ObjectId fields in a document to strings for JSON serialization.
    Handles common fields: _id, unitId, departmentId, rankId, createdBy, updatedBy, etc.

    Args:
        document: MongoDB document dictionary

    Returns:
        Document with ObjectId fields converted to strings
    """
    if not document:
        return document

    # Common ObjectId fields to convert
    objectid_fields = [
        "_id", "unitId", "departmentId", "rankId", "createdBy", "updatedBy",
        "deletedBy", "roleId", "userId", "parentUnitId", "districtId",
        "unitTypeId", "responsibleUserId", "proxyUserId", "moduleId",
        "permissionId", "approvalFlowId", "approvalChainId"
    ]

    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    return document


def convert_str_to_objectids(
    data: Dict,
    fields: List[str],
    skip_invalid: bool = True
) -> Dict:
    """
    Convert string fields to ObjectId in a dictionary.
    Useful before inserting/updating documents in MongoDB.

    Args:
        data: Dictionary containing fields to convert
        fields: List of field names to convert
        skip_invalid: If True, skip fields that can't be converted; if False, raise error

    Returns:
        Dictionary with specified fields converted to ObjectId

    Raises:
        ValueError: If skip_invalid is False and a field cannot be converted
    """
    for field in fields:
        if field in data and data[field]:
            try:
                if ObjectId.is_valid(data[field]):
                    data[field] = ObjectId(data[field])
                elif not skip_invalid:
                    raise ValueError(f"Invalid ObjectId format for field: {field}")
            except (InvalidId, TypeError) as e:
                if not skip_invalid:
                    raise ValueError(f"Invalid ObjectId format for field: {field}") from e
                logger.warning(f"Could not convert {field} to ObjectId: {data[field]}")
    return data


def is_valid_objectid(value: Any) -> bool:
    """
    Check if a value is a valid ObjectId or can be converted to one.

    Args:
        value: Value to check

    Returns:
        True if valid ObjectId or valid ObjectId string
    """
    if value is None:
        return False
    if isinstance(value, ObjectId):
        return True
    try:
        return ObjectId.is_valid(value)
    except (InvalidId, TypeError):
        return False
