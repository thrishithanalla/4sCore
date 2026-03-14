"""
Designation Master Service Module
Provides business logic for Designation Master management
"""
import re
from typing import List, Optional, Tuple
from bson import ObjectId
from fastapi import Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.designation_master_schema import (
    DesignationMasterCreateSchema,
    DesignationMasterUpdateSchema,
    DesignationMasterActiveToggleSchema,
    DesignationMasterBulkCreateItemSchema
)
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error
from app.utils.error_messages import get_business_error

# Collection name from centralized constants
COLLECTION_NAME = Collections.DESIGNATION_MASTER


def _convert_document_for_json(document: dict) -> dict:
    """Convert MongoDB document fields for JSON serialization"""
    if not document:
        return document

    from datetime import datetime

    result = {}
    for key, value in document.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        else:
            result[key] = value

    return result


async def _check_name_exists(db, name: str, exclude_id: str = None) -> bool:
    """Check if name already exists (case-insensitive, check against all records including deleted)"""
    query = {
        "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}
    }
    if exclude_id:
        query["_id"] = {"$ne": ObjectId(exclude_id)}
    return await db[COLLECTION_NAME].find_one(query) is not None


async def _check_code_exists(db, code: str, exclude_id: str = None) -> bool:
    """Check if designationCd already exists (case-insensitive, check against all records including deleted)"""
    query = {
        "designationCd": {"$regex": f"^{re.escape(code)}$", "$options": "i"}
    }
    if exclude_id:
        query["_id"] = {"$ne": ObjectId(exclude_id)}
    return await db[COLLECTION_NAME].find_one(query) is not None


