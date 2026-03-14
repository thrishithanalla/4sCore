"""
UnitVillages Service
Business logic for UnitVillages collection operations
"""
import logging
from typing import Optional, List, Tuple
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status, Request
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.utils.validators import validate_foreign_key, validate_unique_constraint
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error

logger = logging.getLogger(__name__)


def convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    if not document:
        return document

    # Convert _id
    if "_id" in document:
        document["_id"] = str(document["_id"])

    # Convert ObjectId fields
    objectid_fields = ["unitId", "mandalId", "createdBy", "updatedBy"]
    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    datetime_fields = ["createdAt", "updatedAt"]
    for field in datetime_fields:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


async def populate_unit_villages_relations(db, document: dict) -> dict:
    """Populate foreign key relations with actual data"""
    if not document:
        return document

    # Populate unit
    if document.get("unitId"):
        unit_id = document["unitId"] if isinstance(document["unitId"], ObjectId) else ObjectId(document["unitId"])
        unit = await db[Collections.UNIT].find_one({"_id": unit_id, "isDelete": False})
        if unit:
            document["unit"] = {
                "_id": str(unit["_id"]),
                "name": unit.get("name"),
                "policeReferenceId": unit.get("policeReferenceId")
            }

    # Populate mandal
    if document.get("mandalId"):
        mandal_id = document["mandalId"] if isinstance(document["mandalId"], ObjectId) else ObjectId(document["mandalId"])
        mandal = await db[Collections.MANDAL].find_one({"_id": mandal_id, "isDelete": False})
        if mandal:
            document["mandal"] = {
                "_id": str(mandal["_id"]),
                "mandalName": mandal.get("mandalName"),
                "districtId": str(mandal.get("districtId")) if mandal.get("districtId") else None
            }

    return document


async def create_unit_village(
    unit_village_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new unit-village mapping

    Args:
        unit_village_data: UnitVillage data from schema
        current_user_id: ID of the user creating the record

    Returns:
        Created unit-village document

    Raises:
        HTTPException: If validation fails or creation error
    """
    db = get_database()

    # Validate foreign key constraints (unitId and mandalId must exist)
    await validate_foreign_key(
        db, Collections.UNIT, "unitId", unit_village_data.get("unitId"), required=True
    )
    await validate_foreign_key(
        db, Collections.MANDAL, "mandalId", unit_village_data.get("mandalId"), required=True
    )

    # Validate unique constraint (mandalId + villageName) - check against all records including deleted
    await validate_unique_constraint(
        db,
        Collections.UNIT_VILLAGES,
        {"mandalId": ObjectId(unit_village_data["mandalId"]), "villageName": unit_village_data["villageName"]},
        exclude_id=None,
        include_deleted=True
    )

    # Prepare document
    unit_village_dict = {**unit_village_data}
    unit_village_dict.pop("createdBy", None)  # Remove deprecated field
    unit_village_dict["createdAt"] = get_ist_now()
    unit_village_dict["isActive"] = True
    unit_village_dict["isDelete"] = False
    unit_village_dict["createdBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id

    # Convert IDs to ObjectId
    if unit_village_dict.get("unitId"):
        unit_village_dict["unitId"] = ObjectId(unit_village_dict["unitId"])
    if unit_village_dict.get("mandalId"):
        unit_village_dict["mandalId"] = ObjectId(unit_village_dict["mandalId"])

    # Insert into database
    try:
        result = await db[Collections.UNIT_VILLAGES].insert_one(unit_village_dict)
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_CREATE_DUPLICATE,
            parameters={"mandalId": unit_village_data.get("mandalId"), "villageName": unit_village_data.get("villageName")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="mandalId, villageName")
        )

    created_mapping = await db[Collections.UNIT_VILLAGES].find_one({"_id": result.inserted_id})

    # Populate relations
    created_mapping = await populate_unit_villages_relations(db, created_mapping)
    return convert_objectid_to_str(created_mapping)


async def get_unit_village(mapping_id: str) -> Optional[dict]:
    """
    Get a unit-village mapping by ID

    Args:
        mapping_id: The mapping ID

    Returns:
        UnitVillage document or None
    """
    db = get_database()

    if not ObjectId.is_valid(mapping_id):
        return None

    mapping = await db[Collections.UNIT_VILLAGES].find_one({"_id": ObjectId(mapping_id), "isDelete": False})

    if mapping:
        mapping = await populate_unit_villages_relations(db, mapping)
        return convert_objectid_to_str(mapping)

    return None


async def update_unit_village(
    mapping_id: str,
    update_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Update a unit-village mapping

    Args:
        mapping_id: The mapping ID to update
        update_data: Fields to update
        current_user_id: ID of the user performing update
        request: FastAPI Request object for error logging

    Returns:
        Updated unit-village document

    Raises:
        HTTPException: If validation fails or mapping not found
    """
    db = get_database()

    if not ObjectId.is_valid(mapping_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="mapping_id")
        )

    object_id = ObjectId(mapping_id)

    # Check if mapping exists
    existing_mapping = await db[Collections.UNIT_VILLAGES].find_one({"_id": object_id, "isDelete": False})
    if not existing_mapping:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("village_mapping_not_found")
        )

    # Filter out None values and prepare update
    filtered_update = {k: v for k, v in update_data.items() if v is not None}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "No fields to update"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("no_fields_to_update")
        )

    # Validate foreign keys if they are being updated
    if "unitId" in filtered_update:
        await validate_foreign_key(
            db, Collections.UNIT, "unitId", filtered_update["unitId"], required=True
        )
    if "mandalId" in filtered_update:
        await validate_foreign_key(
            db, Collections.MANDAL, "mandalId", filtered_update["mandalId"], required=True
        )

    # Validate unique constraint if mandalId or villageName is being updated - check against all records including deleted
    if "mandalId" in filtered_update or "villageName" in filtered_update:
        check_mandal_id = filtered_update.get("mandalId") or str(existing_mapping.get("mandalId"))
        check_village_name = filtered_update.get("villageName") or existing_mapping.get("villageName")

        await validate_unique_constraint(
            db,
            Collections.UNIT_VILLAGES,
            {"mandalId": ObjectId(check_mandal_id), "villageName": check_village_name},
            exclude_id=mapping_id,
            include_deleted=True
        )

    # Convert IDs to ObjectId if present
    if filtered_update.get("unitId"):
        filtered_update["unitId"] = ObjectId(filtered_update["unitId"])
    if filtered_update.get("mandalId"):
        filtered_update["mandalId"] = ObjectId(filtered_update["mandalId"])

    # Set updatedBy and updatedAt
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()

    # Update in database
    try:
        await db[Collections.UNIT_VILLAGES].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_DUPLICATE,
            parameters={"mapping_id": mapping_id, "mandalId": filtered_update.get("mandalId"), "villageName": filtered_update.get("villageName")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="mandalId, villageName")
        )

    updated_mapping = await db[Collections.UNIT_VILLAGES].find_one({"_id": object_id})

    # Populate relations
    updated_mapping = await populate_unit_villages_relations(db, updated_mapping)
    return convert_objectid_to_str(updated_mapping)


