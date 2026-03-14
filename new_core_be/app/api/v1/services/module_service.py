"""
Module Service Module
Provides business logic for Module management
"""
from typing import List, Optional
from bson import ObjectId
from fastapi import Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.constants.collections import Collections
from app.api.v1.schemas.module_schema import (
    ModuleCreateSchema,
    ModuleUpdateSchema
)
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error
from app.utils.error_messages import get_business_error

# Collection name from centralized constants
COLLECTION_NAME = Collections.MODULES


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

async def create_module(
    data: ModuleCreateSchema,
    created_by: str,
    created_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new module

    Args:
        data: Module creation schema
        created_by: User ID who is creating this record (from token _id)
        request: FastAPI Request object for error logging

    Returns:
        Created module document

    Raises:
        ValueError: If name or shortCode already exists
    """
    db = get_database()

    # Check if name already exists (case-insensitive, check against all records including deleted)
    existing_name = await db[COLLECTION_NAME].find_one({
        "name": {"$regex": f"^{data.name}$", "$options": "i"}
    })
    if existing_name:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_CREATE_DUPLICATE_NAME,
            parameters={"name": data.name},
            actor_user_id=created_by
        )
        raise ValueError(f"Module with name '{data.name}' already exists")

    # Check if shortCode already exists (case-insensitive, check against all records including deleted)
    existing_code = await db[COLLECTION_NAME].find_one({
        "shortCode": {"$regex": f"^{data.shortCode}$", "$options": "i"}
    })
    if existing_code:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_CREATE_DUPLICATE_SHORT_CODE,
            parameters={"shortCode": data.shortCode},
            actor_user_id=created_by
        )
        raise ValueError(f"Module with short code '{data.shortCode}' already exists")

    # Prepare document
    module_dict = data.model_dump()
    module_dict["isActive"] = True
    module_dict["isDelete"] = False
    module_dict["createdBy"] = ObjectId(created_by)
    module_dict["createdAt"] = get_ist_now()
    if created_ip:
        module_dict["createdIp"] = created_ip
    module_dict["updatedBy"] = None
    module_dict["updatedAt"] = None
    module_dict["updatedIp"] = None

    # Insert
    result = await db[COLLECTION_NAME].insert_one(module_dict)
    created_module = await db[COLLECTION_NAME].find_one({"_id": result.inserted_id})

    return _convert_objectid_to_str(created_module)


async def update_module(
    module_id: str,
    patch: ModuleUpdateSchema,
    updated_by: str,
    updated_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> dict:
    """
    Update an existing module (partial update)

    Args:
        module_id: Module ID
        patch: Update schema with fields to change
        updated_by: User ID who is updating this record (from token _id)
        request: FastAPI Request object for error logging

    Returns:
        Updated module document

    Raises:
        ValueError: If module not found, already deleted, or conflicts exist
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(module_id)
    except:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "reason": "Invalid ObjectId format"},
            actor_user_id=updated_by
        )
        raise ValueError(f"Invalid module ID format: '{module_id}'")

    # Check if module exists and is not soft-deleted
    existing = await db[COLLECTION_NAME].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_NOT_FOUND,
            parameters={"module_id": module_id},
            actor_user_id=updated_by
        )
        raise ValueError(f"Module with ID '{module_id}' not found or already deleted")

    # Prepare update data
    update_data = patch.model_dump(exclude_unset=True)

    if not update_data:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "reason": "No fields to update"},
            actor_user_id=updated_by
        )
        raise ValueError("No fields to update")

    # If name is being updated, check uniqueness (case-insensitive, check against all records including deleted)
    if "name" in update_data:
        name_exists = await db[COLLECTION_NAME].find_one({
            "name": {"$regex": f"^{update_data['name']}$", "$options": "i"},
            "_id": {"$ne": object_id}
        })
        if name_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_UPDATE_DUPLICATE_NAME,
                parameters={"module_id": module_id, "name": update_data['name']},
                actor_user_id=updated_by
            )
            raise ValueError(f"Module with name '{update_data['name']}' already exists")

    # If shortCode is being updated, check uniqueness (case-insensitive, check against all records including deleted)
    if "shortCode" in update_data:
        code_exists = await db[COLLECTION_NAME].find_one({
            "shortCode": {"$regex": f"^{update_data['shortCode']}$", "$options": "i"},
            "_id": {"$ne": object_id}
        })
        if code_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_UPDATE_DUPLICATE_SHORT_CODE,
                parameters={"module_id": module_id, "shortCode": update_data['shortCode']},
                actor_user_id=updated_by
            )
            raise ValueError(f"Module with short code '{update_data['shortCode']}' already exists")

    # Update metadata
    update_data["updatedBy"] = ObjectId(updated_by)
    update_data["updatedAt"] = get_ist_now()
    if updated_ip:
        update_data["updatedIp"] = updated_ip

    # Update in database
    await db[COLLECTION_NAME].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )
    updated_module = await db[COLLECTION_NAME].find_one({"_id": object_id})

    return _convert_objectid_to_str(updated_module)


