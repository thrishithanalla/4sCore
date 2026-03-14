"""
District Service
Business logic for District collection operations
"""
import logging
from typing import Optional, List, Tuple
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status, Request
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.utils.validators import validate_unique_constraint
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


async def create_district(
    district_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new district record

    Args:
        district_data: District data from schema
        current_user_id: ID of the user creating the record
        request: FastAPI Request object for error logging

    Returns:
        Created district document

    Raises:
        HTTPException: If validation fails or creation error
    """
    db = get_database()

    # Validate unique constraint for cctnsDistrictCd (check against all records including deleted)
    if district_data.get("cctnsDistrictCd"):
        await validate_unique_constraint(
            db,
            Collections.DISTRICT,
            {"cctnsDistrictCd": district_data["cctnsDistrictCd"]},
            exclude_id=None,
            include_deleted=True
        )

    # Validate unique constraint for name (+ stateName if provided)
    # If stateName is provided, check name + stateName combination
    # If stateName is not provided, check name alone
    if district_data.get("name"):
        if district_data.get("stateName"):
            await validate_unique_constraint(
                db,
                Collections.DISTRICT,
                {"name": district_data["name"], "stateName": district_data["stateName"]},
                exclude_id=None,
                include_deleted=True
            )
        else:
            # Check for name uniqueness when stateName is not provided
            # Only match records where stateName is also null/empty
            await validate_unique_constraint(
                db,
                Collections.DISTRICT,
                {"name": district_data["name"], "$or": [{"stateName": None}, {"stateName": ""}, {"stateName": {"$exists": False}}]},
                exclude_id=None,
                include_deleted=True
            )

    # Prepare district document
    district_dict = {**district_data}
    district_dict.pop("createdBy", None)  # Remove deprecated field
    district_dict["createdAt"] = get_ist_now()
    district_dict["isActive"] = True
    district_dict["isDelete"] = False
    district_dict["createdBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id

    # Insert into database
    try:
        result = await db[Collections.DISTRICT].insert_one(district_dict)
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_CREATE_DUPLICATE_NAME,
            parameters={"name": district_data.get("name"), "cctnsDistrictCd": district_data.get("cctnsDistrictCd")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name, cctnsDistrictCd")
        )

    created_district = await db[Collections.DISTRICT].find_one({"_id": result.inserted_id})

    return convert_objectid_to_str(created_district)


async def get_district(district_id: str) -> Optional[dict]:
    """
    Get a district by ID (includes soft-deleted records)

    Args:
        district_id: The district ID

    Returns:
        District document or None
    """
    db = get_database()

    if not ObjectId.is_valid(district_id):
        return None

    district = await db[Collections.DISTRICT].find_one({"_id": ObjectId(district_id)})

    if district:
        return convert_objectid_to_str(district)

    return None


async def update_district(
    district_id: str,
    update_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Update a district record

    Args:
        district_id: The district ID to update
        update_data: Fields to update
        current_user_id: ID of the user performing update
        request: FastAPI Request object for error logging

    Returns:
        Updated district document

    Raises:
        HTTPException: If validation fails or district not found
    """
    db = get_database()

    if not ObjectId.is_valid(district_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"district_id": district_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="district_id")
        )

    object_id = ObjectId(district_id)

    # Check if district exists
    existing_district = await db[Collections.DISTRICT].find_one({"_id": object_id, "isDelete": False})
    if not existing_district:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_NOT_FOUND,
            parameters={"district_id": district_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("district_not_found")
        )

    # Filter out None values and prepare update
    filtered_update = {k: v for k, v in update_data.items() if v is not None}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"district_id": district_id, "reason": "No fields to update"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("no_fields_to_update")
        )

    # Validate unique constraint for cctnsDistrictCd if being updated (check against all records including deleted)
    if "cctnsDistrictCd" in filtered_update:
        await validate_unique_constraint(
            db,
            Collections.DISTRICT,
            {"cctnsDistrictCd": filtered_update["cctnsDistrictCd"]},
            exclude_id=district_id,
            include_deleted=True
        )

    # Validate unique constraint for name (+ stateName if provided)
    # Use the new name if being updated, otherwise use existing name
    check_name = filtered_update.get("name") or existing_district.get("name")
    # Use the new stateName if being updated, otherwise use existing stateName
    check_state_name = filtered_update.get("stateName") if "stateName" in filtered_update else existing_district.get("stateName")

    if check_name:
        if check_state_name:
            await validate_unique_constraint(
                db,
                Collections.DISTRICT,
                {"name": check_name, "stateName": check_state_name},
                exclude_id=district_id,
                include_deleted=True
            )
        else:
            # Check for name uniqueness when stateName is not provided
            # Only match records where stateName is also null/empty
            await validate_unique_constraint(
                db,
                Collections.DISTRICT,
                {"name": check_name, "$or": [{"stateName": None}, {"stateName": ""}, {"stateName": {"$exists": False}}]},
                exclude_id=district_id,
                include_deleted=True
            )

    # Set updatedBy and updatedAt
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()

    # Update in database
    try:
        await db[Collections.DISTRICT].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_DUPLICATE_NAME,
            parameters={"district_id": district_id, "name": filtered_update.get("name"), "cctnsDistrictCd": filtered_update.get("cctnsDistrictCd")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name, cctnsDistrictCd")
        )

    updated_district = await db[Collections.DISTRICT].find_one({"_id": object_id})

    return convert_objectid_to_str(updated_district)


