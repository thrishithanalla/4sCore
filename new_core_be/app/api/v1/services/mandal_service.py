"""
Mandal Service
Business logic for Mandal collection operations
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
    objectid_fields = ["districtId", "createdBy", "updatedBy"]
    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    datetime_fields = ["createdAt", "updatedAt"]
    for field in datetime_fields:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


async def populate_mandal_relations(db, document: dict) -> dict:
    """Populate foreign key relations with actual data"""
    if not document:
        return document

    # Populate district
    if document.get("districtId"):
        district_id = document["districtId"] if isinstance(document["districtId"], ObjectId) else ObjectId(document["districtId"])
        district = await db[Collections.DISTRICT].find_one({"_id": district_id, "isDelete": False})
        if district:
            document["district"] = {
                "_id": str(district["_id"]),
                "name": district.get("name"),
                "cctnsDistrictCd": district.get("cctnsDistrictCd"),
                "stateName": district.get("stateName")
            }

    return document


async def create_mandal(
    mandal_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new mandal record

    Args:
        mandal_data: Mandal data from schema
        current_user_id: ID of the user creating the record
        request: FastAPI Request object for error logging

    Returns:
        Created mandal document

    Raises:
        HTTPException: If validation fails or creation error
    """
    db = get_database()

    # Validate foreign key (districtId must exist)
    await validate_foreign_key(
        db, Collections.DISTRICT, "districtId", mandal_data.get("districtId"), required=True
    )

    # Validate unique constraint (districtId + mandalName) - check against all records including deleted
    await validate_unique_constraint(
        db,
        Collections.MANDAL,
        {"districtId": ObjectId(mandal_data["districtId"]), "mandalName": mandal_data["mandalName"]},
        exclude_id=None,
        include_deleted=True
    )

    # Prepare mandal document
    mandal_dict = {**mandal_data}
    mandal_dict.pop("createdBy", None)  # Remove deprecated field
    mandal_dict["createdAt"] = get_ist_now()
    mandal_dict["isActive"] = True
    mandal_dict["isDelete"] = False
    mandal_dict["createdBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id

    # Convert districtId to ObjectId
    if mandal_dict.get("districtId"):
        mandal_dict["districtId"] = ObjectId(mandal_dict["districtId"])

    # Insert into database
    try:
        result = await db[Collections.MANDAL].insert_one(mandal_dict)
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_CREATE_DUPLICATE_NAME,
            parameters={"mandalName": mandal_data.get("mandalName"), "districtId": mandal_data.get("districtId")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="districtId, mandalName")
        )

    created_mandal = await db[Collections.MANDAL].find_one({"_id": result.inserted_id})

    # Populate relations
    created_mandal = await populate_mandal_relations(db, created_mandal)
    return convert_objectid_to_str(created_mandal)


async def get_mandal(mandal_id: str) -> Optional[dict]:
    """
    Get a mandal by ID (includes soft-deleted records)

    Args:
        mandal_id: The mandal ID

    Returns:
        Mandal document or None
    """
    db = get_database()

    if not ObjectId.is_valid(mandal_id):
        return None

    mandal = await db[Collections.MANDAL].find_one({"_id": ObjectId(mandal_id)})

    if mandal:
        mandal = await populate_mandal_relations(db, mandal)
        return convert_objectid_to_str(mandal)

    return None


async def update_mandal(
    mandal_id: str,
    update_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Update a mandal record

    Args:
        mandal_id: The mandal ID to update
        update_data: Fields to update
        current_user_id: ID of the user performing update
        request: FastAPI Request object for error logging

    Returns:
        Updated mandal document

    Raises:
        HTTPException: If validation fails or mandal not found
    """
    db = get_database()

    if not ObjectId.is_valid(mandal_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
            parameters={"mandal_id": mandal_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="mandal_id")
        )

    object_id = ObjectId(mandal_id)

    # Check if mandal exists
    existing_mandal = await db[Collections.MANDAL].find_one({"_id": object_id, "isDelete": False})
    if not existing_mandal:
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_NOT_FOUND,
            parameters={"mandal_id": mandal_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("mandal_not_found")
        )

    # Filter out None values and prepare update
    filtered_update = {k: v for k, v in update_data.items() if v is not None}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
            parameters={"mandal_id": mandal_id, "reason": "No fields to update"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("no_fields_to_update")
        )

    # Validate foreign key if districtId is being updated
    if "districtId" in filtered_update:
        await validate_foreign_key(
            db, Collections.DISTRICT, "districtId", filtered_update["districtId"], required=True
        )

    # Validate unique constraint if districtId or mandalName is being updated (check against all records including deleted)
    if "districtId" in filtered_update or "mandalName" in filtered_update:
        check_district_id = filtered_update.get("districtId") or str(existing_mandal.get("districtId"))
        check_mandal_name = filtered_update.get("mandalName") or existing_mandal.get("mandalName")

        await validate_unique_constraint(
            db,
            Collections.MANDAL,
            {"districtId": ObjectId(check_district_id), "mandalName": check_mandal_name},
            exclude_id=mandal_id,
            include_deleted=True
        )

    # Convert districtId to ObjectId if present
    if filtered_update.get("districtId"):
        filtered_update["districtId"] = ObjectId(filtered_update["districtId"])

    # Set updatedBy and updatedAt
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()

    # Update in database
    try:
        await db[Collections.MANDAL].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_DUPLICATE_NAME,
            parameters={"mandal_id": mandal_id, "mandalName": filtered_update.get("mandalName")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="districtId, mandalName")
        )

    updated_mandal = await db[Collections.MANDAL].find_one({"_id": object_id})

    # Populate relations
    updated_mandal = await populate_mandal_relations(db, updated_mandal)
    return convert_objectid_to_str(updated_mandal)


async def delete_mandal(
    mandal_id: str,
    current_user_id: str,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a mandal record

    Args:
        mandal_id: The mandal ID to delete
        current_user_id: ID of the user performing delete
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If mandal not found
    """
    db = get_database()

    if not ObjectId.is_valid(mandal_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_DELETE_FAILED,
            parameters={"mandal_id": mandal_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="mandal_id")
        )

    object_id = ObjectId(mandal_id)

    # Check if mandal exists
    existing_mandal = await db[Collections.MANDAL].find_one({"_id": object_id, "isDelete": False})
    if not existing_mandal:
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_DELETE_NOT_FOUND,
            parameters={"mandal_id": mandal_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("mandal_not_found")
        )

    # Check if any unit villages are using this mandal (among non-deleted villages)
    village_using_mandal = await db[Collections.UNIT_VILLAGES].find_one({
        "mandalId": object_id,
        "isDelete": False
    })
    if village_using_mandal:
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_DELETE_IN_USE,
            parameters={"mandal_id": mandal_id, "reference": "villages"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("mandal_has_villages")
        )

    # Soft delete
    await db[Collections.MANDAL].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
                "updatedAt": get_ist_now()
            }
        }
    )

    return True