async def delete_module(
    module_id: str,
    deleted_by: str,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a module

    Args:
        module_id: Module ID
        deleted_by: User ID who is deleting this record (from token _id)
        request: FastAPI Request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If module not found or already deleted
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(module_id)
    except:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_FAILED,
            parameters={"module_id": module_id, "reason": "Invalid ObjectId format"},
            actor_user_id=deleted_by
        )
        raise ValueError(f"Invalid module ID format: '{module_id}'")

    # Check if exists and not already deleted
    existing = await db[COLLECTION_NAME].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_NOT_FOUND,
            parameters={"module_id": module_id},
            actor_user_id=deleted_by
        )
        raise ValueError(f"Module with ID '{module_id}' not found or already deleted")

    # Check if any prompts are using this module (among non-deleted prompts)
    prompt_using_module = await db[Collections.PROMPT_MASTER].find_one({
        "moduleId": object_id,
        "isDelete": False
    })
    if prompt_using_module:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_IN_USE,
            parameters={"module_id": module_id, "reference": "prompts"},
            actor_user_id=deleted_by
        )
        raise ValueError(get_business_error("module_has_prompts"))

    # Check if this module is used in module hierarchy (among non-deleted hierarchy records)
    hierarchy_using_module = await db[Collections.MODULE_HIERARCHY].find_one({
        "$or": [
            {"moduleId": object_id},
            {"parentModuleId": object_id}
        ],
        "isDelete": False
    })
    if hierarchy_using_module:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_HAS_HIERARCHY,
            parameters={"module_id": module_id, "reference": "module_hierarchy"},
            actor_user_id=deleted_by
        )
        raise ValueError(get_business_error("module_has_hierarchy"))

    # Check if this module is used in module_job_mapping (among non-deleted mappings)
    module_job_mapping_using_module = await db[Collections.MODULE_JOB_MAPPINGS].find_one({
        "moduleId": object_id,
        "isDelete": False
    })
    if module_job_mapping_using_module:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_IN_USE,
            parameters={"module_id": module_id, "reference": "module_job_mapping"},
            actor_user_id=deleted_by
        )
        raise ValueError("Cannot delete module. It is being used in module-job mappings. Please remove the mappings first.")

    # Check if this module is used in permissions_mapping (among non-deleted mappings)
    perm_mapping_using_module = await db[Collections.PERMISSION_MAPPINGS].find_one({
        "moduleId": object_id,
        "isDelete": False
    })
    if perm_mapping_using_module:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_IN_USE,
            parameters={"module_id": module_id, "reference": "permissions_mapping"},
            actor_user_id=deleted_by
        )
        raise ValueError("Cannot delete module. It is being used in permission mappings. Please remove the mappings first.")

    # Check if this module is used in roles_master (in permissions array)
    role_using_module = await db[Collections.ROLES].find_one({
        "permissions.moduleId": object_id,
        "isDelete": False
    })
    if role_using_module:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_IN_USE,
            parameters={"module_id": module_id, "reference": "roles", "roleName": role_using_module.get("name")},
            actor_user_id=deleted_by
        )
        raise ValueError(f"Cannot delete module. It is being used in role '{role_using_module.get('name')}'. Please remove module from the role first.")

    # Check if this module is used in user_role_permissions (additional/exclusion permissions)
    user_mapping_using_module = await db[Collections.USER_MAPPING].find_one({
        "$or": [
            {"additionalPermissions.moduleId": object_id},
            {"exclusionPermissions.moduleId": object_id}
        ],
        "isDelete": False
    })
    if user_mapping_using_module:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_IN_USE,
            parameters={"module_id": module_id, "reference": "user_mapping"},
            actor_user_id=deleted_by
        )
        raise ValueError("Cannot delete module. It is being used in user role mappings (additional/exclusion permissions). Please remove module from user mappings first.")

    # Soft delete by setting isDelete and updatedBy/updatedAt
    result = await db[COLLECTION_NAME].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(deleted_by),
                "updatedAt": get_ist_now()
            }
        }
    )

    return result.modified_count > 0


