"""
Jobs Service Module
Provides business logic for Jobs management
"""
from typing import List, Optional
from bson import ObjectId

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.constants.collections import Collections
from app.api.v1.schemas.jobs_schema import (
    JobsCreateSchema,
    JobsUpdateSchema
)

# Collection name from centralized constants
COLLECTION_NAME = Collections.JOBS


async def _cascade_job_name_change(db, old_job_name: str, new_job_name: str):
    """
    Cascade jobName changes to all collections that reference it

    When a job's name is changed, we need to update:
    1. roles_master.permissions[].jobs[].jobName
    2. user_role_permissions_master.additionalPermissions[].jobs[].jobName
    3. user_role_permissions_master.exclusionPermissions[].jobs[].jobName

    Args:
        db: Database instance
        old_job_name: The old job name to replace
        new_job_name: The new job name
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"Cascading job name change from '{old_job_name}' to '{new_job_name}'")

    # Update roles_master collection
    roles_result = await db[Collections.ROLES].update_many(
        {"permissions.jobs.jobName": old_job_name},
        {"$set": {"permissions.$[].jobs.$[job].jobName": new_job_name}},
        array_filters=[{"job.jobName": old_job_name}]
    )
    logger.info(f"Updated {roles_result.modified_count} roles")

    # Update user_role_permissions_master - additionalPermissions
    user_perms_add_result = await db[Collections.USER_ROLE_PERMISSIONS].update_many(
        {"additionalPermissions.jobs.jobName": old_job_name},
        {"$set": {"additionalPermissions.$[].jobs.$[job].jobName": new_job_name}},
        array_filters=[{"job.jobName": old_job_name}]
    )
    logger.info(f"Updated {user_perms_add_result.modified_count} user additional permissions")

    # Update user_role_permissions_master - exclusionPermissions
    user_perms_ex_result = await db[Collections.USER_ROLE_PERMISSIONS].update_many(
        {"exclusionPermissions.jobs.jobName": old_job_name},
        {"$set": {"exclusionPermissions.$[].jobs.$[job].jobName": new_job_name}},
        array_filters=[{"job.jobName": old_job_name}]
    )
    logger.info(f"Updated {user_perms_ex_result.modified_count} user exclusion permissions")


async def _cascade_menu_eligible_to_false(db, job_name: str):
    """
    Cascade menuEligible=false to all collections that reference this job.

    When a job's menuEligible is set to false, we need to force isMenu=false in:
    1. roles_master.permissions[].jobs[].isMenu (where jobName matches)
    2. user_role_permissions_master.additionalPermissions[].jobs[].isMenu (where jobName matches)
    3. user_role_permissions_master.exclusionPermissions[].jobs[].isMenu (where jobName matches)

    Args:
        db: Database instance
        job_name: The job name whose menuEligible was set to false
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"Cascading menuEligible=false for job '{job_name}' - forcing isMenu=false in all roles and user-mappings")

    # Update roles_master collection - set isMenu=false for this job
    roles_result = await db[Collections.ROLES].update_many(
        {"permissions.jobs.jobName": job_name},
        {"$set": {"permissions.$[].jobs.$[job].isMenu": False}},
        array_filters=[{"job.jobName": job_name}]
    )
    logger.info(f"Updated isMenu=false in {roles_result.modified_count} roles")

    # Update user_role_permissions_master - additionalPermissions
    user_perms_add_result = await db[Collections.USER_ROLE_PERMISSIONS].update_many(
        {"additionalPermissions.jobs.jobName": job_name},
        {"$set": {"additionalPermissions.$[].jobs.$[job].isMenu": False}},
        array_filters=[{"job.jobName": job_name}]
    )
    logger.info(f"Updated isMenu=false in {user_perms_add_result.modified_count} user additional permissions")

    # Update user_role_permissions_master - exclusionPermissions
    user_perms_ex_result = await db[Collections.USER_ROLE_PERMISSIONS].update_many(
        {"exclusionPermissions.jobs.jobName": job_name},
        {"$set": {"exclusionPermissions.$[].jobs.$[job].isMenu": False}},
        array_filters=[{"job.jobName": job_name}]
    )
    logger.info(f"Updated isMenu=false in {user_perms_ex_result.modified_count} user exclusion permissions")


