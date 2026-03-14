"""
Permissions Mapping Service
Business logic for permissions mapping operations
"""
from typing import List, Optional, Tuple
from bson import ObjectId
from fastapi import HTTPException, status, Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.permissions_mapping_schema import PermissionsMappingCreateSchema
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error


def _convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    from datetime import datetime
    if not document:
        return document
    if "_id" in document:
        document["_id"] = str(document["_id"])
    for field in ["moduleId", "jobId", "permissionId", "createdBy", "updatedBy"]:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])
    # Convert datetime fields to ISO format strings
    for field in ["createdAt", "updatedAt"]:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()
    return document


async def _validate_module(db, module_id: str):
    """
    Validate that module ID exists in the modules collection

    Args:
        db: Database instance
        module_id: Module ID to validate

    Raises:
        ValueError: If module ID is invalid, doesn't exist, or is soft-deleted
    """
    if not module_id or not ObjectId.is_valid(module_id):
        raise ValueError(f"Invalid moduleId format: '{module_id}'. Must be a 24-character hex string.")

    module = await db[Collections.MODULES].find_one({
        "_id": ObjectId(module_id),
        "isDelete": False
    })
    if not module:
        raise ValueError(f"Module with ID '{module_id}' not found or is deleted")
    return module


async def _validate_job(db, job_id: str):
    """
    Validate that job ID exists in the jobs collection

    Args:
        db: Database instance
        job_id: Job ID to validate

    Raises:
        ValueError: If job ID is invalid, doesn't exist, or is soft-deleted
    """
    if not job_id or not ObjectId.is_valid(job_id):
        raise ValueError(f"Invalid jobId format: '{job_id}'. Must be a 24-character hex string.")

    job = await db[Collections.JOBS].find_one({
        "_id": ObjectId(job_id),
        "isDelete": False
    })
    if not job:
        raise ValueError(f"Job with ID '{job_id}' not found or is deleted")
    return job


