"""
Role Service Module
Provides business logic for Role management with permissions array validation
"""
import asyncio
from typing import List, Optional, Tuple
from bson import ObjectId
from fastapi import HTTPException, status, Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.role_schema import (
    RoleCreateSchema,
    RoleUpdateSchema
)
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error
from app.utils.error_messages import get_business_error


def convert_objectid_to_str(document: dict) -> dict:
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


async def enrich_permissions_with_is_menu(db, permissions: list, job_data_map: dict = None) -> list:
    """
    Enrich permissions with job display data.

    - isMenu, displayOrder: From role's permission structure
    - displayName, route: From jobs_master collection

    Args:
        db: Database instance
        permissions: List of permission modules with structure:
            [{moduleId, moduleName, jobs: [{jobName, isMenu, displayOrder, permissions}]}]
        job_data_map: Optional pre-fetched map of jobName -> {displayName, route} for batch optimization

    Returns:
        Enriched permissions with displayName and route from jobs_master:
            [{moduleId, moduleName, jobs: [{jobName, isMenu, displayOrder, displayName, route, permissions}]}]
    """
    if not permissions:
        return permissions

    # If job_data_map is not provided, fetch it from jobs_master
    if job_data_map is None:
        # Collect all unique job names
        job_names = set()
        for module in permissions:
            for job in module.get("jobs", []):
                job_name = job.get("jobName")
                if job_name:
                    job_names.add(job_name)

        # Fetch displayName and route from jobs_master
        if job_names:
            jobs_data = await db[Collections.JOBS].find(
                {"name": {"$in": list(job_names)}, "isDelete": False},
                {"name": 1, "displayName": 1, "route": 1}
            ).to_list(length=None)

            # Create lookup map: jobName -> {displayName, route}
            job_data_map = {
                job["name"]: {
                    "displayName": job.get("displayName", ""),
                    "route": job.get("route", "")
                }
                for job in jobs_data
            }
        else:
            job_data_map = {}

    # Enrich permissions
    enriched_permissions = []
    for module in permissions:
        enriched_module = {**module}
        enriched_jobs = []

        for job in module.get("jobs", []):
            job_name = job.get("jobName")

            # Get displayName and route from jobs_master
            job_data = job_data_map.get(job_name, {})

            # Build enriched job with consistent field order
            # isMenu and displayOrder from role (with defaults for backward compatibility)
            # displayName and route from jobs_master
            enriched_job = {
                "jobName": job_name,
                "isMenu": job.get("isMenu", True),
                "displayOrder": job.get("displayOrder", 1),
                "permissions": job.get("permissions", []),
                "displayName": job_data.get("displayName", ""),
                "route": job_data.get("route", "")
            }

            enriched_jobs.append(enriched_job)

        enriched_module["jobs"] = enriched_jobs
        enriched_permissions.append(enriched_module)

    return enriched_permissions


async def _validate_is_menu_against_menu_eligible(db, permissions_data):
    """
    Validate that isMenu=true is only set for jobs where menuEligible=true in jobs_master.

    When a job has menuEligible=false, it cannot have isMenu=true in any role.

    Args:
        db: Database instance
        permissions_data: List of ModuleItem objects or dicts with nested structure

    Raises:
        ValueError: If isMenu=true is set for a job with menuEligible=false
    """
    if not permissions_data:
        return

    # Collect all jobs that have isMenu=true
    jobs_with_is_menu_true = set()

    for module_item in permissions_data:
        if isinstance(module_item, dict):
            jobs = module_item.get("jobs", [])
        else:
            jobs = module_item.jobs

        for job_item in jobs:
            if isinstance(job_item, dict):
                job_name = job_item.get("jobName")
                is_menu = job_item.get("isMenu", True)  # default is True
            else:
                job_name = job_item.jobName
                is_menu = getattr(job_item, "isMenu", True)

            if job_name and is_menu is True:
                jobs_with_is_menu_true.add(job_name)

    if not jobs_with_is_menu_true:
        return

    # Fetch menuEligible for these jobs from jobs_master
    jobs_data = await db[Collections.JOBS].find(
        {"name": {"$in": list(jobs_with_is_menu_true)}, "isDelete": False},
        {"name": 1, "menuEligible": 1}
    ).to_list(length=None)

    # Build map: jobName -> menuEligible
    job_menu_eligible_map = {
        job["name"]: job.get("menuEligible", True)  # default True for backward compatibility
        for job in jobs_data
    }

    # Check for violations
    for job_name in jobs_with_is_menu_true:
        menu_eligible = job_menu_eligible_map.get(job_name, True)
        if menu_eligible is False:
            raise ValueError(
                f"Cannot set isMenu=true for job '{job_name}' because it has menuEligible=false in jobs_master. "
                f"Please set isMenu=false for this job or update the job's menuEligible first."
            )