async def _check_job_usage(db, job_name: str) -> dict:
    """
    Check if a job is being used in roles or user_role_permissions

    Args:
        db: Database instance
        job_name: The job name to check

    Returns:
        Dict with usage information: {
            "isUsed": bool,
            "rolesCount": int,
            "userPermissionsCount": int
        }
    """
    # Check roles_master
    roles_count = await db[Collections.ROLES].count_documents({
        "permissions.jobs.jobName": job_name,
        "isDelete": False
    })

    # Check user_role_permissions_master
    user_perms_count = await db[Collections.USER_ROLE_PERMISSIONS].count_documents({
        "$or": [
            {"additionalPermissions.jobs.jobName": job_name},
            {"exclusionPermissions.jobs.jobName": job_name}
        ],
        "isDelete": False
    })

    return {
        "isUsed": (roles_count > 0 or user_perms_count > 0),
        "rolesCount": roles_count,
        "userPermissionsCount": user_perms_count
    }


def _generate_display_name(job_name: str) -> str:
    """
    Generate displayName from job name
    Converts to PascalCase without spaces

    Example: "USER MANAGEMENT" -> "UserManagement"

    Args:
        job_name: Job name (e.g., "USER MANAGEMENT")

    Returns:
        PascalCase display name without spaces
    """
    # Split by spaces, capitalize first letter of each word, join without spaces
    words = job_name.strip().split()
    pascal_case = ''.join(word.capitalize() for word in words)
    return pascal_case


def _generate_route(job_name: str) -> str:
    """
    Generate route from job name
    Converts to lowercase with hyphens instead of spaces, adds 's' for plural

    Example: "USER MANAGEMENT" -> "user-managements"

    Args:
        job_name: Job name (e.g., "USER MANAGEMENT")

    Returns:
        Lowercase route with hyphens and plural
    """
    # Convert to lowercase, replace spaces with hyphens, add 's' at the end
    route = job_name.strip().lower().replace(' ', '-')
    route = route + 's'  # Make it plural
    return route


def _convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    from datetime import datetime

    if not document:
        return document

    if "_id" in document:
        document["_id"] = str(document["_id"])

    for field in ["createdBy", "updatedBy"]:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    for field in ["createdAt", "updatedAt"]:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_job(data: JobsCreateSchema, created_by: str, created_ip: Optional[str] = None) -> dict:
    """
    Create a new job

    Args:
        data: Job creation schema
        created_by: User ID who is creating this record (from token _id)
        created_ip: IP address of the creator (optional)

    Returns:
        Created job document

    Raises:
        ValueError: If name or shortCode already exists
    """
    db = get_database()

    # Check if name already exists (case-insensitive, check against all records including deleted)
    existing_name = await db[COLLECTION_NAME].find_one({
        "name": {"$regex": f"^{data.name}$", "$options": "i"}
    })
    if existing_name:
        raise ValueError(f"Job with name '{data.name}' already exists")

    # Check if shortCode already exists (case-insensitive, check against all records including deleted)
    existing_code = await db[COLLECTION_NAME].find_one({
        "shortCode": {"$regex": f"^{data.shortCode}$", "$options": "i"}
    })
    if existing_code:
        raise ValueError(f"Job with short code '{data.shortCode}' already exists")

    # Prepare document
    job_dict = data.model_dump()
    job_dict["isActive"] = True
    job_dict["isDelete"] = False
    job_dict["createdBy"] = ObjectId(created_by)
    job_dict["createdAt"] = get_ist_now()
    job_dict["createdIp"] = created_ip
    job_dict["updatedBy"] = None
    job_dict["updatedAt"] = None
    job_dict["updatedIp"] = None

    # Ensure menuEligible has default value if not provided
    if "menuEligible" not in job_dict or job_dict["menuEligible"] is None:
        job_dict["menuEligible"] = True

    # Auto-generate displayName and route from name - COMMENTED OUT
    # job_dict["displayName"] = _generate_display_name(data.name)
    # job_dict["route"] = _generate_route(data.name)

    # Set displayOrder: use provided value, or auto-set based on menuEligible (true→1, false→0)
    if job_dict.get("displayOrder") is None:
        job_dict["displayOrder"] = 1 if job_dict["menuEligible"] else 0

    # Insert
    result = await db[COLLECTION_NAME].insert_one(job_dict)
    created_job = await db[COLLECTION_NAME].find_one({"_id": result.inserted_id})

    return _convert_objectid_to_str(created_job)


