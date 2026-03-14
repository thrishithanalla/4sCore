"""
UnitType Service
Business logic for UnitType collection operations
"""
import logging
from typing import Optional, List, Tuple
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status, Request
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.utils.validators import validate_unique_constraint, validate_foreign_key
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
    objectid_fields = ["departmentId", "createdBy", "updatedBy"]
    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    datetime_fields = ["createdAt", "updatedAt"]
    for field in datetime_fields:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


async def populate_unit_type_relations(db, document: dict) -> dict:
    """Populate foreign key relations with actual data"""
    if not document:
        return document

    # Populate department (handle both isDelete and isDeleted for backwards compatibility)
    if document.get("departmentId"):
        dept_id = document["departmentId"] if isinstance(document["departmentId"], ObjectId) else ObjectId(document["departmentId"])
        department = await db[Collections.DEPARTMENT].find_one({
            "_id": dept_id,
            "$or": [
                {"isDelete": False},
                {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
            ]
        })
        if department:
            document["department"] = {
                "_id": str(department["_id"]),
                "name": department.get("name"),
                "cctnsDepartmentCd": department.get("cctnsDepartmentCd")
            }

    return document


async def create_unit_type(
    unit_type_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new unit type record

    Args:
        unit_type_data: Unit type data from schema
        current_user_id: ID of the user creating the record

    Returns:
        Created unit type document

    Raises:
        HTTPException: If validation fails or creation error
    """
    db = get_database()

    # Validate unique constraint for name (check against all records including deleted)
    await validate_unique_constraint(
        db,
        Collections.UNIT_TYPE,
        {"name": unit_type_data["name"]},
        exclude_id=None,
        include_deleted=True
    )

    # Validate foreign key for departmentId (if provided)
    if unit_type_data.get("departmentId"):
        await validate_foreign_key(
            db, Collections.DEPARTMENT, "departmentId", unit_type_data["departmentId"], required=False
        )

    # Prepare unit type document
    unit_type_dict = {**unit_type_data}
    unit_type_dict.pop("createdBy", None)  # Remove deprecated field from payload
    unit_type_dict["createdAt"] = get_ist_now()
    unit_type_dict["isActive"] = True
    unit_type_dict["isDelete"] = False
    unit_type_dict["createdBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id

    # Convert departmentId to ObjectId if valid
    if unit_type_dict.get("departmentId") and ObjectId.is_valid(unit_type_dict["departmentId"]):
        unit_type_dict["departmentId"] = ObjectId(unit_type_dict["departmentId"])

    # Insert into database
    try:
        result = await db[Collections.UNIT_TYPE].insert_one(unit_type_dict)
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_CREATE_DUPLICATE_NAME,
            parameters={"name": unit_type_data.get("name")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name")
        )

    created_unit_type = await db[Collections.UNIT_TYPE].find_one({"_id": result.inserted_id})

    # Populate relations
    created_unit_type = await populate_unit_type_relations(db, created_unit_type)

    return convert_objectid_to_str(created_unit_type)


async def get_unit_type(unit_type_id: str) -> Optional[dict]:
    """
    Get a unit type by ID (includes soft-deleted records)

    Args:
        unit_type_id: The unit type ID

    Returns:
        Unit type document or None
    """
    db = get_database()

    if not ObjectId.is_valid(unit_type_id):
        return None

    unit_type = await db[Collections.UNIT_TYPE].find_one({"_id": ObjectId(unit_type_id)})

    if unit_type:
        # Populate relations
        unit_type = await populate_unit_type_relations(db, unit_type)
        return convert_objectid_to_str(unit_type)

    return None


async def update_unit_type(
    unit_type_id: str,
    update_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Update a unit type record

    Args:
        unit_type_id: The unit type ID to update
        update_data: Fields to update
        current_user_id: ID of the user performing update
        request: FastAPI Request object for error logging

    Returns:
        Updated unit type document

    Raises:
        HTTPException: If validation fails or unit type not found
    """
    db = get_database()

    if not ObjectId.is_valid(unit_type_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
            parameters={"unit_type_id": unit_type_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="unit_type_id")
        )

    object_id = ObjectId(unit_type_id)

    # Check if unit type exists (handle both isDelete and isDeleted)
    existing_unit_type = await db[Collections.UNIT_TYPE].find_one({
        "_id": object_id,
        "$or": [
            {"isDelete": False},
            {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
        ]
    })
    if not existing_unit_type:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND,
            parameters={"unit_type_id": unit_type_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("unit_type_not_found")
        )

    # Filter out None values and prepare update
    filtered_update = {k: v for k, v in update_data.items() if v is not None}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
            parameters={"unit_type_id": unit_type_id, "reason": "No fields to update"},
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
            Collections.UNIT_TYPE,
            {"name": filtered_update["name"]},
            exclude_id=unit_type_id,
            include_deleted=True
        )

    # Validate foreign key if departmentId is being updated
    if "departmentId" in filtered_update:
        await validate_foreign_key(
            db, Collections.DEPARTMENT, "departmentId", filtered_update["departmentId"], required=False
        )
        # Convert to ObjectId
        if ObjectId.is_valid(filtered_update["departmentId"]):
            filtered_update["departmentId"] = ObjectId(filtered_update["departmentId"])

    # Set updatedBy and updatedAt
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()

    # Update in database
    try:
        await db[Collections.UNIT_TYPE].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_DUPLICATE_NAME,
            parameters={"unit_type_id": unit_type_id, "name": filtered_update.get("name")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name")
        )

    updated_unit_type = await db[Collections.UNIT_TYPE].find_one({"_id": object_id})

    # Populate relations
    updated_unit_type = await populate_unit_type_relations(db, updated_unit_type)

    return convert_objectid_to_str(updated_unit_type)


async def delete_unit_type(
    unit_type_id: str,
    current_user_id: str,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a unit type record

    Args:
        unit_type_id: The unit type ID to delete
        current_user_id: ID of the user performing delete
        deleted_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If unit type not found or has mapped units
    """
    db = get_database()

    if not ObjectId.is_valid(unit_type_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_DELETE_FAILED,
            parameters={"unit_type_id": unit_type_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="unit_type_id")
        )

    object_id = ObjectId(unit_type_id)

    # Check if unit type exists (handle both isDelete and isDeleted)
    existing_unit_type = await db[Collections.UNIT_TYPE].find_one({
        "_id": object_id,
        "$or": [
            {"isDelete": False},
            {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
        ]
    })
    if not existing_unit_type:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_DELETE_NOT_FOUND,
            parameters={"unit_type_id": unit_type_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("unit_type_not_found")
        )

    # Check if any units are using this unit type (among non-deleted units)
    unit_using_type = await db[Collections.UNIT].find_one({
        "unitTypeId": object_id,
        "isDelete": False
    })
    if unit_using_type:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_DELETE_HAS_REFERENCES,
            parameters={"unit_type_id": unit_type_id, "reference": "units"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("unit_type_has_units")
        )

    # Soft delete
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }
    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    await db[Collections.UNIT_TYPE].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def restore_unit_type(
    unit_type_id: str,
    current_user_id: str,
    restored_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Restore a soft-deleted unit type record

    Args:
        unit_type_id: The unit type ID to restore
        current_user_id: ID of the user performing restore
        restored_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If unit type not found or not deleted
    """
    db = get_database()

    if not ObjectId.is_valid(unit_type_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_RESTORE_FAILED,
            parameters={"unit_type_id": unit_type_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="unit_type_id")
        )

    object_id = ObjectId(unit_type_id)

    # Check if unit type exists (including soft-deleted)
    existing_unit_type = await db[Collections.UNIT_TYPE].find_one({"_id": object_id})
    if not existing_unit_type:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_RESTORE_NOT_FOUND,
            parameters={"unit_type_id": unit_type_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("unit_type_not_found")
        )

    # Check if already active (handle both old isDeleted and new isDelete)
    is_deleted = existing_unit_type.get("isDelete", existing_unit_type.get("isDeleted", False))
    if not is_deleted:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_RESTORE_ALREADY_ACTIVE,
            parameters={"unit_type_id": unit_type_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("already_active")
        )

    # Restore (set isDelete to False, isActive to True)
    update_data = {
        "isActive": True,
        "isDelete": False,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }
    if restored_ip:
        update_data["updatedIp"] = restored_ip

    await db[Collections.UNIT_TYPE].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def list_unit_types(
    include_deleted: bool = False,
    search: Optional[str] = None,
    department_id: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Tuple[List[dict], int]:
    """
    List unit types with optional pagination and filters

    Args:
        include_deleted: Whether to include soft-deleted records
        search: Search term for name
        department_id: Filter by department ID
        page: Page number (optional)
        page_size: Items per page (optional)

    Returns:
        Tuple of (list of unit types, total count)
    """
    db = get_database()

    # Build query (handle both old isDeleted and new isDelete)
    query = {}
    if not include_deleted:
        query["$or"] = [
            {"isDelete": False},
            {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
        ]

    # Search by name
    if search:
        search_query = {"name": {"$regex": search, "$options": "i"}}
        if "$or" in query:
            query = {"$and": [query, search_query]}
        else:
            query.update(search_query)

    # Filter by departmentId
    if department_id:
        if ObjectId.is_valid(department_id):
            dept_filter = {"departmentId": ObjectId(department_id)}
            if "$and" in query:
                query["$and"].append(dept_filter)
            elif "$or" in query:
                query = {"$and": [query, dept_filter]}
            else:
                query.update(dept_filter)

    # Get total count
    total = await db[Collections.UNIT_TYPE].count_documents(query)

    # Build cursor
    cursor = db[Collections.UNIT_TYPE].find(query).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    unit_types_list = await cursor.to_list(length=None)

    # Bulk populate departments - collect all unique department IDs
    dept_ids = set()
    for ut in unit_types_list:
        if ut.get("departmentId"):
            dept_id = ut["departmentId"]
            if isinstance(dept_id, ObjectId):
                dept_ids.add(dept_id)
            elif ObjectId.is_valid(dept_id):
                dept_ids.add(ObjectId(dept_id))

    # Fetch all departments in one query
    dept_map = {}
    if dept_ids:
        departments = await db[Collections.DEPARTMENT].find({
            "_id": {"$in": list(dept_ids)},
            "$or": [
                {"isDelete": False},
                {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
            ]
        }).to_list(length=None)

        for dept in departments:
            dept_map[dept["_id"]] = {
                "_id": str(dept["_id"]),
                "name": dept.get("name"),
                "cctnsDepartmentCd": dept.get("cctnsDepartmentCd")
            }

    # Convert documents and attach populated department
    result_list = []
    for ut in unit_types_list:
        # Attach department from cache
        if ut.get("departmentId"):
            dept_id = ut["departmentId"] if isinstance(ut["departmentId"], ObjectId) else ObjectId(ut["departmentId"])
            if dept_id in dept_map:
                ut["department"] = dept_map[dept_id]

        result_list.append(convert_objectid_to_str(ut))

    return result_list, total