async def delete_unit_village(
    mapping_id: str,
    current_user_id: str,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a unit-village mapping

    Args:
        mapping_id: The mapping ID to delete
        current_user_id: ID of the user performing delete
        deleted_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully, False if not found

    Raises:
        HTTPException: If invalid ID format
    """
    db = get_database()

    if not ObjectId.is_valid(mapping_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_DELETE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="mapping_id")
        )

    object_id = ObjectId(mapping_id)

    # Check if mapping exists
    existing_mapping = await db[Collections.UNIT_VILLAGES].find_one({"_id": object_id, "isDelete": False})
    if not existing_mapping:
        return False  # Return False to indicate not found (caller handles response)

    # Soft delete
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }
    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    await db[Collections.UNIT_VILLAGES].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def restore_unit_village(
    mapping_id: str,
    current_user_id: str,
    restored_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Restore a soft-deleted unit-village mapping

    Args:
        mapping_id: The mapping ID to restore
        current_user_id: ID of the user performing restore
        restored_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If mapping not found or not deleted
    """
    db = get_database()

    if not ObjectId.is_valid(mapping_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_RESTORE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="mapping_id")
        )

    object_id = ObjectId(mapping_id)

    # Check if mapping exists (including soft-deleted)
    existing_mapping = await db[Collections.UNIT_VILLAGES].find_one({"_id": object_id})
    if not existing_mapping:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_RESTORE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("village_mapping_not_found")
        )

    # Check if already active
    if not existing_mapping.get("isDelete", False):
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_RESTORE_ALREADY_ACTIVE,
            parameters={"mapping_id": mapping_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("already_active")
        )

    # Restore (set isDelete to False only - isActive should be managed separately)
    update_data = {
        "isDelete": False,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }
    if restored_ip:
        update_data["updatedIp"] = restored_ip

    await db[Collections.UNIT_VILLAGES].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def list_unit_villages(
    include_deleted: bool = False,
    search: Optional[str] = None,
    unit_id: Optional[str] = None,
    mandal_id: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    populate: bool = True,
    accessible_unit_ids: Optional[List[ObjectId]] = None
) -> Tuple[List[dict], int]:
    """
    List unit-village mappings with optional pagination, filters, and hierarchy-based access control.

    Args:
        include_deleted: Whether to include soft-deleted records.
        search: Search term for villageName.
        unit_id: Filter by unit ID.
        mandal_id: Filter by mandal ID.
        page: Page number (optional).
        page_size: Items per page (optional).
        populate: Whether to populate relations.
        accessible_unit_ids: List of unit ObjectIds the user can access (for hierarchy filtering).
                             If provided, only villages mapped to these units are returned.
                             If None, no hierarchy filtering is applied.

    Returns:
        Tuple[List[dict], int]: Tuple of (list of mappings, total count).
    """
    db = get_database()

    # Build query
    query: dict = {}
    if not include_deleted:
        query["isDelete"] = False

    # Apply hierarchy-based access control filter
    if accessible_unit_ids is not None:
        if not accessible_unit_ids:
            # No accessible units - return empty result
            return [], 0
        query["unitId"] = {"$in": accessible_unit_ids}

    # Search by villageName
    if search:
        query["villageName"] = {"$regex": search, "$options": "i"}

    # Filter by unit - only if not already filtered by hierarchy
    if unit_id and ObjectId.is_valid(unit_id):
        if accessible_unit_ids is None:
            query["unitId"] = ObjectId(unit_id)
        # If accessible_unit_ids is set, specific unit filter is ignored (hierarchy takes precedence)

    # Filter by mandal
    if mandal_id and ObjectId.is_valid(mandal_id):
        query["mandalId"] = ObjectId(mandal_id)

    # Get total count
    total = await db[Collections.UNIT_VILLAGES].count_documents(query)

    # Build cursor
    cursor = db[Collections.UNIT_VILLAGES].find(query).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    mappings_list = await cursor.to_list(length=None)

    # Populate relations and convert documents for JSON
    result_list = []
    for m in mappings_list:
        if populate:
            m = await populate_unit_villages_relations(db, m)
        result_list.append(convert_objectid_to_str(m))

    return result_list, total