async def _validate_permission(db, permission_id: str):
    """
    Validate that permission ID exists in the permissions collection

    Args:
        db: Database instance
        permission_id: Permission ID to validate

    Raises:
        ValueError: If permission ID is invalid, doesn't exist, or is soft-deleted
    """
    if not permission_id or not ObjectId.is_valid(permission_id):
        raise ValueError(f"Invalid permissionId format: '{permission_id}'. Must be a 24-character hex string.")

    permission = await db[Collections.PERMISSIONS].find_one({
        "_id": ObjectId(permission_id),
        "isDelete": False
    })
    if not permission:
        raise ValueError(f"Permission with ID '{permission_id}' not found or is deleted")
    return permission


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_permissions_mapping(
    data: PermissionsMappingCreateSchema,
    created_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new permissions mapping

    Args:
        data: Permissions mapping creation data
        created_by: User ID creating the mapping
        client_ip: IP address of the client making the request

    Returns:
        Created permissions mapping document

    Raises:
        ValueError: If moduleId, jobId, or permissionId don't exist, or mapping already exists
    """
    db = get_database()

    # Validate that module, job, and permission exist
    module = await _validate_module(db, data.moduleId)
    job = await _validate_job(db, data.jobId)
    permission = await _validate_permission(db, data.permissionId)

    # Check if mapping already exists (moduleId + jobId + permissionId must be unique, check against all records including deleted)
    existing_mapping = await db[Collections.PERMISSION_MAPPINGS].find_one({
        "moduleId": ObjectId(data.moduleId),
        "jobId": ObjectId(data.jobId),
        "permissionId": ObjectId(data.permissionId)
    })
    if existing_mapping:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_CREATE_DUPLICATE,
            parameters={"moduleId": data.moduleId, "jobId": data.jobId, "permissionId": data.permissionId},
            actor_user_id=created_by
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Permissions mapping for moduleId '{data.moduleId}', jobId '{data.jobId}', and permissionId '{data.permissionId}' already exists"
        )

    # Prepare document
    mapping_dict = {
        "moduleId": ObjectId(data.moduleId),
        "jobId": ObjectId(data.jobId),
        "permissionId": ObjectId(data.permissionId),
        "isActive": True,
        "isDelete": False,
        "createdBy": ObjectId(created_by) if ObjectId.is_valid(created_by) else created_by,
        "createdAt": get_ist_now(),
        "createdIp": client_ip
    }

    # Insert into database
    result = await db[Collections.PERMISSION_MAPPINGS].insert_one(mapping_dict)

    # Fetch and return the created document
    created_mapping = await db[Collections.PERMISSION_MAPPINGS].find_one({"_id": result.inserted_id})

    # Add names for response
    created_mapping["moduleName"] = module.get("name", "")
    created_mapping["jobName"] = job.get("name", "")
    created_mapping["permissionName"] = permission.get("name", "")

    return _convert_objectid_to_str(created_mapping)


async def bulk_create_permissions_mappings(
    data_list: List[PermissionsMappingCreateSchema],
    created_by: str,
    client_ip: Optional[str] = None
) -> dict:
    """
    Create multiple permissions mappings at once

    Args:
        data_list: List of permissions mapping creation data
        created_by: User ID creating the mappings
        client_ip: IP address of the client making the request

    Returns:
        Dictionary with success count, failed count, and details of failures
    """
    db = get_database()

    successful = []
    failed = []

    for idx, data in enumerate(data_list):
        try:
            # Validate that module, job, and permission exist
            module = await _validate_module(db, data.moduleId)
            job = await _validate_job(db, data.jobId)
            permission = await _validate_permission(db, data.permissionId)

            # Check if mapping already exists (check against all records including deleted)
            existing_mapping = await db[Collections.PERMISSION_MAPPINGS].find_one({
                "moduleId": ObjectId(data.moduleId),
                "jobId": ObjectId(data.jobId),
                "permissionId": ObjectId(data.permissionId)
            })
            if existing_mapping:
                failed.append({
                    "index": idx,
                    "data": data.model_dump(),
                    "errors": "Mapping already exists"
                })
                continue

            # Prepare document
            mapping_dict = {
                "moduleId": ObjectId(data.moduleId),
                "jobId": ObjectId(data.jobId),
                "permissionId": ObjectId(data.permissionId),
                "isActive": True,
                "isDelete": False,
                "createdBy": ObjectId(created_by) if ObjectId.is_valid(created_by) else created_by,
                "createdAt": get_ist_now(),
                "createdIp": client_ip
            }

            # Insert into database
            result = await db[Collections.PERMISSION_MAPPINGS].insert_one(mapping_dict)

            successful.append({
                "index": idx,
                "id": str(result.inserted_id),
                "moduleId": data.moduleId,
                "jobId": data.jobId,
                "permissionId": data.permissionId
            })

        except ValueError as e:
            failed.append({
                "index": idx,
                "data": data.model_dump(),
                "errors": str(e)
            })
        except Exception as e:
            failed.append({
                "index": idx,
                "data": data.model_dump(),
                "errors": f"Unexpected error: {str(e)}"
            })

    return {
        "totalProcessed": len(data_list),
        "successCount": len(successful),
        "failedCount": len(failed),
        "successful": successful,
        "failed": failed
    }


async def update_permissions_mapping(
    mapping_id: str,
    update_data: dict,
    updated_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Update an existing permissions mapping (partial update)

    Args:
        mapping_id: Permissions mapping ID
        update_data: Fields to update
        updated_by: User ID performing the update
        client_ip: IP address of the client making the request

    Returns:
        Updated permissions mapping document

    Raises:
        HTTPException: If mapping_id is invalid, mapping not found, already deleted, or new values invalid
    """
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    # Check if mapping exists and is not deleted
    existing = await db[Collections.PERMISSION_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_UPDATE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission mapping not found or already deleted"
        )

    # Filter out None values
    filtered_update = {k: v for k, v in update_data.items() if v is not None and k != "updatedIp"}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "No fields to update"},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    # Validate new values if provided
    if "moduleId" in filtered_update:
        await _validate_module(db, filtered_update["moduleId"])
        filtered_update["moduleId"] = ObjectId(filtered_update["moduleId"])

    if "jobId" in filtered_update:
        await _validate_job(db, filtered_update["jobId"])
        filtered_update["jobId"] = ObjectId(filtered_update["jobId"])

    if "permissionId" in filtered_update:
        await _validate_permission(db, filtered_update["permissionId"])
        filtered_update["permissionId"] = ObjectId(filtered_update["permissionId"])

    # Check uniqueness if any of the key fields are being updated
    # Check uniqueness if updating any of the key fields (check against all records including deleted)
    if "moduleId" in filtered_update or "jobId" in filtered_update or "permissionId" in filtered_update:
        check_module_id = filtered_update.get("moduleId", existing["moduleId"])
        check_job_id = filtered_update.get("jobId", existing["jobId"])
        check_permission_id = filtered_update.get("permissionId", existing["permissionId"])

        mapping_exists = await db[Collections.PERMISSION_MAPPINGS].find_one({
            "moduleId": check_module_id,
            "jobId": check_job_id,
            "permissionId": check_permission_id,
            "_id": {"$ne": ObjectId(mapping_id)}
        })
        if mapping_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_DUPLICATE,
                parameters={"mapping_id": mapping_id, "moduleId": str(check_module_id), "jobId": str(check_job_id), "permissionId": str(check_permission_id)},
                actor_user_id=updated_by
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Permission mapping with this combination already exists"
            )

    # Update metadata
    filtered_update["updatedBy"] = ObjectId(updated_by) if ObjectId.is_valid(updated_by) else updated_by
    filtered_update["updatedAt"] = get_ist_now()
    filtered_update["updatedIp"] = client_ip or update_data.get("updatedIp")

    # Update in database
    await db[Collections.PERMISSION_MAPPINGS].update_one(
        {"_id": ObjectId(mapping_id)},
        {"$set": filtered_update}
    )

    # Fetch and return updated document
    updated_mapping = await db[Collections.PERMISSION_MAPPINGS].find_one({"_id": ObjectId(mapping_id)})

    # Add names for response
    module = await db[Collections.MODULES].find_one({"_id": updated_mapping["moduleId"]})
    job = await db[Collections.JOBS].find_one({"_id": updated_mapping["jobId"]})
    permission = await db[Collections.PERMISSIONS].find_one({"_id": updated_mapping["permissionId"]})

    updated_mapping["moduleName"] = module.get("name", "") if module else ""
    updated_mapping["jobName"] = job.get("name", "") if job else ""
    updated_mapping["permissionName"] = permission.get("name", "") if permission else ""

    return _convert_objectid_to_str(updated_mapping)