async def _validate_permissions_structure(db, permissions_data):
    """
    Validate nested permissions structure: modules -> jobs -> permissions

    OPTIMIZED: Uses batch queries instead of N+1 pattern.
    Collects all IDs/names first, then validates in 3 queries total.

    Args:
        db: Database instance
        permissions_data: List of ModuleItem objects or dicts with nested structure

    Raises:
        ValueError: If any moduleId, jobName, or permission name doesn't exist or is soft-deleted
    """
    if not permissions_data:
        return

    # Validate isMenu against menuEligible first
    await _validate_is_menu_against_menu_eligible(db, permissions_data)

    # Collect all unique IDs and names to validate
    module_ids = set()
    job_names = set()
    permission_names = set()

    for module_item in permissions_data:
        # Handle both dict and object formats
        if isinstance(module_item, dict):
            module_id = module_item.get("moduleId")
            jobs = module_item.get("jobs", [])
        else:
            module_id = module_item.moduleId
            jobs = module_item.jobs

        if module_id:
            module_ids.add(module_id)

        for job_item in jobs:
            if isinstance(job_item, dict):
                job_name = job_item.get("jobName")
                permissions = job_item.get("permissions", [])
            else:
                job_name = job_item.jobName
                permissions = job_item.permissions

            if job_name:
                job_names.add(job_name.lower())  # Store lowercase for case-insensitive comparison

            for perm in permissions:
                if isinstance(perm, str):
                    perm_name = perm
                elif isinstance(perm, dict):
                    perm_name = perm.get("name", "")
                elif hasattr(perm, 'name'):
                    perm_name = perm.name
                else:
                    perm_name = str(perm)
                if perm_name:
                    permission_names.add(perm_name.lower())  # Store lowercase for case-insensitive comparison

    # Batch validate all modules, jobs, and permissions in parallel (3 queries total)
    async def validate_modules():
        if not module_ids:
            return set()
        valid_module_ids = []
        for mid in module_ids:
            if ObjectId.is_valid(mid):
                valid_module_ids.append(ObjectId(mid))
        if not valid_module_ids:
            return set()
        modules = await db[Collections.MODULES].find(
            {"_id": {"$in": valid_module_ids}, "isDelete": False},
            {"_id": 1}
        ).to_list(length=None)
        return {str(m["_id"]) for m in modules}

    async def validate_jobs():
        if not job_names:
            return set()
        jobs = await db[Collections.JOBS].find(
            {"isDelete": False},
            {"name": 1}
        ).to_list(length=None)
        return {j["name"].lower() for j in jobs if j.get("name")}

    async def validate_permissions():
        if not permission_names:
            return set()
        perms = await db[Collections.PERMISSIONS].find(
            {"isDelete": False},
            {"name": 1}
        ).to_list(length=None)
        return {p["name"].lower() for p in perms if p.get("name")}

    # Run all validations in parallel
    valid_modules, valid_jobs, valid_permissions = await asyncio.gather(
        validate_modules(),
        validate_jobs(),
        validate_permissions()
    )

    # Check for missing modules
    for module_id in module_ids:
        if module_id not in valid_modules:
            raise ValueError(f"Module with ID '{module_id}' not found or is deleted")

    # Check for missing jobs
    for job_name in job_names:
        if job_name not in valid_jobs:
            raise ValueError(f"Job with name '{job_name}' not found or is deleted")

    # Check for missing permissions
    for perm_name in permission_names:
        if perm_name not in valid_permissions:
            raise ValueError(f"Permission with name '{perm_name}' not found or is deleted")