async def update_job(job_id: str, patch: JobsUpdateSchema, updated_by: str, updated_ip: Optional[str] = None) -> dict:
    """
    Update an existing job (partial update)

    Args:
        job_id: Job ID
        patch: Update schema with fields to change
        updated_by: User ID who is updating this record (from token _id)
        updated_ip: IP address of the updater (optional)

    Returns:
        Updated job document

    Raises:
        ValueError: If job not found, already deleted, or conflicts exist
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(job_id)
    except:
        raise ValueError(f"Invalid job ID format: '{job_id}'")

    # Check if job exists and is not soft-deleted
    existing = await db[COLLECTION_NAME].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        raise ValueError(f"Job with ID '{job_id}' not found or already deleted")

    # Prepare update data
    update_data = patch.model_dump(exclude_unset=True)

    if not update_data and not updated_ip:
        raise ValueError("No fields to update")

    # If name is being updated, check uniqueness (case-insensitive, check against all records including deleted)
    if "name" in update_data:
        name_exists = await db[COLLECTION_NAME].find_one({
            "name": {"$regex": f"^{update_data['name']}$", "$options": "i"},
            "_id": {"$ne": object_id}
        })
        if name_exists:
            raise ValueError(f"Job with name '{update_data['name']}' already exists")

    # If shortCode is being updated, check uniqueness (case-insensitive, check against all records including deleted)
    if "shortCode" in update_data:
        code_exists = await db[COLLECTION_NAME].find_one({
            "shortCode": {"$regex": f"^{update_data['shortCode']}$", "$options": "i"},
            "_id": {"$ne": object_id}
        })
        if code_exists:
            raise ValueError(f"Job with short code '{update_data['shortCode']}' already exists")

    # Update metadata
    update_data["updatedBy"] = ObjectId(updated_by)
    update_data["updatedAt"] = get_ist_now()
    if updated_ip:
        update_data["updatedIp"] = updated_ip

    # If jobName is being changed, we need to cascade the change and regenerate displayName/route
    old_job_name = existing.get("name")
    new_job_name = update_data.get("name")

    if new_job_name and old_job_name != new_job_name:
        # Auto-regenerate displayName and route from new name - COMMENTED OUT
        # update_data["displayName"] = _generate_display_name(new_job_name)
        # update_data["route"] = _generate_route(new_job_name)

        # Cascade the jobName change to all collections that reference it
        await _cascade_job_name_change(db, old_job_name, new_job_name)

    # Handle displayOrder logic:
    # - If displayOrder is provided in update_data, use that value
    # - If displayOrder is NOT provided but menuEligible changes, auto-set displayOrder:
    #   - menuEligible changes to false → set displayOrder to 0
    #   - menuEligible changes to true → set displayOrder to 1
    # - Otherwise, keep the existing displayOrder value
    if "displayOrder" not in update_data:
        new_menu_eligible = update_data.get("menuEligible")
        if new_menu_eligible is False:
            # menuEligible changed to false and displayOrder not provided → set to 0
            update_data["displayOrder"] = 0
        elif new_menu_eligible is True:
            # menuEligible changed to true and displayOrder not provided → set to 1
            update_data["displayOrder"] = 1

    # Cascade menuEligible change: if menuEligible is set to false, force isMenu=false in all roles and user-mappings
    new_menu_eligible = update_data.get("menuEligible")
    if new_menu_eligible is False:
        await _cascade_menu_eligible_to_false(db, existing.get("name"))

    # Update in database
    await db[COLLECTION_NAME].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )
    updated_job = await db[COLLECTION_NAME].find_one({"_id": object_id})

    return _convert_objectid_to_str(updated_job)


async def delete_job(job_id: str, deleted_by: str, deleted_ip: Optional[str] = None) -> bool:
    """
    Soft delete a job

    Args:
        job_id: Job ID
        deleted_by: User ID who is deleting this record (from token _id)
        deleted_ip: IP address of the request (optional)

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If job not found or already deleted
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(job_id)
    except:
        raise ValueError(f"Invalid job ID format: '{job_id}'")

    # Check if exists and not already deleted
    existing = await db[COLLECTION_NAME].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        raise ValueError(f"Job with ID '{job_id}' not found or already deleted")

    # Check if job is being used in roles or user_role_permissions
    job_name = existing.get("name")
    usage = await _check_job_usage(db, job_name)

    if usage["isUsed"]:
        raise ValueError(
            f"Cannot delete job '{job_name}'. It is being used in "
            f"{usage['rolesCount']} role(s) and {usage['userPermissionsCount']} user permission mapping(s). "
            f"Please remove it from all roles and user permissions before deleting."
        )

    # Check if job is being used in module_job_mapping (among non-deleted mappings)
    module_job_mapping_using_job = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
        "jobId": object_id,
        "isDelete": False
    })
    if module_job_mapping_using_job:
        raise ValueError(
            f"Cannot delete job '{job_name}'. It is being used in module-job mappings. "
            f"Please remove the mappings first."
        )

    # Check if job is being used in permissions_mapping (among non-deleted mappings)
    perm_mapping_using_job = await db[Collections.PERMISSION_MAPPINGS].find_one({
        "jobId": object_id,
        "isDelete": False
    })
    if perm_mapping_using_job:
        raise ValueError(
            f"Cannot delete job '{job_name}'. It is being used in permission mappings. "
            f"Please remove the mappings first."
        )

    # Prepare update data
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(deleted_by),
        "updatedAt": get_ist_now()
    }

    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    # Soft delete by setting isDelete and updatedBy/updatedAt
    result = await db[COLLECTION_NAME].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return result.modified_count > 0


