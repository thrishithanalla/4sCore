"""
Prompt Service Module
Provides business logic for promptTable collection
"""
from typing import Dict, List, Optional, Any, Tuple
from fastapi import HTTPException, status, Request
from bson import ObjectId

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.prompt_schema import (
    PromptCreateSchema,
    PromptUpdateSchema,
)
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error


def _convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    from datetime import datetime

    if not document:
        return document

    if "_id" in document and isinstance(document["_id"], ObjectId):
        document["_id"] = str(document["_id"])
    if "moduleId" in document and isinstance(document["moduleId"], ObjectId):
        document["moduleId"] = str(document["moduleId"])
    if "createdBy" in document and isinstance(document["createdBy"], ObjectId):
        document["createdBy"] = str(document["createdBy"])
    if "updatedBy" in document and isinstance(document["updatedBy"], ObjectId):
        document["updatedBy"] = str(document["updatedBy"])

    # Convert datetime fields to ISO format strings
    for field in ["createdAt", "updatedAt"]:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_prompt(data: PromptCreateSchema, created_by: str, request: Optional[Request] = None, created_ip: Optional[str] = None) -> dict:
    """
    Create a new prompt entry

    Args:
        data: Prompt creation schema
        created_by: User ID who is creating this record (from token _id)
        request: FastAPI request object for error logging
        created_ip: IP address of the client making the request

    Returns:
        Created prompt document

    Raises:
        HTTPException: If name already exists
    """
    db = get_database()

    # Check for duplicate name (case-insensitive, check all records including deleted)
    existing = await db[Collections.PROMPT_MASTER].find_one({
        "name": {"$regex": f"^{data.name}$", "$options": "i"}
    })
    if existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_NAME_ALREADY_EXISTS,
            parameters={"name": data.name}
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Prompt with name '{data.name}' already exists"
        )

    # Prepare document
    prompt_dict = data.model_dump()

    # Convert moduleId to ObjectId if provided
    if prompt_dict.get("moduleId") and ObjectId.is_valid(prompt_dict["moduleId"]):
        prompt_dict["moduleId"] = ObjectId(prompt_dict["moduleId"])

    prompt_dict["isActive"] = True
    prompt_dict["isDelete"] = False
    prompt_dict["createdBy"] = ObjectId(created_by) if ObjectId.is_valid(created_by) else created_by
    prompt_dict["createdAt"] = get_ist_now()
    prompt_dict["createdIp"] = created_ip
    prompt_dict["updatedBy"] = None
    prompt_dict["updatedAt"] = None
    prompt_dict["updatedIp"] = None

    # Insert
    result = await db[Collections.PROMPT_MASTER].insert_one(prompt_dict)
    created_prompt = await db[Collections.PROMPT_MASTER].find_one({"_id": result.inserted_id})

    return _convert_objectid_to_str(created_prompt)