async def delete_district(
    district_id: str,
    current_user_id: str,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a district record

    Args:
        district_id: The district ID to delete
        current_user_id: ID of the user performing delete
        deleted_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If district not found, already deleted, or has mapped units
    """
    db = get_database()

    if not ObjectId.is_valid(district_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_DELETE_FAILED,
            parameters={"district_id": district_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="district_id")
        )

    object_id = ObjectId(district_id)

    # Check if district exists (handle both isDelete and isDeleted for backwards compatibility)
    existing_district = await db[Collections.DISTRICT].find_one({"_id": object_id})
    if not existing_district:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_DELETE_NOT_FOUND,
            parameters={"district_id": district_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("district_not_found")
        )

    # Check if already deleted (handle both field names)
    is_deleted = existing_district.get("isDelete", existing_district.get("isDeleted", False))
    if is_deleted:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_DELETE_ALREADY_DELETED,
            parameters={"district_id": district_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("already_deleted")
        )

    # Check if any units are using this district (among non-deleted units)
    unit_using_district = await db[Collections.UNIT].find_one({
        "districtId": object_id,
        "isDelete": False
    })
    if unit_using_district:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_DELETE_HAS_REFERENCES,
            parameters={"district_id": district_id, "reference": "units"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("district_has_units")
        )

    # Check if any mandals are using this district (among non-deleted mandals)
    mandal_using_district = await db[Collections.MANDAL].find_one({
        "districtId": object_id,
        "isDelete": False
    })
    if mandal_using_district:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_DELETE_HAS_REFERENCES,
            parameters={"district_id": district_id, "reference": "mandals"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("district_has_mandals")
        )

    # Soft delete - sets isDelete=True
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }

    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    await db[Collections.DISTRICT].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def restore_district(
    district_id: str,
    current_user_id: str,
    restored_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Restore a soft-deleted district record

    Args:
        district_id: The district ID to restore
        current_user_id: ID of the user performing restore
        restored_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        Restored district document

    Raises:
        HTTPException: If district not found or not deleted
    """
    db = get_database()

    if not ObjectId.is_valid(district_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"district_id": district_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="district_id")
        )

    object_id = ObjectId(district_id)

    # Check if district exists
    existing_district = await db[Collections.DISTRICT].find_one({"_id": object_id})
    if not existing_district:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_NOT_FOUND,
            parameters={"district_id": district_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("district_not_found")
        )

    # Check if actually deleted
    is_deleted = existing_district.get("isDelete", existing_district.get("isDeleted", False))
    if not is_deleted:
        await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"district_id": district_id, "reason": "District is not deleted"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("not_deleted")
        )

    # Validate unique constraint for cctnsDistrictCd before restore (check against non-deleted records)
    if existing_district.get("cctnsDistrictCd"):
        existing_with_code = await db[Collections.DISTRICT].find_one({
            "cctnsDistrictCd": existing_district["cctnsDistrictCd"],
            "isDelete": False,
            "_id": {"$ne": object_id}
        })
        if existing_with_code:
            await log_error(
                request=request,
                error_code=ErrorCodes.DISTRICT_UPDATE_DUPLICATE_NAME,
                parameters={"district_id": district_id, "cctnsDistrictCd": existing_district["cctnsDistrictCd"]},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists", field_names="cctnsDistrictCd")
            )

    # Validate unique constraint for name + stateName before restore
    name = existing_district.get("name")
    state_name = existing_district.get("stateName")
    if name:
        if state_name:
            existing_with_name = await db[Collections.DISTRICT].find_one({
                "name": name,
                "stateName": state_name,
                "isDelete": False,
                "_id": {"$ne": object_id}
            })
        else:
            existing_with_name = await db[Collections.DISTRICT].find_one({
                "name": name,
                "$or": [{"stateName": None}, {"stateName": ""}, {"stateName": {"$exists": False}}],
                "isDelete": False,
                "_id": {"$ne": object_id}
            })
        if existing_with_name:
            await log_error(
                request=request,
                error_code=ErrorCodes.DISTRICT_UPDATE_DUPLICATE_NAME,
                parameters={"district_id": district_id, "name": name},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists", field_names="name")
            )

    # Restore - sets isDelete=False, isActive=True
    update_data = {
        "isDelete": False,
        "isActive": True,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }

    if restored_ip:
        update_data["updatedIp"] = restored_ip

    await db[Collections.DISTRICT].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    restored_district = await db[Collections.DISTRICT].find_one({"_id": object_id})

    return convert_objectid_to_str(restored_district)


async def list_districts(
    include_deleted: bool = False,
    is_active: Optional[bool] = True,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Tuple[List[dict], int]:
    """
    List districts with optional pagination and filters

    Args:
        include_deleted: Whether to include soft-deleted records
        is_active: Filter by active status (True=active only, False=inactive only, None=all)
        search: Search term for name, cctnsDistrictCd, stateName
        page: Page number (optional)
        page_size: Items per page (optional)

    Returns:
        Tuple of (list of districts, total count)
    """
    db = get_database()

    # Build query
    query = {}

    # Filter by delete status
    if not include_deleted:
        query["isDelete"] = False

    # Filter by active status (default: only active records)
    if is_active is not None:
        query["isActive"] = is_active

    # Search across multiple fields
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"cctnsDistrictCd": {"$regex": search, "$options": "i"}},
            {"stateName": {"$regex": search, "$options": "i"}}
        ]

    # Get total count
    total = await db[Collections.DISTRICT].count_documents(query)

    # Build cursor
    cursor = db[Collections.DISTRICT].find(query).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    districts_list = await cursor.to_list(length=None)

    # Convert documents for JSON
    result_list = [convert_objectid_to_str(d) for d in districts_list]

    return result_list, total