def _process_job_display_order_for_update(new_permissions: list, existing_permissions: list) -> list:
    """
    Process displayOrder for each job in permissions during role update.

    Logic:
    - If displayOrder is explicitly provided -> use that value
    - If displayOrder is NOT provided but isMenu changed:
        - isMenu changed to False -> set displayOrder = 0
        - isMenu changed to True -> set displayOrder = 1
    - Otherwise -> keep existing displayOrder

    Args:
        new_permissions: New permissions being set
        existing_permissions: Current permissions in the role

    Returns:
        Processed permissions with displayOrder set correctly
    """
    if not new_permissions:
        return new_permissions

    # Build a lookup map of existing job settings: jobName -> {isMenu, displayOrder}
    existing_job_map = {}
    for module in (existing_permissions or []):
        for job in module.get("jobs", []):
            job_name = job.get("jobName")
            if job_name:
                existing_job_map[job_name] = {
                    "isMenu": job.get("isMenu", True),
                    "displayOrder": job.get("displayOrder", 1)
                }

    processed_permissions = []
    for module in new_permissions:
        # Convert to dict if Pydantic model
        if hasattr(module, 'model_dump'):
            processed_module = module.model_dump()
        elif hasattr(module, '__dict__'):
            processed_module = {k: v for k, v in module.__dict__.items() if not k.startswith('_')}
        else:
            processed_module = {**module} if isinstance(module, dict) else dict(module)

        processed_jobs = []
        jobs = processed_module.get("jobs", [])

        for job in jobs:
            # Convert job to dict if Pydantic model
            if hasattr(job, 'model_dump'):
                processed_job = job.model_dump()
            elif hasattr(job, '__dict__'):
                processed_job = {k: v for k, v in job.__dict__.items() if not k.startswith('_')}
            else:
                processed_job = {**job} if isinstance(job, dict) else dict(job)

            job_name = processed_job.get("jobName")
            new_is_menu = processed_job.get("isMenu", True)
            new_display_order = processed_job.get("displayOrder")

            # Get existing values for this job
            existing = existing_job_map.get(job_name, {})
            existing_is_menu = existing.get("isMenu", True)
            existing_display_order = existing.get("displayOrder", 1)

            # Determine if displayOrder was explicitly provided
            # If it's the schema default (1) and isMenu changed, we adjust it
            # Otherwise, we use the provided value

            if new_display_order is not None and new_display_order != 1:
                # Explicitly provided a non-default displayOrder, use it
                processed_job["displayOrder"] = new_display_order
            elif new_is_menu != existing_is_menu:
                # isMenu changed, auto-adjust displayOrder
                if new_is_menu:
                    processed_job["displayOrder"] = 1
                else:
                    processed_job["displayOrder"] = 0
            else:
                # No change to isMenu, keep existing displayOrder if job existed
                if job_name in existing_job_map:
                    processed_job["displayOrder"] = existing_display_order
                else:
                    # New job, apply create logic
                    if not new_is_menu:
                        processed_job["displayOrder"] = 0
                    else:
                        processed_job["displayOrder"] = 1

            processed_jobs.append(processed_job)

        processed_module["jobs"] = processed_jobs
        processed_permissions.append(processed_module)

    return processed_permissions