async def delete_permissions_mapping(
    mapping_id: str,
    deleted_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a permissions mapping

    Args:
        mapping_id: Permissions mapping ID
        deleted_by: User ID performing the deletion
        client_ip: IP address of the client making the request

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If mapping_id is invalid, mapping not found, or already deleted
    """
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_DELETE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=deleted_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    # Check if mapping exists and is not deleted
    existing = await db[Collections.PERMISSION_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_DELETE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=deleted_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission mapping not found or already deleted"
        )

    # Soft delete
    result = await db[Collections.PERMISSION_MAPPINGS].update_one(
        {"_id": ObjectId(mapping_id)},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(deleted_by) if ObjectId.is_valid(deleted_by) else deleted_by,
                "updatedAt": get_ist_now(),
                "updatedIp": client_ip
            }
        }
    )

    return result.modified_count > 0


async def restore_permissions_mapping(
    mapping_id: str,
    restored_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Restore a soft-deleted permissions mapping

    Args:
        mapping_id: Permissions mapping ID
        restored_by: User ID performing the restoration
        client_ip: IP address of the client making the request

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If mapping_id is invalid, mapping not found, or not deleted
    """
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_RESTORE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=restored_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    # Check if mapping exists and is deleted
    existing = await db[Collections.PERMISSION_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": True
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_RESTORE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=restored_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permission mapping not found or not deleted"
        )

    # Restore (set isDelete to False only - isActive should be managed separately)
    result = await db[Collections.PERMISSION_MAPPINGS].update_one(
        {"_id": ObjectId(mapping_id)},
        {
            "$set": {
                "isDelete": False,
                "updatedBy": ObjectId(restored_by) if ObjectId.is_valid(restored_by) else restored_by,
                "updatedAt": get_ist_now(),
                "updatedIp": client_ip
            }
        }
    )

    return result.modified_count > 0


async def get_permissions_mapping(mapping_id: str) -> Optional[dict]:
    """
    Get a single permissions mapping by ID (excludes soft-deleted)

    Args:
        mapping_id: Permissions mapping ID

    Returns:
        Permissions mapping document or None if not found

    Raises:
        HTTPException: If mapping_id is not a valid ObjectId format
    """
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    mapping = await db[Collections.PERMISSION_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })

    if not mapping:
        return None

    # Add names for response
    module = await db[Collections.MODULES].find_one({"_id": mapping["moduleId"]})
    job = await db[Collections.JOBS].find_one({"_id": mapping["jobId"]})
    permission = await db[Collections.PERMISSIONS].find_one({"_id": mapping["permissionId"]})

    mapping["moduleName"] = module.get("name", "") if module else ""
    mapping["jobName"] = job.get("name", "") if job else ""
    mapping["permissionName"] = permission.get("name", "") if permission else ""

    return _convert_objectid_to_str(mapping)