async def create_designation_master(
    data: DesignationMasterCreateSchema,
    created_by: str,
    created_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new designation master

    Args:
        data: Designation master creation schema
        created_by: User ID who is creating this record (from token id)
        created_ip: IP address of the client making the request
        request: FastAPI Request object for error logging

    Returns:
        Created designation master document

    Raises:
        ValueError: If name or designationCd already exists
    """
    db = get_database()

    if await _check_name_exists(db, data.name):
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_CREATE_DUPLICATE_NAME,
            parameters={"name": data.name},
            actor_user_id=created_by
        )
        raise ValueError(f"Designation with name '{data.name}' already exists")

    if await _check_code_exists(db, data.designationCd):
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_CREATE_DUPLICATE_CODE,
            parameters={"designationCd": data.designationCd},
            actor_user_id=created_by
        )
        raise ValueError(f"Designation with code '{data.designationCd}' already exists")

    designation_dict = data.model_dump()
    designation_dict.update({
        "isActive": True,
        "isDelete": False,
        "createdBy": ObjectId(created_by),
        "createdAt": get_ist_now(),
        "createdIp": created_ip,
        "updatedBy": None,
        "updatedAt": None,
        "updatedIp": None
    })

    result = await db[COLLECTION_NAME].insert_one(designation_dict)
    created_designation = await db[COLLECTION_NAME].find_one({"_id": result.inserted_id})

    return _convert_document_for_json(created_designation)


async def bulk_create_designation_masters(
    items: List[DesignationMasterBulkCreateItemSchema],
    created_by: str,
    created_ip: Optional[str] = None
) -> dict:
    """
    Bulk create designation masters

    Args:
        items: List of designation master items to create
        created_by: User ID who is creating these records (from token id)
        created_ip: IP address of the client making the request

    Returns:
        Dictionary with totalProcessed, successCount, failedCount, successful, failed
    """
    db = get_database()
    successful = []
    failed = []

    for idx, item in enumerate(items):
        try:
            if await _check_name_exists(db, item.name):
                failed.append({
                    "index": idx,
                    "name": item.name,
                    "designationCd": item.designationCd,
                    "errors": f"Designation with name '{item.name}' already exists"
                })
                continue

            if await _check_code_exists(db, item.designationCd):
                failed.append({
                    "index": idx,
                    "name": item.name,
                    "designationCd": item.designationCd,
                    "errors": f"Designation with code '{item.designationCd}' already exists"
                })
                continue

            designation_dict = item.model_dump()
            designation_dict.update({
                "isActive": True,
                "isDelete": False,
                "createdBy": ObjectId(created_by),
                "createdAt": get_ist_now(),
                "createdIp": created_ip,
                "updatedBy": None,
                "updatedAt": None,
                "updatedIp": None
            })

            result = await db[COLLECTION_NAME].insert_one(designation_dict)
            successful.append({
                "index": idx,
                "id": str(result.inserted_id),
                "name": item.name,
                "designationCd": item.designationCd
            })

        except Exception as e:
            failed.append({
                "index": idx,
                "name": item.name,
                "designationCd": item.designationCd,
                "errors": str(e)
            })

    return {
        "totalProcessed": len(items),
        "successCount": len(successful),
        "failedCount": len(failed),
        "successful": successful,
        "failed": failed
    }


async def update_designation_master(
    designation_id: str,
    patch: DesignationMasterUpdateSchema,
    updated_by: str,
    updated_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Update an existing designation master (partial update)

    Args:
        designation_id: Designation Master ID
        patch: Update schema with fields to change
        updated_by: User ID who is updating this record (from token id)
        updated_ip: IP address of the client making the request
        request: FastAPI Request object for error logging

    Returns:
        Updated designation master document

    Raises:
        ValueError: If designation not found, already deleted, or conflicts exist
    """
    db = get_database()

    existing = await db[COLLECTION_NAME].find_one({
        "_id": ObjectId(designation_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_UPDATE_NOT_FOUND,
            parameters={"designation_id": designation_id},
            actor_user_id=updated_by
        )
        raise ValueError(f"Designation with ID '{designation_id}' not found or already deleted")

    update_data = patch.model_dump(exclude_unset=True)

    if not update_data and updated_ip is None:
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_UPDATE_FAILED,
            parameters={"designation_id": designation_id, "reason": "No fields to update"},
            actor_user_id=updated_by
        )
        raise ValueError("No fields to update")

    if "name" in update_data and await _check_name_exists(db, update_data["name"], designation_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_UPDATE_DUPLICATE_NAME,
            parameters={"designation_id": designation_id, "name": update_data["name"]},
            actor_user_id=updated_by
        )
        raise ValueError(f"Designation with name '{update_data['name']}' already exists")

    if "designationCd" in update_data and await _check_code_exists(db, update_data["designationCd"], designation_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_UPDATE_DUPLICATE_CODE,
            parameters={"designation_id": designation_id, "designationCd": update_data["designationCd"]},
            actor_user_id=updated_by
        )
        raise ValueError(f"Designation with code '{update_data['designationCd']}' already exists")

    update_data["updatedBy"] = ObjectId(updated_by)
    update_data["updatedAt"] = get_ist_now()
    if updated_ip is not None:
        update_data["updatedIp"] = updated_ip

    await db[COLLECTION_NAME].update_one(
        {"_id": ObjectId(designation_id)},
        {"$set": update_data}
    )
    updated_designation = await db[COLLECTION_NAME].find_one({"_id": ObjectId(designation_id)})

    return _convert_document_for_json(updated_designation)


async def delete_designation_master(
    designation_id: str,
    updated_by: str,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a designation master

    Args:
        designation_id: Designation Master ID
        updated_by: User ID who is deleting this record (from token id)
        deleted_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If designation not found or already deleted
    """
    db = get_database()

    existing = await db[COLLECTION_NAME].find_one({
        "_id": ObjectId(designation_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_DELETE_NOT_FOUND,
            parameters={"designation_id": designation_id},
            actor_user_id=updated_by
        )
        raise ValueError(f"Designation with ID '{designation_id}' not found or already deleted")

    # Check if any personnel are using this designation (among non-deleted personnel)
    # Personnel have units array where each unit has a designationId
    personnel_using_designation = await db[Collections.PERSONNEL_MASTER].find_one({
        "units.designationId": ObjectId(designation_id),
        "isDelete": False
    })
    if personnel_using_designation:
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_DELETE_IN_USE,
            parameters={"designation_id": designation_id, "reference": "personnel"},
            actor_user_id=updated_by
        )
        raise ValueError(get_business_error("designation_has_personnel"))

    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(updated_by),
        "updatedAt": get_ist_now()
    }
    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    result = await db[COLLECTION_NAME].update_one(
        {"_id": ObjectId(designation_id)},
        {"$set": update_data}
    )

    return result.modified_count > 0


async def restore_designation_master(
    designation_id: str,
    updated_by: str,
    restored_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Restore a soft-deleted designation master

    Args:
        designation_id: Designation Master ID
        updated_by: User ID who is restoring this record (from token id)
        restored_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        Restored designation master document

    Raises:
        ValueError: If designation not found or not deleted
    """
    db = get_database()

    existing = await db[COLLECTION_NAME].find_one({
        "_id": ObjectId(designation_id),
        "isDelete": True
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_RESTORE_NOT_FOUND,
            parameters={"designation_id": designation_id},
            actor_user_id=updated_by
        )
        raise ValueError(f"Designation with ID '{designation_id}' not found or not deleted")

    update_data = {
        "isDelete": False,
        "updatedBy": ObjectId(updated_by),
        "updatedAt": get_ist_now()
    }
    if restored_ip:
        update_data["updatedIp"] = restored_ip

    await db[COLLECTION_NAME].update_one(
        {"_id": ObjectId(designation_id)},
        {"$set": update_data}
    )

    restored_designation = await db[COLLECTION_NAME].find_one({"_id": ObjectId(designation_id)})
    return _convert_document_for_json(restored_designation)


async def toggle_active_designation_master(
    designation_id: str,
    toggle_data: DesignationMasterActiveToggleSchema,
    updated_by: str,
    updated_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Toggle isActive status of a designation master

    Args:
        designation_id: Designation Master ID
        toggle_data: Schema containing new isActive value
        updated_by: User ID who is updating this record (from token id)
        updated_ip: IP address of the client making the request
        request: FastAPI Request object for error logging

    Returns:
        Updated designation master document

    Raises:
        ValueError: If designation not found or already deleted
    """
    db = get_database()

    existing = await db[COLLECTION_NAME].find_one({
        "_id": ObjectId(designation_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.DESIGNATION_TOGGLE_NOT_FOUND,
            parameters={"designation_id": designation_id},
            actor_user_id=updated_by
        )
        raise ValueError(f"Designation with ID '{designation_id}' not found or already deleted")

    update_data = {
        "isActive": toggle_data.isActive,
        "updatedBy": ObjectId(updated_by),
        "updatedAt": get_ist_now()
    }
    if updated_ip is not None:
        update_data["updatedIp"] = updated_ip

    await db[COLLECTION_NAME].update_one(
        {"_id": ObjectId(designation_id)},
        {"$set": update_data}
    )

    updated_designation = await db[COLLECTION_NAME].find_one({"_id": ObjectId(designation_id)})
    return _convert_document_for_json(updated_designation)


async def get_designation_master(designation_id: str) -> Optional[dict]:
    """
    Get a single designation master by ID (excludes soft-deleted)

    Args:
        designation_id: Designation Master ID

    Returns:
        Designation master document or None if not found
    """
    db = get_database()

    designation = await db[COLLECTION_NAME].find_one({
        "_id": ObjectId(designation_id),
        "isDelete": False
    })

    if not designation:
        return None

    return _convert_document_for_json(designation)


async def list_designation_masters(
    include_deleted: bool = False,
    search: Optional[str] = None,
    page: Optional[int] = None,
    limit: Optional[int] = None
) -> Tuple[List[dict], int]:
    """
    List designation masters with optional pagination and filters

    Args:
        include_deleted: If True, include deleted records (isActive=True AND any isDelete)
                        If False, only non-deleted records (isDelete=False)
        search: Search in name or designationCd
        page: Page number (optional, if not provided returns all)
        limit: Number of records per page (optional, if not provided returns all)

    Returns:
        Tuple of (list of designation master documents, total count)
    """
    db = get_database()

    query = {"isActive": True} if include_deleted else {"isDelete": False}

    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"designationCd": {"$regex": search, "$options": "i"}}
        ]

    total = await db[COLLECTION_NAME].count_documents(query)
    cursor = db[COLLECTION_NAME].find(query).sort("createdAt", -1)

    if page is not None and limit is not None:
        skip = (page - 1) * limit
        cursor = cursor.skip(skip).limit(limit)

    designations = await cursor.to_list(length=None)

    return [_convert_document_for_json(d) for d in designations], total
