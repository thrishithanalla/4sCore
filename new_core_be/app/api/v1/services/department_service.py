"""
Department Service
Business logic for Department collection operations
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


async def create_department(
    department_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new department record

    Args:
        department_data: Department data from schema
        current_user_id: ID of the user creating the record
        request: FastAPI Request object for error logging

    Returns:
        Created department document

    Raises:
        HTTPException: If validation fails or creation error
    """
    db = get_database()

    # Validate unique constraint for name (check against all records including deleted)
    await validate_unique_constraint(
        db,
        Collections.DEPARTMENT,
        {"name": department_data["name"]},
        exclude_id=None,
        include_deleted=True
    )

    # Validate unique constraint for cctnsDepartmentCd (if provided)
    if department_data.get("cctnsDepartmentCd"):
        await validate_unique_constraint(
            db,
            Collections.DEPARTMENT,
            {"cctnsDepartmentCd": department_data["cctnsDepartmentCd"]},
            exclude_id=None,
            include_deleted=True
        )

    # Prepare department document
    department_dict = {**department_data}
    department_dict.pop("createdBy", None)  # Remove deprecated field from payload
    department_dict["createdAt"] = get_ist_now()
    department_dict["isActive"] = True
    department_dict["isDelete"] = False
    department_dict["createdBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id

    # Insert into database
    try:
        result = await db[Collections.DEPARTMENT].insert_one(department_dict)
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_CREATE_DUPLICATE_NAME,
            parameters={"name": department_data.get("name"), "cctnsDepartmentCd": department_data.get("cctnsDepartmentCd")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name, cctnsDepartmentCd")
        )

    created_department = await db[Collections.DEPARTMENT].find_one({"_id": result.inserted_id})

    return convert_objectid_to_str(created_department)


async def get_department(department_id: str) -> Optional[dict]:
    """
    Get a department by ID (includes soft-deleted records)

    Args:
        department_id: The department ID

    Returns:
        Department document or None
    """
    db = get_database()

    if not ObjectId.is_valid(department_id):
        return None

    department = await db[Collections.DEPARTMENT].find_one({"_id": ObjectId(department_id)})

    if department:
        return convert_objectid_to_str(department)

    return None


async def update_department(
    department_id: str,
    update_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Update a department record

    Args:
        department_id: The department ID to update
        update_data: Fields to update
        current_user_id: ID of the user performing update
        request: FastAPI Request object for error logging

    Returns:
        Updated department document

    Raises:
        HTTPException: If validation fails or department not found
    """
    db = get_database()

    if not ObjectId.is_valid(department_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_UPDATE_FAILED,
            parameters={"department_id": department_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="department_id")
        )

    object_id = ObjectId(department_id)

    # Check if department exists
    existing_department = await db[Collections.DEPARTMENT].find_one({"_id": object_id, "isDelete": {"$ne": True}})
    if not existing_department:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_UPDATE_NOT_FOUND,
            parameters={"department_id": department_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("department_not_found")
        )

    # Filter out None values and prepare update
    filtered_update = {k: v for k, v in update_data.items() if v is not None}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_UPDATE_FAILED,
            parameters={"department_id": department_id, "reason": "No fields to update"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("no_fields_to_update")
        )

    # Validate unique constraint for name if it's being updated (check against all records including deleted)
    if "name" in filtered_update:
        await validate_unique_constraint(
            db,
            Collections.DEPARTMENT,
            {"name": filtered_update["name"]},
            exclude_id=department_id,
            include_deleted=True
        )

    # Validate unique constraint for cctnsDepartmentCd if it's being updated
    if "cctnsDepartmentCd" in filtered_update:
        await validate_unique_constraint(
            db,
            Collections.DEPARTMENT,
            {"cctnsDepartmentCd": filtered_update["cctnsDepartmentCd"]},
            exclude_id=department_id,
            include_deleted=True
        )

    # Set updatedBy and updatedAt
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()

    # Update in database
    try:
        await db[Collections.DEPARTMENT].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_UPDATE_DUPLICATE_NAME,
            parameters={"department_id": department_id, "name": filtered_update.get("name"), "cctnsDepartmentCd": filtered_update.get("cctnsDepartmentCd")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name, cctnsDepartmentCd")
        )

    updated_department = await db[Collections.DEPARTMENT].find_one({"_id": object_id})

    return convert_objectid_to_str(updated_department)


async def delete_department(
    department_id: str,
    current_user_id: str,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a department record

    Args:
        department_id: The department ID to delete
        current_user_id: ID of the user performing delete
        deleted_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If department not found, already deleted, or has mapped units/unit types
    """
    db = get_database()

    if not ObjectId.is_valid(department_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_DELETE_FAILED,
            parameters={"department_id": department_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="department_id")
        )

    object_id = ObjectId(department_id)

    # Check if department exists
    existing_department = await db[Collections.DEPARTMENT].find_one({"_id": object_id})
    if not existing_department:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_DELETE_NOT_FOUND,
            parameters={"department_id": department_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("department_not_found")
        )

    # Check if already deleted (handle both field names)
    is_deleted = existing_department.get("isDelete", existing_department.get("isDeleted", False))
    if is_deleted:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_DELETE_ALREADY_DELETED,
            parameters={"department_id": department_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("already_deleted")
        )

    # Check if any units are using this department (among non-deleted units)
    unit_using_department = await db[Collections.UNIT].find_one({
        "departmentId": object_id,
        "isDelete": False
    })
    if unit_using_department:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_DELETE_HAS_REFERENCES,
            parameters={"department_id": department_id, "reference": "units"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("department_has_units")
        )

    # Check if any unit types are using this department (among non-deleted unit types)
    unit_type_using_department = await db[Collections.UNIT_TYPE].find_one({
        "departmentId": object_id,
        "isDelete": False
    })
    if unit_type_using_department:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_DELETE_HAS_REFERENCES,
            parameters={"department_id": department_id, "reference": "unit_types"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("department_has_unit_types")
        )

    # Soft delete - sets isDelete=True
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }

    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    await db[Collections.DEPARTMENT].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def restore_department(
    department_id: str,
    current_user_id: str,
    restored_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Restore a soft-deleted department record

    Args:
        department_id: The department ID to restore
        current_user_id: ID of the user performing restore
        restored_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        Restored department document

    Raises:
        HTTPException: If department not found or not deleted
    """
    db = get_database()

    if not ObjectId.is_valid(department_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_UPDATE_FAILED,
            parameters={"department_id": department_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="department_id")
        )

    object_id = ObjectId(department_id)

    # Check if department exists
    existing_department = await db[Collections.DEPARTMENT].find_one({"_id": object_id})
    if not existing_department:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_UPDATE_NOT_FOUND,
            parameters={"department_id": department_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("department_not_found")
        )

    # Check if actually deleted
    is_deleted = existing_department.get("isDelete", existing_department.get("isDeleted", False))
    if not is_deleted:
        await log_error(
            request=request,
            error_code=ErrorCodes.DEPARTMENT_UPDATE_FAILED,
            parameters={"department_id": department_id, "reason": "Department is not deleted"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("not_deleted")
        )

    # Validate unique constraint for name before restore (check against non-deleted records)
    name = existing_department.get("name")
    if name:
        existing_with_name = await db[Collections.DEPARTMENT].find_one({
            "name": name,
            "isDelete": False,
            "_id": {"$ne": object_id}
        })
        if existing_with_name:
            await log_error(
                request=request,
                error_code=ErrorCodes.DEPARTMENT_UPDATE_DUPLICATE_NAME,
                parameters={"department_id": department_id, "name": name},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists", field_names="name")
            )

    # Validate unique constraint for cctnsDepartmentCd before restore
    cctns_code = existing_department.get("cctnsDepartmentCd")
    if cctns_code:
        existing_with_code = await db[Collections.DEPARTMENT].find_one({
            "cctnsDepartmentCd": cctns_code,
            "isDelete": False,
            "_id": {"$ne": object_id}
        })
        if existing_with_code:
            await log_error(
                request=request,
                error_code=ErrorCodes.DEPARTMENT_UPDATE_DUPLICATE_NAME,
                parameters={"department_id": department_id, "cctnsDepartmentCd": cctns_code},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists", field_names="cctnsDepartmentCd")
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

    await db[Collections.DEPARTMENT].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    restored_department = await db[Collections.DEPARTMENT].find_one({"_id": object_id})

    return convert_objectid_to_str(restored_department)


async def list_departments(
    include_deleted: bool = False,
    is_active: Optional[bool] = True,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Tuple[List[dict], int]:
    """
    List departments with optional pagination and filters

    Args:
        include_deleted: Whether to include soft-deleted records
        is_active: Filter by active status (True=active only, False=inactive only, None=all)
        search: Search term for name or cctnsDepartmentCd
        page: Page number (optional)
        page_size: Items per page (optional)

    Returns:
        Tuple of (list of departments, total count)
    """
    db = get_database()

    # Build query
    query = {}

    # Filter by delete status (handle both old isDeleted and new isDelete)
    if not include_deleted:
        query["$or"] = [
            {"isDelete": False},
            {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
        ]

    # Filter by active status (default: only active records)
    if is_active is not None:
        query["isActive"] = is_active

    # Search across multiple fields
    if search:
        search_query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"cctnsDepartmentCd": {"$regex": search, "$options": "i"}}
            ]
        }
        if "$or" in query:
            query = {"$and": [query, search_query]}
        else:
            query.update(search_query)

    # Get total count
    total = await db[Collections.DEPARTMENT].count_documents(query)

    # Build cursor
    cursor = db[Collections.DEPARTMENT].find(query).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    departments_list = await cursor.to_list(length=None)

    # Convert documents for JSON
    result_list = [convert_objectid_to_str(d) for d in departments_list]

    return result_list, total