async def update_prompt(prompt_id: str, data: PromptUpdateSchema, updated_by: str, request: Optional[Request] = None, updated_ip: Optional[str] = None) -> dict:
    """
    Update an existing prompt entry

    Args:
        prompt_id: Prompt ID
        data: Update schema with fields to change
        updated_by: User ID who is updating this record (from token _id)
        request: FastAPI request object for error logging

    Returns:
        Updated prompt document

    Raises:
        HTTPException: If prompt not found, already deleted, or name conflict exists
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(prompt_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_INVALID_ID,
            parameters={"prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid prompt ID format"
        )

    # Check if prompt exists and is not soft-deleted
    existing = await db[Collections.PROMPT_MASTER].find_one({
        "_id": ObjectId(prompt_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_NOT_FOUND,
            parameters={"prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found or already deleted"
        )

    # Check for duplicate name (case-insensitive, check all records including deleted, excluding current)
    name_exists = await db[Collections.PROMPT_MASTER].find_one({
        "name": {"$regex": f"^{data.name}$", "$options": "i"},
        "_id": {"$ne": ObjectId(prompt_id)}
    })
    if name_exists:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_NAME_ALREADY_EXISTS,
            parameters={"name": data.name, "prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Prompt with name '{data.name}' already exists"
        )

    # Convert moduleId to ObjectId if provided
    module_id = None
    if data.moduleId and ObjectId.is_valid(data.moduleId):
        module_id = ObjectId(data.moduleId)

    # Build update data
    update_data = {
        "type": data.type,
        "name": data.name,
        "aiRole": data.aiRole,
        "systemRole": data.systemRole,
        "objective": data.objective,
        "moduleId": module_id,
        "iconPath": data.iconPath,
        "tech": data.tech,
        "taskInstructions": data.taskInstructions,
        "taskInput": data.taskInput,
        "taskOutputFormat": data.taskOutputFormat,
        "taskExample": data.taskExample,
        "llm": data.llm,
        "settingsJson": data.settingsJson,
        "updatedBy": ObjectId(updated_by) if ObjectId.is_valid(updated_by) else updated_by,
        "updatedAt": get_ist_now(),
        "updatedIp": updated_ip
    }

    # Update in database
    await db[Collections.PROMPT_MASTER].update_one(
        {"_id": ObjectId(prompt_id)},
        {"$set": update_data}
    )
    updated_prompt = await db[Collections.PROMPT_MASTER].find_one({"_id": ObjectId(prompt_id)})

    return _convert_objectid_to_str(updated_prompt)


async def soft_delete_prompt(prompt_id: str, deleted_by: str, request: Optional[Request] = None) -> bool:
    """
    Soft delete a prompt entry

    Args:
        prompt_id: Prompt ID
        deleted_by: User ID who is deleting this record (from token _id)
        request: FastAPI request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If prompt not found or already deleted
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(prompt_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_INVALID_ID,
            parameters={"prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid prompt ID format"
        )

    # Check if exists and not already deleted
    existing = await db[Collections.PROMPT_MASTER].find_one({
        "_id": ObjectId(prompt_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_NOT_FOUND,
            parameters={"prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found or already deleted"
        )

    # Soft delete by setting isDelete=True
    result = await db[Collections.PROMPT_MASTER].update_one(
        {"_id": ObjectId(prompt_id)},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(deleted_by) if ObjectId.is_valid(deleted_by) else deleted_by,
                "updatedAt": get_ist_now()
            }
        }
    )

    return result.modified_count > 0


async def restore_prompt(prompt_id: str, restored_by: str, request: Optional[Request] = None) -> bool:
    """
    Restore a soft-deleted prompt entry

    Args:
        prompt_id: Prompt ID
        restored_by: User ID who is restoring this record (from token _id)
        request: FastAPI request object for error logging

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If prompt not found or not deleted
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(prompt_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_INVALID_ID,
            parameters={"prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid prompt ID format"
        )

    # Check if exists and is deleted
    existing = await db[Collections.PROMPT_MASTER].find_one({
        "_id": ObjectId(prompt_id),
        "isDelete": True
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_NOT_DELETED,
            parameters={"prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found or not deleted"
        )

    # Restore (set isDelete to False only - isActive should be managed separately)
    result = await db[Collections.PROMPT_MASTER].update_one(
        {"_id": ObjectId(prompt_id)},
        {
            "$set": {
                "isDelete": False,
                "updatedBy": ObjectId(restored_by) if ObjectId.is_valid(restored_by) else restored_by,
                "updatedAt": get_ist_now()
            }
        }
    )

    return result.modified_count > 0


async def get_prompt_by_id(prompt_id: str, request: Optional[Request] = None) -> Optional[dict]:
    """
    Get a single prompt by ID (excludes soft-deleted)

    Args:
        prompt_id: Prompt ID
        request: FastAPI request object for error logging

    Returns:
        Prompt document or None if not found

    Raises:
        HTTPException: If prompt ID format is invalid
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(prompt_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_INVALID_ID,
            parameters={"prompt_id": prompt_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid prompt ID format"
        )

    prompt = await db[Collections.PROMPT_MASTER].find_one({
        "_id": ObjectId(prompt_id),
        "isDelete": False
    })

    if not prompt:
        return None

    return _convert_objectid_to_str(prompt)


async def list_prompts(
    include_deleted: bool = False,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Tuple[List[dict], int]:
    """
    List prompts with optional filters and pagination

    Args:
        include_deleted: Include soft-deleted records
        search: Search in name, type, aiRole, or llm
        page: Page number (1-indexed). If None, returns all records.
        page_size: Number of records per page

    Returns:
        Tuple of (list of prompt documents, total count)
    """
    db = get_database()

    # Build query
    query = {}
    if not include_deleted:
        query["isDelete"] = False

    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"type": {"$regex": search, "$options": "i"}},
            {"aiRole": {"$regex": search, "$options": "i"}},
            {"llm": {"$regex": search, "$options": "i"}}
        ]

    # Get total count
    total = await db[Collections.PROMPT_MASTER].count_documents(query)

    # Execute query with or without pagination
    cursor = db[Collections.PROMPT_MASTER].find(query).sort("createdAt", -1)

    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)
        prompts = await cursor.to_list(length=page_size)
    else:
        prompts = await cursor.to_list(length=None)

    # Convert ObjectIds
    return [_convert_objectid_to_str(prompt) for prompt in prompts], total