async def restore_job(job_id: str, restored_by: str) -> dict:
    """
    Restore a soft-deleted job

    Args:
        job_id: Job ID
        restored_by: User ID who is restoring this record

    Returns:
        Restored job document

    Raises:
        ValueError: If job not found or not deleted
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(job_id)
    except:
        raise ValueError(f"Invalid job ID format: '{job_id}'")

    # Check if exists and is deleted
    existing = await db[COLLECTION_NAME].find_one({"_id": object_id})
    if not existing:
        raise ValueError(f"Job with ID '{job_id}' not found")

    if not existing.get("isDelete", False):
        raise ValueError(f"Job with ID '{job_id}' is not deleted")

    # Restore by setting isDelete=False
    await db[COLLECTION_NAME].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": False,
                "updatedBy": ObjectId(restored_by),
                "updatedAt": get_ist_now()
            }
        }
    )

    restored_job = await db[COLLECTION_NAME].find_one({"_id": object_id})
    return _convert_objectid_to_str(restored_job)


async def toggle_active_job(job_id: str, is_active: bool, updated_by: str, updated_ip: str = None) -> dict:
    """
    Toggle isActive status of a job

    Args:
        job_id: Job ID
        is_active: New active status
        updated_by: User ID who is updating this record
        updated_ip: IP address of the updater (optional)

    Returns:
        Updated job document

    Raises:
        ValueError: If job not found or deleted
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(job_id)
    except:
        raise ValueError(f"Invalid job ID format: '{job_id}'")

    # Check if exists and is not deleted
    existing = await db[COLLECTION_NAME].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        raise ValueError(f"Job with ID '{job_id}' not found or deleted")

    # Prepare update data
    update_data = {
        "isActive": is_active,
        "updatedBy": ObjectId(updated_by),
        "updatedAt": get_ist_now()
    }

    if updated_ip:
        update_data["updatedIp"] = updated_ip

    await db[COLLECTION_NAME].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    updated_job = await db[COLLECTION_NAME].find_one({"_id": object_id})
    return _convert_objectid_to_str(updated_job)