async def list_permissions_mappings(
    include_deleted: bool = False,
    moduleId: Optional[str] = None,
    jobId: Optional[str] = None,
    permissionId: Optional[str] = None,
    page: Optional[int] = None,
    page_size: int = 10
) -> Tuple[List[dict], int]:
    """
    List permissions mappings with optional filters and pagination

    Args:
        include_deleted: Include soft-deleted records
        moduleId: Filter by module ID
        jobId: Filter by job ID
        permissionId: Filter by permission ID
        page: Page number (1-indexed). If None, returns all records.
        page_size: Number of records per page

    Returns:
        Tuple of (list of permissions mapping documents, total count)

    Raises:
        ValueError: If any provided ID is not a valid ObjectId format
    """
    db = get_database()

    # Build query
    query = {}
    if not include_deleted:
        query["isDelete"] = False

    # Validate and add filters
    if moduleId:
        if not ObjectId.is_valid(moduleId):
            raise ValueError(f"Invalid moduleId format: '{moduleId}'")
        query["moduleId"] = ObjectId(moduleId)
    if jobId:
        if not ObjectId.is_valid(jobId):
            raise ValueError(f"Invalid jobId format: '{jobId}'")
        query["jobId"] = ObjectId(jobId)
    if permissionId:
        if not ObjectId.is_valid(permissionId):
            raise ValueError(f"Invalid permissionId format: '{permissionId}'")
        query["permissionId"] = ObjectId(permissionId)

    # Get total count
    total = await db[Collections.PERMISSION_MAPPINGS].count_documents(query)

    # Execute query with or without pagination
    cursor = db[Collections.PERMISSION_MAPPINGS].find(query).sort("createdAt", -1)

    if page is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)
        mappings = await cursor.to_list(length=page_size)
    else:
        mappings = await cursor.to_list(length=None)

    if not mappings:
        return [], total

    # Collect unique IDs for bulk fetch
    module_ids = {m["moduleId"] for m in mappings}
    job_ids = {m["jobId"] for m in mappings}
    permission_ids = {m["permissionId"] for m in mappings}

    # Bulk fetch related data
    modules = await db[Collections.MODULES].find({"_id": {"$in": list(module_ids)}}).to_list(None)
    jobs = await db[Collections.JOBS].find({"_id": {"$in": list(job_ids)}}).to_list(None)
    permissions = await db[Collections.PERMISSIONS].find({"_id": {"$in": list(permission_ids)}}).to_list(None)

    # Build lookup tables
    module_map = {m["_id"]: m.get("name", "") for m in modules}
    job_map = {j["_id"]: j.get("name", "") for j in jobs}
    perm_map = {p["_id"]: p.get("name", "") for p in permissions}

    # Enrich and convert
    result = []
    for mapping in mappings:
        mapping["moduleName"] = module_map.get(mapping["moduleId"], "")
        mapping["jobName"] = job_map.get(mapping["jobId"], "")
        mapping["permissionName"] = perm_map.get(mapping["permissionId"], "")
        result.append(_convert_objectid_to_str(mapping))

    return result, total


async def count_permissions_mappings(
    moduleId: Optional[str] = None,
    jobId: Optional[str] = None,
    permissionId: Optional[str] = None,
    include_deleted: bool = False
) -> int:
    """
    Count permissions mappings matching the filter criteria (excludes soft-deleted by default)

    Args:
        moduleId: Filter by module ID
        jobId: Filter by job ID
        permissionId: Filter by permission ID
        include_deleted: Include soft-deleted records

    Returns:
        Count of matching permissions mappings

    Raises:
        ValueError: If any provided ID is not a valid ObjectId format
    """
    db = get_database()

    # Build query
    query = {}
    if not include_deleted:
        query["isDelete"] = False

    if moduleId:
        if not ObjectId.is_valid(moduleId):
            raise ValueError(f"Invalid moduleId format: '{moduleId}'")
        query["moduleId"] = ObjectId(moduleId)
    if jobId:
        if not ObjectId.is_valid(jobId):
            raise ValueError(f"Invalid jobId format: '{jobId}'")
        query["jobId"] = ObjectId(jobId)
    if permissionId:
        if not ObjectId.is_valid(permissionId):
            raise ValueError(f"Invalid permissionId format: '{permissionId}'")
        query["permissionId"] = ObjectId(permissionId)

    return await db[Collections.PERMISSION_MAPPINGS].count_documents(query)
