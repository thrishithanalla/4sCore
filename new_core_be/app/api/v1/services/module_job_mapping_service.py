"""
Module Job Mapping Service
Business logic for module job mapping operations
"""
from typing import List, Optional, Tuple
from bson import ObjectId
from fastapi import HTTPException, status, Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.module_job_mapping_schema import ModuleJobMappingCreateSchema
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
    for field in ["moduleId", "jobId", "createdBy", "updatedBy"]:
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


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_module_job_mapping(
    data: ModuleJobMappingCreateSchema,
    created_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new module job mapping

    Args:
        data: Module job mapping creation data
        created_by: User ID creating the mapping
        client_ip: IP address of the client making the request

    Returns:
        Created module job mapping document

    Raises:
        ValueError: If moduleId or jobId don't exist, or mapping already exists
    """
    db = get_database()

    # Validate that module and job exist
    module = await _validate_module(db, data.moduleId)
    job = await _validate_job(db, data.jobId)

    # Check if mapping already exists (moduleId + jobId must be unique, check against all records including deleted)
    existing_mapping = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
        "moduleId": ObjectId(data.moduleId),
        "jobId": ObjectId(data.jobId)
    })
    if existing_mapping:
        await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_DUPLICATE,
            parameters={"moduleId": data.moduleId, "jobId": data.jobId},
            actor_user_id=created_by
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Module job mapping for moduleId '{data.moduleId}' and jobId '{data.jobId}' already exists"
        )

    # Prepare document
    mapping_dict = {
        "moduleId": ObjectId(data.moduleId),
        "jobId": ObjectId(data.jobId),
        "isActive": True,
        "isDelete": False,
        "createdBy": ObjectId(created_by) if ObjectId.is_valid(created_by) else created_by,
        "createdAt": get_ist_now(),
        "createdIp": client_ip
    }

    # Insert into database
    result = await db[Collections.MODULE_JOB_MAPPINGS].insert_one(mapping_dict)

    # Fetch and return the created document
    created_mapping = await db[Collections.MODULE_JOB_MAPPINGS].find_one({"_id": result.inserted_id})

    # Add names for response
    created_mapping["moduleName"] = module.get("name", "")
    created_mapping["jobName"] = job.get("name", "")

    return _convert_objectid_to_str(created_mapping)


async def bulk_create_module_job_mappings(
    data_list: List[ModuleJobMappingCreateSchema],
    created_by: str,
    client_ip: Optional[str] = None
) -> dict:
    """
    Create multiple module job mappings at once

    Args:
        data_list: List of module job mapping creation data
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
            # Validate that module and job exist
            module = await _validate_module(db, data.moduleId)
            job = await _validate_job(db, data.jobId)

            # Check if mapping already exists (check against all records including deleted)
            existing_mapping = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
                "moduleId": ObjectId(data.moduleId),
                "jobId": ObjectId(data.jobId)
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
                "isActive": True,
                "isDelete": False,
                "createdBy": ObjectId(created_by) if ObjectId.is_valid(created_by) else created_by,
                "createdAt": get_ist_now(),
                "createdIp": client_ip
            }

            # Insert into database
            result = await db[Collections.MODULE_JOB_MAPPINGS].insert_one(mapping_dict)

            successful.append({
                "index": idx,
                "id": str(result.inserted_id),
                "moduleId": data.moduleId,
                "jobId": data.jobId
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


async def update_module_job_mapping(
    mapping_id: str,
    update_data: dict,
    updated_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Update an existing module job mapping (partial update)

    Args:
        mapping_id: Module job mapping ID
        update_data: Fields to update
        updated_by: User ID performing the update
        client_ip: IP address of the client making the request

    Returns:
        Updated module job mapping document

    Raises:
        HTTPException: If mapping_id is invalid, mapping not found, already deleted, or new values invalid
    """
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    # Check if mapping exists and is not deleted
    existing = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module job mapping not found or already deleted"
        )

    # Filter out None values
    filtered_update = {k: v for k, v in update_data.items() if v is not None and k != "updatedIp"}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
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

    # Check uniqueness if any of the key fields are being updated (check against all records including deleted)
    if "moduleId" in filtered_update or "jobId" in filtered_update:
        check_module_id = filtered_update.get("moduleId", existing["moduleId"])
        check_job_id = filtered_update.get("jobId", existing["jobId"])

        mapping_exists = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
            "moduleId": check_module_id,
            "jobId": check_job_id,
            "_id": {"$ne": ObjectId(mapping_id)}
        })
        if mapping_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_DUPLICATE,
                parameters={"mapping_id": mapping_id, "moduleId": str(check_module_id), "jobId": str(check_job_id)},
                actor_user_id=updated_by
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Module job mapping with this combination already exists"
            )

    # Update metadata
    filtered_update["updatedBy"] = ObjectId(updated_by) if ObjectId.is_valid(updated_by) else updated_by
    filtered_update["updatedAt"] = get_ist_now()
    filtered_update["updatedIp"] = client_ip or update_data.get("updatedIp")

    # Update in database
    await db[Collections.MODULE_JOB_MAPPINGS].update_one(
        {"_id": ObjectId(mapping_id)},
        {"$set": filtered_update}
    )

    # Fetch and return updated document
    updated_mapping = await db[Collections.MODULE_JOB_MAPPINGS].find_one({"_id": ObjectId(mapping_id)})

    # Add names for response
    module = await db[Collections.MODULES].find_one({"_id": updated_mapping["moduleId"]})
    job = await db[Collections.JOBS].find_one({"_id": updated_mapping["jobId"]})

    updated_mapping["moduleName"] = module.get("name", "") if module else ""
    updated_mapping["jobName"] = job.get("name", "") if job else ""

    return _convert_objectid_to_str(updated_mapping)


async def delete_module_job_mapping(
    mapping_id: str,
    deleted_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a module job mapping

    Args:
        mapping_id: Module job mapping ID
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
            error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=deleted_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    # Check if mapping exists and is not deleted
    existing = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=deleted_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module job mapping not found or already deleted"
        )

    # Soft delete
    result = await db[Collections.MODULE_JOB_MAPPINGS].update_one(
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


async def restore_module_job_mapping(
    mapping_id: str,
    restored_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Restore a soft-deleted module job mapping

    Args:
        mapping_id: Module job mapping ID
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
            error_code=ErrorCodes.MOD_JOB_MAPPING_RESTORE_FAILED,
            parameters={"mapping_id": mapping_id, "reason": "Invalid ObjectId format"},
            actor_user_id=restored_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    # Check if mapping exists and is deleted
    existing = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": True
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_RESTORE_NOT_FOUND,
            parameters={"mapping_id": mapping_id},
            actor_user_id=restored_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Module job mapping not found or not deleted"
        )

    # Restore (set isDelete to False only - isActive should be managed separately)
    result = await db[Collections.MODULE_JOB_MAPPINGS].update_one(
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


async def get_module_job_mapping(mapping_id: str) -> Optional[dict]:
    """
    Get a single module job mapping by ID (excludes soft-deleted)

    Args:
        mapping_id: Module job mapping ID

    Returns:
        Module job mapping document or None if not found

    Raises:
        HTTPException: If mapping_id is not a valid ObjectId format
    """
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid mapping ID format"
        )

    db = get_database()

    mapping = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })

    if not mapping:
        return None

    # Add names for response
    module = await db[Collections.MODULES].find_one({"_id": mapping["moduleId"]})
    job = await db[Collections.JOBS].find_one({"_id": mapping["jobId"]})

    mapping["moduleName"] = module.get("name", "") if module else ""
    mapping["jobName"] = job.get("name", "") if job else ""

    return _convert_objectid_to_str(mapping)


async def list_module_job_mappings(
    include_deleted: bool = False,
    moduleId: Optional[str] = None,
    jobId: Optional[str] = None,
    page: Optional[int] = None,
    page_size: int = 10
) -> Tuple[List[dict], int]:
    """
    List module job mappings with optional filters and pagination

    Args:
        include_deleted: Include soft-deleted records
        moduleId: Filter by module ID
        jobId: Filter by job ID
        page: Page number (1-indexed). If None, returns all records.
        page_size: Number of records per page

    Returns:
        Tuple of (list of module job mapping documents, total count)

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

    # Get total count
    total = await db[Collections.MODULE_JOB_MAPPINGS].count_documents(query)

    # Execute query with or without pagination
    cursor = db[Collections.MODULE_JOB_MAPPINGS].find(query).sort("createdAt", -1)

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

    # Bulk fetch related data
    modules = await db[Collections.MODULES].find({"_id": {"$in": list(module_ids)}}).to_list(None)
    jobs = await db[Collections.JOBS].find({"_id": {"$in": list(job_ids)}}).to_list(None)

    # Build lookup tables
    module_map = {m["_id"]: m.get("name", "") for m in modules}
    job_map = {j["_id"]: j.get("name", "") for j in jobs}

    # Enrich and convert
    result = []
    for mapping in mappings:
        mapping["moduleName"] = module_map.get(mapping["moduleId"], "")
        mapping["jobName"] = job_map.get(mapping["jobId"], "")
        result.append(_convert_objectid_to_str(mapping))

    return result, total


async def list_jobs_by_module(
    module_id: str,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: int = 10
) -> Tuple[List[dict], int]:
    """
    Get all jobs mapped to a specific module

    Args:
        module_id: Module ID to get jobs for
        include_deleted: Include soft-deleted records
        page: Page number (1-indexed). If None, returns all records.
        page_size: Number of records per page

    Returns:
        Tuple of (list of job documents with mapping info, total count)

    Raises:
        ValueError: If moduleId is not a valid ObjectId format
    """
    if not ObjectId.is_valid(module_id):
        raise ValueError(f"Invalid moduleId format: '{module_id}'")

    db = get_database()

    # Build query
    query = {"moduleId": ObjectId(module_id)}
    if not include_deleted:
        query["isDelete"] = False

    # Get total count
    total = await db[Collections.MODULE_JOB_MAPPINGS].count_documents(query)

    # Execute query with or without pagination
    cursor = db[Collections.MODULE_JOB_MAPPINGS].find(query).sort("createdAt", -1)

    if page is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)
        mappings = await cursor.to_list(length=page_size)
    else:
        mappings = await cursor.to_list(length=None)

    if not mappings:
        return [], total

    # Collect unique job IDs for bulk fetch
    job_ids = {m["jobId"] for m in mappings}

    # Bulk fetch jobs and module info
    jobs = await db[Collections.JOBS].find({"_id": {"$in": list(job_ids)}}).to_list(None)
    module = await db[Collections.MODULES].find_one({"_id": ObjectId(module_id)})

    # Build lookup table
    job_map = {j["_id"]: j for j in jobs}
    module_name = module.get("name", "") if module else ""

    # Enrich and convert
    result = []
    for mapping in mappings:
        job = job_map.get(mapping["jobId"], {})
        mapping["moduleName"] = module_name
        mapping["jobName"] = job.get("name", "")
        result.append(_convert_objectid_to_str(mapping))

    return result, total


async def list_modules_by_job(
    job_id: str,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: int = 10
) -> Tuple[List[dict], int]:
    """
    Get all modules mapped to a specific job (reverse lookup)

    Args:
        job_id: Job ID to get modules for
        include_deleted: Include soft-deleted records
        page: Page number (1-indexed). If None, returns all records.
        page_size: Number of records per page

    Returns:
        Tuple of (list of module documents with mapping info, total count)

    Raises:
        ValueError: If jobId is not a valid ObjectId format
    """
    if not ObjectId.is_valid(job_id):
        raise ValueError(f"Invalid jobId format: '{job_id}'")

    db = get_database()

    # Build query
    query = {"jobId": ObjectId(job_id)}
    if not include_deleted:
        query["isDelete"] = False

    # Get total count
    total = await db[Collections.MODULE_JOB_MAPPINGS].count_documents(query)

    # Execute query with or without pagination
    cursor = db[Collections.MODULE_JOB_MAPPINGS].find(query).sort("createdAt", -1)

    if page is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)
        mappings = await cursor.to_list(length=page_size)
    else:
        mappings = await cursor.to_list(length=None)

    if not mappings:
        return [], total

    # Collect unique module IDs for bulk fetch
    module_ids = {m["moduleId"] for m in mappings}

    # Bulk fetch modules and job info
    modules = await db[Collections.MODULES].find({"_id": {"$in": list(module_ids)}}).to_list(None)
    job = await db[Collections.JOBS].find_one({"_id": ObjectId(job_id)})

    # Build lookup table
    module_map = {m["_id"]: m for m in modules}
    job_name = job.get("name", "") if job else ""

    # Enrich and convert
    result = []
    for mapping in mappings:
        module = module_map.get(mapping["moduleId"], {})
        mapping["moduleName"] = module.get("name", "")
        mapping["jobName"] = job_name
        result.append(_convert_objectid_to_str(mapping))

    return result, total


async def count_module_job_mappings(
    moduleId: Optional[str] = None,
    jobId: Optional[str] = None,
    include_deleted: bool = False
) -> int:
    """
    Count module job mappings matching the filter criteria (excludes soft-deleted by default)

    Args:
        moduleId: Filter by module ID
        jobId: Filter by job ID
        include_deleted: Include soft-deleted records

    Returns:
        Count of matching module job mappings

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

    return await db[Collections.MODULE_JOB_MAPPINGS].count_documents(query)