async def get_job(job_id: str, include_deleted: bool = False) -> Optional[dict]:
    """
    Get a single job by ID

    Args:
        job_id: Job ID
        include_deleted: If True, includes soft-deleted records

    Returns:
        Job document or None if not found
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(job_id)
    except:
        raise ValueError(f"Invalid job ID format: '{job_id}'")

    query = {"_id": object_id}
    if not include_deleted:
        query["isDelete"] = False

    job = await db[COLLECTION_NAME].find_one(query)

    if not job:
        return None

    return _convert_objectid_to_str(job)


async def list_jobs(
    search: Optional[str] = None,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> dict:
    """
    List jobs with optional pagination and filters

    Args:
        search: Search in name, shortCode, or description
        include_deleted: If True, includes soft-deleted records
        page: Page number (optional)
        page_size: Items per page (optional)

    Returns:
        Dict with data, total, page, page_size, total_pages
    """
    db = get_database()

    # Build query
    query = {}
    if not include_deleted:
        query["isDelete"] = False

    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"shortCode": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]

    # Get total count
    total = await db[COLLECTION_NAME].count_documents(query)

    # Check if pagination is requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

        cursor = db[COLLECTION_NAME].find(query).skip(skip).limit(page_size).sort("createdAt", -1)
        jobs = await cursor.to_list(length=page_size)

        return {
            "data": [_convert_objectid_to_str(j) for j in jobs],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
    else:
        cursor = db[COLLECTION_NAME].find(query).sort("createdAt", -1)
        jobs = await cursor.to_list(length=None)

        return {
            "data": [_convert_objectid_to_str(j) for j in jobs],
            "total": total,
            "page": 1,
            "page_size": total,
            "total_pages": 1
        }


# Keep old function for backward compatibility
async def search_jobs(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[dict]:
    """
    Search jobs with optional filters (excludes soft-deleted)
    DEPRECATED: Use list_jobs instead
    """
    result = await list_jobs(search=search, include_deleted=False)
    return result["data"]


async def count_jobs(search: Optional[str] = None) -> int:
    """
    Count jobs matching the search criteria (excludes soft-deleted)
    """
    result = await list_jobs(search=search, include_deleted=False)
    return result["total"]


async def bulk_create_jobs(data_list: List[JobsCreateSchema], created_by: str) -> dict:
    """
    Create multiple jobs at once

    Args:
        data_list: List of job creation data
        created_by: User ID creating the jobs

    Returns:
        Dictionary with success count, failed count, and details of failures
    """
    db = get_database()

    successful = []
    failed = []

    for idx, data in enumerate(data_list):
        try:
            # Check if name already exists (check against all records including deleted)
            existing_name = await db[COLLECTION_NAME].find_one({
                "name": {"$regex": f"^{data.name}$", "$options": "i"}
            })
            if existing_name:
                failed.append({
                    "index": idx,
                    "data": data.model_dump(),
                    "errors": f"Job with name '{data.name}' already exists"
                })
                continue

            # Check if shortCode already exists (check against all records including deleted)
            existing_code = await db[COLLECTION_NAME].find_one({
                "shortCode": {"$regex": f"^{data.shortCode}$", "$options": "i"}
            })
            if existing_code:
                failed.append({
                    "index": idx,
                    "data": data.model_dump(),
                    "errors": f"Job with short code '{data.shortCode}' already exists"
                })
                continue

            # Prepare document
            job_dict = data.model_dump()
            job_dict["isActive"] = True
            job_dict["isDelete"] = False
            job_dict["createdBy"] = ObjectId(created_by)
            job_dict["createdAt"] = get_ist_now()
            job_dict["createdIp"] = None
            job_dict["updatedBy"] = None
            job_dict["updatedAt"] = None
            job_dict["updatedIp"] = None

            # Ensure menuEligible has default value if not provided
            if "menuEligible" not in job_dict or job_dict["menuEligible"] is None:
                job_dict["menuEligible"] = True

            # Auto-generate displayName and route from name - COMMENTED OUT
            # job_dict["displayName"] = _generate_display_name(data.name)
            # job_dict["route"] = _generate_route(data.name)

            # Set displayOrder: use provided value, or auto-set based on menuEligible (true→1, false→0)
            if job_dict.get("displayOrder") is None:
                job_dict["displayOrder"] = 1 if job_dict["menuEligible"] else 0

            # Insert into database
            result = await db[COLLECTION_NAME].insert_one(job_dict)

            # Add to successful list
            successful.append({
                "index": idx,
                "id": str(result.inserted_id),
                "name": data.name,
                "shortCode": data.shortCode
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