async def restore_module(
    module_id: str,
    restored_by: str,
    request: Optional[Request] = None
) -> dict:
    """
    Restore a soft-deleted module

    Args:
        module_id: Module ID
        restored_by: User ID who is restoring this record
        request: FastAPI Request object for error logging

    Returns:
        Restored module document

    Raises:
        ValueError: If module not found or not deleted
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(module_id)
    except:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_RESTORE_FAILED,
            parameters={"module_id": module_id, "reason": "Invalid ObjectId format"},
            actor_user_id=restored_by
        )
        raise ValueError(f"Invalid module ID format: '{module_id}'")

    # Check if exists and is deleted
    existing = await db[COLLECTION_NAME].find_one({"_id": object_id})
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_RESTORE_NOT_FOUND,
            parameters={"module_id": module_id},
            actor_user_id=restored_by
        )
        raise ValueError(f"Module with ID '{module_id}' not found")

    if not existing.get("isDelete", False):
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_RESTORE_ALREADY_ACTIVE,
            parameters={"module_id": module_id},
            actor_user_id=restored_by
        )
        raise ValueError(f"Module with ID '{module_id}' is not deleted")

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

    restored_module = await db[COLLECTION_NAME].find_one({"_id": object_id})
    return _convert_objectid_to_str(restored_module)


async def toggle_active_module(
    module_id: str,
    is_active: bool,
    updated_by: str,
    updated_ip: str = None,
    request: Optional[Request] = None
) -> dict:
    """
    Toggle isActive status of a module

    Args:
        module_id: Module ID
        is_active: New active status
        updated_by: User ID who is updating this record
        updated_ip: IP address of the updater (optional)
        request: FastAPI Request object for error logging

    Returns:
        Updated module document

    Raises:
        ValueError: If module not found or deleted
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(module_id)
    except:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_TOGGLE_FAILED,
            parameters={"module_id": module_id, "reason": "Invalid ObjectId format"},
            actor_user_id=updated_by
        )
        raise ValueError(f"Invalid module ID format: '{module_id}'")

    # Check if exists and is not deleted
    existing = await db[COLLECTION_NAME].find_one({
        "_id": object_id,
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_TOGGLE_NOT_FOUND,
            parameters={"module_id": module_id},
            actor_user_id=updated_by
        )
        raise ValueError(f"Module with ID '{module_id}' not found or deleted")

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

    updated_module = await db[COLLECTION_NAME].find_one({"_id": object_id})
    return _convert_objectid_to_str(updated_module)


async def get_module(module_id: str, include_deleted: bool = False) -> Optional[dict]:
    """
    Get a single module by ID

    Args:
        module_id: Module ID
        include_deleted: If True, includes soft-deleted records

    Returns:
        Module document or None if not found
    """
    db = get_database()

    # Validate ObjectId
    try:
        object_id = ObjectId(module_id)
    except:
        raise ValueError(f"Invalid module ID format: '{module_id}'")

    query = {"_id": object_id}
    if not include_deleted:
        query["isDelete"] = False

    module = await db[COLLECTION_NAME].find_one(query)

    if not module:
        return None

    return _convert_objectid_to_str(module)


async def list_modules(
    search: Optional[str] = None,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    exclude_audit: bool = False
) -> dict:
    """
    List modules with optional pagination and filters

    Args:
        search: Search in name, shortCode, or description
        include_deleted: If True, includes soft-deleted records
        page: Page number (optional)
        page_size: Items per page (optional)
        exclude_audit: If True, returns only id, name, and description (useful for UI dropdowns)

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

    # Build projection for exclude_audit
    projection = None
    if exclude_audit:
        projection = {
            "_id": 1,
            "name": 1,
            "description": 1
        }

    # Get total count
    total = await db[COLLECTION_NAME].count_documents(query)

    # Check if pagination is requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

        if projection:
            cursor = db[COLLECTION_NAME].find(query, projection).skip(skip).limit(page_size).sort("createdAt", -1)
        else:
            cursor = db[COLLECTION_NAME].find(query).skip(skip).limit(page_size).sort("createdAt", -1)
        modules = await cursor.to_list(length=page_size)

        return {
            "data": [_convert_objectid_to_str(m) for m in modules],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
    else:
        if projection:
            cursor = db[COLLECTION_NAME].find(query, projection).sort("createdAt", -1)
        else:
            cursor = db[COLLECTION_NAME].find(query).sort("createdAt", -1)
        modules = await cursor.to_list(length=None)

        return {
            "data": [_convert_objectid_to_str(m) for m in modules],
            "total": total,
            "page": 1,
            "page_size": total,
            "total_pages": 1
        }


# Keep old function for backward compatibility
async def search_modules(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[dict]:
    """
    Search modules with optional filters (excludes soft-deleted)
    DEPRECATED: Use list_modules instead
    """
    result = await list_modules(search=search, include_deleted=False)
    return result["data"]


async def count_modules(search: Optional[str] = None) -> int:
    """
    Count modules matching the search criteria (excludes soft-deleted)
    """
    result = await list_modules(search=search, include_deleted=False)
    return result["total"]


async def bulk_create_modules(data_list: List[ModuleCreateSchema], created_by: str, created_ip: Optional[str] = None) -> dict:
    """
    Create multiple modules at once

    Args:
        data_list: List of module creation data
        created_by: User ID creating the modules

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
                    "errors": f"Module with name '{data.name}' already exists"
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
                    "errors": f"Module with short code '{data.shortCode}' already exists"
                })
                continue

            # Prepare document
            module_dict = data.model_dump()
            module_dict["isActive"] = True
            module_dict["isDelete"] = False
            module_dict["createdBy"] = ObjectId(created_by)
            module_dict["createdAt"] = get_ist_now()
            if created_ip:
                module_dict["createdIp"] = created_ip
            module_dict["updatedBy"] = None
            module_dict["updatedAt"] = None
            module_dict["updatedIp"] = None

            # Insert into database
            result = await db[COLLECTION_NAME].insert_one(module_dict)

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