def _process_job_display_order_for_create(permissions: list) -> list:
    """
    Process displayOrder for each job in permissions during role creation.

    Logic:
    - If displayOrder is not provided (or is default 1):
        - If isMenu is True -> displayOrder = 1
        - If isMenu is False -> displayOrder = 0

    Args:
        permissions: List of permission modules with jobs

    Returns:
        Processed permissions with displayOrder set correctly
    """
    if not permissions:
        return permissions

    processed_permissions = []
    for module in permissions:
        processed_module = {**module} if isinstance(module, dict) else module.copy() if hasattr(module, 'copy') else dict(module)

        # Handle both dict and Pydantic model
        if hasattr(module, 'model_dump'):
            processed_module = module.model_dump()
        elif hasattr(module, '__dict__'):
            processed_module = {k: v for k, v in module.__dict__.items() if not k.startswith('_')}

        processed_jobs = []
        jobs = processed_module.get("jobs", [])

        for job in jobs:
            # Convert job to dict if it's a Pydantic model
            if hasattr(job, 'model_dump'):
                processed_job = job.model_dump()
            elif hasattr(job, '__dict__'):
                processed_job = {k: v for k, v in job.__dict__.items() if not k.startswith('_')}
            else:
                processed_job = {**job} if isinstance(job, dict) else dict(job)

            # Get isMenu value (default to True if not present)
            is_menu = processed_job.get("isMenu", True)

            # Set displayOrder based on isMenu if displayOrder is default (1) or not explicitly set
            # Since schema default is 1, we check if isMenu is False and displayOrder is still 1
            if not is_menu and processed_job.get("displayOrder", 1) == 1:
                processed_job["displayOrder"] = 0

            processed_jobs.append(processed_job)

        processed_module["jobs"] = processed_jobs
        processed_permissions.append(processed_module)

    return processed_permissions


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_role(
    data: RoleCreateSchema,
    created_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new role

    Args:
        data: Role creation schema
        created_by: User ID who is creating this record (from token _id)
        client_ip: IP address of the client making the request
        request: FastAPI Request object for error logging

    Returns:
        Created role document

    Raises:
        HTTPException: If name/shortCode already exists or permission IDs are invalid
    """
    db = get_database()

    # Validate nested permissions structure (modules -> jobs -> permissions)
    await _validate_permissions_structure(db, data.permissions)

    # Check if name already exists (case-insensitive, check against all records including deleted)
    existing_name = await db[Collections.ROLES].find_one({
        "name": {"$regex": f"^{data.name}$", "$options": "i"}
    })
    if existing_name:
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_CREATE_DUPLICATE_NAME,
            parameters={"name": data.name},
            actor_user_id=created_by
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role with name '{data.name}' already exists"
        )

    # Check if shortCode already exists (case-insensitive, check against all records including deleted)
    existing_code = await db[Collections.ROLES].find_one({
        "shortCode": {"$regex": f"^{data.shortCode}$", "$options": "i"}
    })
    if existing_code:
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_CREATE_DUPLICATE_CODE,
            parameters={"shortCode": data.shortCode},
            actor_user_id=created_by
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role with short code '{data.shortCode}' already exists"
        )

    # Prepare document
    role_dict = data.model_dump()

    # Process displayOrder for each job based on isMenu
    # If isMenu is False and displayOrder is default (1), set displayOrder to 0
    role_dict["permissions"] = _process_job_display_order_for_create(role_dict.get("permissions", []))

    role_dict["isActive"] = True
    role_dict["isDelete"] = False
    role_dict["createdBy"] = ObjectId(created_by) if ObjectId.is_valid(created_by) else created_by
    role_dict["createdAt"] = get_ist_now()
    if client_ip:
        role_dict["createdIp"] = client_ip

    # Insert
    result = await db[Collections.ROLES].insert_one(role_dict)
    created_role = await db[Collections.ROLES].find_one({"_id": result.inserted_id})

    return convert_objectid_to_str(created_role)


async def update_role(
    role_id: str,
    update_data: dict,
    updated_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Update an existing role (partial update)

    Args:
        role_id: Role ID
        update_data: Fields to update
        updated_by: User ID who is updating this record (from token _id)
        client_ip: IP address of the client making the request
        request: FastAPI Request object for error logging

    Returns:
        Updated role document

    Raises:
        HTTPException: If role not found, already deleted, or conflicts exist
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(role_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_UPDATE_FAILED,
            parameters={"role_id": role_id, "reason": "Invalid ObjectId format"},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role ID format"
        )

    # Check if role exists and is not soft-deleted
    existing = await db[Collections.ROLES].find_one({
        "_id": ObjectId(role_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_UPDATE_NOT_FOUND,
            parameters={"role_id": role_id},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role not found or already deleted"
        )

    # Filter out None values (except updatedIp which we handle separately)
    filtered_update = {k: v for k, v in update_data.items() if v is not None and k != "updatedIp"}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_UPDATE_FAILED,
            parameters={"role_id": role_id, "reason": "No fields to update"},
            actor_user_id=updated_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    # Validate nested permissions structure if being updated
    if "permissions" in filtered_update:
        await _validate_permissions_structure(db, filtered_update["permissions"])

        # Process displayOrder for each job based on isMenu changes
        # Compare with existing permissions to handle isMenu state changes
        existing_permissions = existing.get("permissions", [])
        filtered_update["permissions"] = _process_job_display_order_for_update(
            filtered_update["permissions"],
            existing_permissions
        )

    # If name is being updated, check uniqueness (case-insensitive, check against all records including deleted)
    if "name" in filtered_update:
        name_exists = await db[Collections.ROLES].find_one({
            "name": {"$regex": f"^{filtered_update['name']}$", "$options": "i"},
            "_id": {"$ne": ObjectId(role_id)}
        })
        if name_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.ROLE_UPDATE_DUPLICATE_NAME,
                parameters={"role_id": role_id, "name": filtered_update['name']},
                actor_user_id=updated_by
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role with name '{filtered_update['name']}' already exists"
            )

    # If shortCode is being updated, check uniqueness (case-insensitive, check against all records including deleted)
    if "shortCode" in filtered_update:
        code_exists = await db[Collections.ROLES].find_one({
            "shortCode": {"$regex": f"^{filtered_update['shortCode']}$", "$options": "i"},
            "_id": {"$ne": ObjectId(role_id)}
        })
        if code_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.ROLE_UPDATE_DUPLICATE_CODE,
                parameters={"role_id": role_id, "shortCode": filtered_update['shortCode']},
                actor_user_id=updated_by
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Role with short code '{filtered_update['shortCode']}' already exists"
            )

    # Update metadata
    filtered_update["updatedBy"] = ObjectId(updated_by) if ObjectId.is_valid(updated_by) else updated_by
    filtered_update["updatedAt"] = get_ist_now()
    if client_ip:
        filtered_update["updatedIp"] = client_ip

    # Update in database
    await db[Collections.ROLES].update_one(
        {"_id": ObjectId(role_id)},
        {"$set": filtered_update}
    )
    updated_role = await db[Collections.ROLES].find_one({"_id": ObjectId(role_id)})

    return convert_objectid_to_str(updated_role)


async def delete_role(
    role_id: str,
    deleted_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a role

    Args:
        role_id: Role ID
        deleted_by: User ID who is deleting this record (from token _id)
        client_ip: IP address of the client making the request
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If role not found or already deleted
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(role_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_DELETE_FAILED,
            parameters={"role_id": role_id, "reason": "Invalid ObjectId format"},
            actor_user_id=deleted_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role ID format"
        )

    # Check if exists and not already deleted
    existing = await db[Collections.ROLES].find_one({
        "_id": ObjectId(role_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_DELETE_NOT_FOUND,
            parameters={"role_id": role_id},
            actor_user_id=deleted_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found or already deleted"
        )

    # Check if any user mappings are using this role (among non-deleted mappings)
    user_mapping_using_role = await db[Collections.USER_MAPPING].find_one({
        "roleId": ObjectId(role_id),
        "isDelete": False
    })
    if user_mapping_using_role:
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_DELETE_IN_USE,
            parameters={"role_id": role_id, "reference": "user_mapping"},
            actor_user_id=deleted_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("role_has_personnel")
        )

    # Soft delete by setting isDelete=True
    result = await db[Collections.ROLES].update_one(
        {"_id": ObjectId(role_id)},
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


async def restore_role(
    role_id: str,
    restored_by: str,
    client_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Restore a soft-deleted role

    Args:
        role_id: Role ID
        restored_by: User ID who is restoring this record (from token _id)
        client_ip: IP address of the client making the request
        request: FastAPI Request object for error logging

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If role not found or not deleted
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(role_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_RESTORE_FAILED,
            parameters={"role_id": role_id, "reason": "Invalid ObjectId format"},
            actor_user_id=restored_by
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role ID format"
        )

    # Check if exists and is deleted
    existing = await db[Collections.ROLES].find_one({
        "_id": ObjectId(role_id),
        "isDelete": True
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_RESTORE_NOT_FOUND,
            parameters={"role_id": role_id},
            actor_user_id=restored_by
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found or not deleted"
        )

    # Restore (set isDelete to False only - isActive should be managed separately)
    result = await db[Collections.ROLES].update_one(
        {"_id": ObjectId(role_id)},
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


async def get_role(role_id: str) -> Optional[dict]:
    """
    Get a single role by ID (excludes soft-deleted)
    Optimized with aggregation pipeline to fetch role and job data in a single query.

    Args:
        role_id: Role ID

    Returns:
        Role document or None if not found

    Raises:
        HTTPException: If role ID format is invalid
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(role_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role ID format"
        )

    # Use aggregation pipeline to fetch role and job data in a single query
    pipeline = [
        # Match the specific role
        {
            "$match": {
                "_id": ObjectId(role_id),
                "isDelete": False
            }
        },
        # Unwind permissions to process each module
        {"$unwind": {"path": "$permissions", "preserveNullAndEmptyArrays": True}},
        # Unwind jobs within each module
        {"$unwind": {"path": "$permissions.jobs", "preserveNullAndEmptyArrays": True}},
        # Lookup job data from jobs_master
        {
            "$lookup": {
                "from": Collections.JOBS,
                "let": {"jobName": "$permissions.jobs.jobName"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {"$eq": ["$name", "$$jobName"]},
                            "isDelete": False
                        }
                    },
                    {"$project": {"displayName": 1, "route": 1, "_id": 0}}
                ],
                "as": "jobData"
            }
        },
        # Add job displayName and route to the job object
        {
            "$addFields": {
                "permissions.jobs.displayName": {
                    "$ifNull": [{"$arrayElemAt": ["$jobData.displayName", 0]}, ""]
                },
                "permissions.jobs.route": {
                    "$ifNull": [{"$arrayElemAt": ["$jobData.route", 0]}, ""]
                }
            }
        },
        # Remove the temporary jobData field
        {"$project": {"jobData": 0}},
        # Group jobs back into permissions array
        {
            "$group": {
                "_id": {
                    "roleId": "$_id",
                    "moduleId": "$permissions.moduleId",
                    "moduleName": "$permissions.moduleName"
                },
                "roleData": {"$first": "$$ROOT"},
                "jobs": {"$push": "$permissions.jobs"}
            }
        },
        # Reconstruct the module structure
        {
            "$addFields": {
                "permission": {
                    "moduleId": "$_id.moduleId",
                    "moduleName": "$_id.moduleName",
                    "jobs": {
                        "$filter": {
                            "input": "$jobs",
                            "as": "job",
                            "cond": {"$ne": ["$$job", None]}
                        }
                    }
                }
            }
        },
        # Group permissions back into the role
        {
            "$group": {
                "_id": "$_id.roleId",
                "roleData": {"$first": "$roleData"},
                "permissions": {"$push": "$permission"}
            }
        },
        # Reconstruct the final role document
        {
            "$replaceRoot": {
                "newRoot": {
                    "$mergeObjects": [
                        "$roleData",
                        {
                            "permissions": {
                                "$filter": {
                                    "input": "$permissions",
                                    "as": "perm",
                                    "cond": {"$ne": ["$$perm.moduleId", None]}
                                }
                            }
                        }
                    ]
                }
            }
        },
        # Remove internal fields
        {"$project": {"jobData": 0}}
    ]

    result = await db[Collections.ROLES].aggregate(pipeline).to_list(length=1)

    if not result:
        return None

    return convert_objectid_to_str(result[0])