async def restore_mandal(
    mandal_id: str,
    current_user_id: str,
    request: Optional[Request] = None
) -> bool:
    """
    Restore a soft-deleted mandal record

    Args:
        mandal_id: The mandal ID to restore
        current_user_id: ID of the user performing restore
        request: FastAPI Request object for error logging

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If mandal not found or not deleted
    """
    db = get_database()

    if not ObjectId.is_valid(mandal_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_RESTORE_FAILED,
            parameters={"mandal_id": mandal_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="mandal_id")
        )

    object_id = ObjectId(mandal_id)

    # Check if mandal exists (including soft-deleted)
    existing_mandal = await db[Collections.MANDAL].find_one({"_id": object_id})
    if not existing_mandal:
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_RESTORE_NOT_FOUND,
            parameters={"mandal_id": mandal_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("mandal_not_found")
        )

    # Check if already active
    if not existing_mandal.get("isDelete", False):
        await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_RESTORE_ALREADY_ACTIVE,
            parameters={"mandal_id": mandal_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("already_active")
        )

    # Restore (set isDelete to False only - isActive should be managed separately)
    await db[Collections.MANDAL].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": False,
                "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
                "updatedAt": get_ist_now()
            }
        }
    )

    return True


async def list_mandals(
    include_deleted: bool = False,
    search: Optional[str] = None,
    district_id: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    populate: bool = True,
    accessible_unit_ids: Optional[List[ObjectId]] = None
) -> Tuple[List[dict], int]:
    """
    List mandals with optional pagination, filters, and hierarchy-based access control.

    Args:
        include_deleted: Whether to include soft-deleted records.
        search: Search term for mandalName.
        district_id: Filter by district ID.
        page: Page number (optional).
        page_size: Items per page (optional).
        populate: Whether to populate relations.
        accessible_unit_ids: List of unit ObjectIds the user can access (for hierarchy filtering).
                             If None, no hierarchy filtering is applied (user sees all mandals in district).
                             If provided, only mandals with villages mapped to these units are returned.

    Returns:
        Tuple[List[dict], int]: Tuple of (list of mandals, total count).
    """
    db = get_database()

    # Build query
    query: dict = {}
    if not include_deleted:
        query["isDelete"] = False

    # Search by mandalName
    if search:
        query["mandalName"] = {"$regex": search, "$options": "i"}

    # Filter by district
    if district_id and ObjectId.is_valid(district_id):
        query["districtId"] = ObjectId(district_id)

    # Apply hierarchy-based access control filter
    # If accessible_unit_ids is provided (not None), filter mandals by villages mapped to those units
    if accessible_unit_ids is not None:
        if not accessible_unit_ids:
            # No accessible units - return empty result
            return [], 0

        # Get mandal IDs that have villages mapped to accessible units
        village_mandal_ids = await db[Collections.UNIT_VILLAGES].distinct(
            "mandalId",
            {"unitId": {"$in": accessible_unit_ids}, "isDelete": False}
        )

        if not village_mandal_ids:
            # No mandals found for accessible units
            return [], 0

        query["_id"] = {"$in": village_mandal_ids}

    # Get total count
    total = await db[Collections.MANDAL].count_documents(query)

    # Build cursor
    cursor = db[Collections.MANDAL].find(query).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    mandals_list = await cursor.to_list(length=None)

    # Populate relations and convert documents for JSON
    result_list = []
    for m in mandals_list:
        if populate:
            m = await populate_mandal_relations(db, m)
        result_list.append(convert_objectid_to_str(m))

    return result_list, total