async def list_roles(
    include_deleted: bool = False,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: int = 10
) -> Tuple[List[dict], int]:
    """
    List roles with optional filters and pagination.
    Optimized with parallel queries for count and data fetching.

    Args:
        include_deleted: Include soft-deleted records
        search: Search in name, shortCode, or description
        page: Page number (1-indexed). If None, returns all records.
        page_size: Number of records per page

    Returns:
        Tuple of (list of role documents, total count)
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

    # Helper function to fetch roles
    async def fetch_roles():
        cursor = db[Collections.ROLES].find(query).sort("createdAt", -1)
        if page is not None:
            skip = (page - 1) * page_size
            cursor = cursor.skip(skip).limit(page_size)
            return await cursor.to_list(length=page_size)
        else:
            return await cursor.to_list(length=None)

    # Run count and fetch in parallel
    total, roles = await asyncio.gather(
        db[Collections.ROLES].count_documents(query),
        fetch_roles()
    )

    # Early return if no roles found
    if not roles:
        return [], total

    # Batch optimization: Collect all unique job names from all roles first
    all_job_names = set()
    for role in roles:
        if role.get("permissions"):
            for module in role["permissions"]:
                for job in module.get("jobs", []):
                    job_name = job.get("jobName")
                    if job_name:
                        all_job_names.add(job_name)

    # Fetch displayName and route for all jobs in ONE query
    job_data_map = {}
    if all_job_names:
        jobs_data = await db[Collections.JOBS].find(
            {"name": {"$in": list(all_job_names)}, "isDelete": False},
            {"name": 1, "displayName": 1, "route": 1}
        ).to_list(length=None)
        job_data_map = {
            job["name"]: {
                "displayName": job.get("displayName", ""),
                "route": job.get("route", "")
            }
            for job in jobs_data
        }

    # Enrich each role's permissions with pre-fetched job data map (sync operation now)
    for role in roles:
        if role.get("permissions"):
            role["permissions"] = _enrich_permissions_sync(role["permissions"], job_data_map)

    # Convert ObjectIds
    return [convert_objectid_to_str(role) for role in roles], total


def _enrich_permissions_sync(permissions: list, job_data_map: dict) -> list:
    """
    Synchronous version of permission enrichment when job_data_map is already available.
    Avoids async overhead for simple data transformation.
    """
    if not permissions:
        return permissions

    enriched_permissions = []
    for module in permissions:
        enriched_module = {**module}
        enriched_jobs = []

        for job in module.get("jobs", []):
            job_name = job.get("jobName")
            job_data = job_data_map.get(job_name, {})

            enriched_job = {
                "jobName": job_name,
                "isMenu": job.get("isMenu", True),
                "displayOrder": job.get("displayOrder", 1),
                "permissions": job.get("permissions", []),
                "displayName": job_data.get("displayName", ""),
                "route": job_data.get("route", "")
            }
            enriched_jobs.append(enriched_job)

        enriched_module["jobs"] = enriched_jobs
        enriched_permissions.append(enriched_module)

    return enriched_permissions


async def count_roles(search: Optional[str] = None, include_deleted: bool = False) -> int:
    """
    Count roles matching the search criteria

    Args:
        search: Search in name, shortCode, or description
        include_deleted: Include soft-deleted records

    Returns:
        Total count of matching roles
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

    return await db[Collections.ROLES].count_documents(query)
