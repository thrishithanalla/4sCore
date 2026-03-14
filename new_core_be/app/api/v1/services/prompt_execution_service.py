"""
Prompt Execution Service Module
Provides business logic for prompt_execution_master collection
"""
from typing import Dict, List, Optional, Any, Tuple
from fastapi import HTTPException, status, Request
from bson import ObjectId
import asyncio

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.prompt_execution_schema import (
    PromptExecutionCreateSchema,
    PromptExecutionUpdateSchema,
)
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error


def _convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    from datetime import datetime

    if not document:
        return document

    objectid_fields = [
        "_id", "promptId", "userId", "feedbackId", "originalWorkId",
        "createdBy", "updatedBy"
    ]

    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    datetime_fields = ["createdAt", "updatedAt", "executionDateTime"]
    for field in datetime_fields:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


async def _batch_populate_prompt_names(db, executions: List[dict]) -> List[dict]:
    """
    Batch populate promptName for multiple prompt execution documents.
    Uses a single query to fetch all prompt names for better performance.

    Args:
        db: Database instance
        executions: List of prompt execution documents

    Returns:
        List of executions with promptName populated
    """
    if not executions:
        return executions

    # Collect all unique prompt IDs
    all_prompt_ids = set()
    for execution in executions:
        if execution.get("promptId"):
            prompt_id = execution["promptId"]
            if isinstance(prompt_id, ObjectId):
                all_prompt_ids.add(prompt_id)
            elif ObjectId.is_valid(str(prompt_id)):
                all_prompt_ids.add(ObjectId(str(prompt_id)))

    # Fetch all prompts in one query with projection (only _id and name)
    prompts_map = {}
    if all_prompt_ids:
        projection = {"_id": 1, "name": 1}
        cursor = db[Collections.PROMPT_MASTER].find(
            {"_id": {"$in": list(all_prompt_ids)}, "isDelete": False},
            projection
        )
        prompts = await cursor.to_list(length=None)

        # Build map of promptId -> promptName
        for prompt in prompts:
            prompts_map[prompt["_id"]] = prompt.get("name", "")

    # Populate promptName in each execution
    for execution in executions:
        if execution.get("promptId"):
            prompt_id = execution["promptId"]
            prompt_id_obj = prompt_id if isinstance(prompt_id, ObjectId) else ObjectId(str(prompt_id))

            if prompt_id_obj in prompts_map:
                execution["promptName"] = prompts_map[prompt_id_obj]
            else:
                execution["promptName"] = None

    return executions


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_prompt_execution(data: PromptExecutionCreateSchema, created_by: str, created_ip: Optional[str] = None) -> dict:
    """
    Create a new prompt execution entry

    Args:
        data: Prompt execution creation schema
        created_by: User ID who is creating this record (from token _id)
        created_ip: IP address of the client making the request

    Returns:
        Created prompt execution document
    """
    db = get_database()

    # Prepare document
    execution_dict = data.model_dump()

    # Convert FK fields to ObjectId
    execution_dict["promptId"] = ObjectId(data.promptId) if ObjectId.is_valid(data.promptId) else data.promptId
    execution_dict["userId"] = ObjectId(data.userId) if ObjectId.is_valid(data.userId) else data.userId

    if execution_dict.get("originalWorkId") and ObjectId.is_valid(execution_dict["originalWorkId"]):
        execution_dict["originalWorkId"] = ObjectId(execution_dict["originalWorkId"])

    if execution_dict.get("feedbackId") and ObjectId.is_valid(execution_dict["feedbackId"]):
        execution_dict["feedbackId"] = ObjectId(execution_dict["feedbackId"])

    # Set execution timestamp
    execution_dict["executionDateTime"] = get_ist_now()

    # Set audit fields (transaction table - no isActive)
    execution_dict["isDelete"] = False
    execution_dict["createdBy"] = ObjectId(created_by) if ObjectId.is_valid(created_by) else created_by
    execution_dict["createdAt"] = get_ist_now()
    execution_dict["createdIp"] = created_ip
    execution_dict["updatedBy"] = None
    execution_dict["updatedAt"] = None
    execution_dict["updatedIp"] = None

    # Insert
    result = await db[Collections.PROMPT_EXECUTION].insert_one(execution_dict)
    created_execution = await db[Collections.PROMPT_EXECUTION].find_one({"_id": result.inserted_id})

    return _convert_objectid_to_str(created_execution)


async def update_prompt_execution(execution_id: str, data: PromptExecutionUpdateSchema, updated_by: str, updated_ip: Optional[str] = None, request: Optional[Request] = None) -> dict:
    """
    Update an existing prompt execution entry

    Args:
        execution_id: Prompt execution ID
        data: Update schema with fields to change
        updated_by: User ID who is updating this record (from token _id)
        updated_ip: IP address of the client making the request
        request: FastAPI request object for error logging

    Returns:
        Updated prompt execution document

    Raises:
        HTTPException: If execution not found or already deleted
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(execution_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_EXEC_INVALID_ID,
            parameters={"execution_id": execution_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid execution ID format"
        )

    # Check if execution exists and is not soft-deleted
    existing = await db[Collections.PROMPT_EXECUTION].find_one({
        "_id": ObjectId(execution_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_EXEC_NOT_FOUND,
            parameters={"execution_id": execution_id}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt execution not found or already deleted"
        )

    # Build update data - only include fields that are provided
    update_data = {
        "updatedBy": ObjectId(updated_by) if ObjectId.is_valid(updated_by) else updated_by,
        "updatedAt": get_ist_now(),
        "updatedIp": updated_ip
    }

    # Add fields if they are provided in payload
    if data.promptId is not None:
        update_data["promptId"] = ObjectId(data.promptId) if ObjectId.is_valid(data.promptId) else data.promptId
    if data.userId is not None:
        update_data["userId"] = ObjectId(data.userId) if ObjectId.is_valid(data.userId) else data.userId
    if data.promptConstructionRecord is not None:
        update_data["promptConstructionRecord"] = data.promptConstructionRecord
    if data.finalPrompt is not None:
        update_data["finalPrompt"] = data.finalPrompt
    if data.promptOutput is not None:
        update_data["promptOutput"] = data.promptOutput
    if data.inputTokenCount is not None:
        update_data["inputTokenCount"] = data.inputTokenCount
    if data.outputTokenCount is not None:
        update_data["outputTokenCount"] = data.outputTokenCount
    if data.cost is not None:
        update_data["cost"] = data.cost
    if data.executionTime is not None:
        update_data["executionTime"] = data.executionTime
    if data.originalWorkId is not None:
        update_data["originalWorkId"] = ObjectId(data.originalWorkId) if ObjectId.is_valid(data.originalWorkId) else data.originalWorkId
    if data.revision is not None:
        update_data["revision"] = data.revision
    if data.feedbackId is not None:
        update_data["feedbackId"] = ObjectId(data.feedbackId) if ObjectId.is_valid(data.feedbackId) else data.feedbackId

    # Update in database
    await db[Collections.PROMPT_EXECUTION].update_one(
        {"_id": ObjectId(execution_id)},
        {"$set": update_data}
    )
    updated_execution = await db[Collections.PROMPT_EXECUTION].find_one({"_id": ObjectId(execution_id)})

    return _convert_objectid_to_str(updated_execution)


async def soft_delete_prompt_execution(execution_id: str, deleted_by: str, deleted_ip: Optional[str] = None, request: Optional[Request] = None) -> bool:
    """
    Soft delete a prompt execution entry

    Args:
        execution_id: Prompt execution ID
        deleted_by: User ID who is deleting this record (from token _id)
        deleted_ip: IP address of the request
        request: FastAPI request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If execution not found or already deleted
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(execution_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_EXEC_INVALID_ID,
            parameters={"execution_id": execution_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid execution ID format"
        )

    # Check if exists and not already deleted
    existing = await db[Collections.PROMPT_EXECUTION].find_one({
        "_id": ObjectId(execution_id),
        "isDelete": False
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_EXEC_NOT_FOUND,
            parameters={"execution_id": execution_id}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt execution not found or already deleted"
        )

    # Soft delete by setting isDelete=True
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(deleted_by) if ObjectId.is_valid(deleted_by) else deleted_by,
        "updatedAt": get_ist_now()
    }
    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    result = await db[Collections.PROMPT_EXECUTION].update_one(
        {"_id": ObjectId(execution_id)},
        {"$set": update_data}
    )

    return result.modified_count > 0


async def restore_prompt_execution(execution_id: str, restored_by: str, restored_ip: Optional[str] = None, request: Optional[Request] = None) -> bool:
    """
    Restore a soft-deleted prompt execution entry

    Args:
        execution_id: Prompt execution ID
        restored_by: User ID who is restoring this record (from token _id)
        restored_ip: IP address of the request
        request: FastAPI request object for error logging

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If execution not found or not deleted
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(execution_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_EXEC_INVALID_ID,
            parameters={"execution_id": execution_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid execution ID format"
        )

    # Check if exists and is deleted
    existing = await db[Collections.PROMPT_EXECUTION].find_one({
        "_id": ObjectId(execution_id),
        "isDelete": True
    })
    if not existing:
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_EXEC_NOT_DELETED,
            parameters={"execution_id": execution_id}
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt execution not found or not deleted"
        )

    # Restore by setting isDelete=False
    update_data = {
        "isDelete": False,
        "updatedBy": ObjectId(restored_by) if ObjectId.is_valid(restored_by) else restored_by,
        "updatedAt": get_ist_now()
    }
    if restored_ip:
        update_data["updatedIp"] = restored_ip

    result = await db[Collections.PROMPT_EXECUTION].update_one(
        {"_id": ObjectId(execution_id)},
        {"$set": update_data}
    )

    return result.modified_count > 0


async def get_prompt_execution_by_id(execution_id: str, request: Optional[Request] = None) -> Optional[dict]:
    """
    Get a single prompt execution by ID (excludes soft-deleted)

    Args:
        execution_id: Prompt execution ID
        request: FastAPI request object for error logging

    Returns:
        Prompt execution document or None if not found

    Raises:
        HTTPException: If execution ID format is invalid
    """
    db = get_database()

    # Validate ObjectId format
    if not ObjectId.is_valid(execution_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PROMPT_EXEC_INVALID_ID,
            parameters={"execution_id": execution_id}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid execution ID format"
        )

    execution = await db[Collections.PROMPT_EXECUTION].find_one({
        "_id": ObjectId(execution_id),
        "isDelete": False
    })

    if not execution:
        return None

    return _convert_objectid_to_str(execution)


async def list_prompt_executions(
    include_deleted: bool = False,
    prompt_id: Optional[str] = None,
    user_id: Optional[str] = None,
    feedback_id: Optional[str] = None,
    original_work_id: Optional[str] = None,
    min_cost: Optional[float] = None,
    max_cost: Optional[float] = None,
    min_execution_time: Optional[float] = None,
    max_execution_time: Optional[float] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 5
) -> Tuple[List[dict], int]:
    """
    List prompt executions with optional filters and pagination

    Args:
        include_deleted: Include soft-deleted records
        prompt_id: Filter by prompt ID
        user_id: Filter by user ID
        feedback_id: Filter by feedback ID
        original_work_id: Filter by original work ID
        min_cost: Filter by minimum cost
        max_cost: Filter by maximum cost
        min_execution_time: Filter by minimum execution time
        max_execution_time: Filter by maximum execution time
        from_date: Filter executions from this date
        to_date: Filter executions until this date
        page: Page number (1-indexed). Default: 1
        page_size: Number of records per page. Default: 5

    Returns:
        Tuple of (list of prompt execution documents with promptName, total count)
    """
    db = get_database()

    # Build query
    query = {}
    if not include_deleted:
        query["isDelete"] = False

    # Filter by promptId
    if prompt_id and ObjectId.is_valid(prompt_id):
        query["promptId"] = ObjectId(prompt_id)

    # Filter by userId
    if user_id and ObjectId.is_valid(user_id):
        query["userId"] = ObjectId(user_id)

    # Filter by feedbackId
    if feedback_id and ObjectId.is_valid(feedback_id):
        query["feedbackId"] = ObjectId(feedback_id)

    # Filter by originalWorkId
    if original_work_id and ObjectId.is_valid(original_work_id):
        query["originalWorkId"] = ObjectId(original_work_id)

    # Filter by cost range
    if min_cost is not None or max_cost is not None:
        query["cost"] = {}
        if min_cost is not None:
            query["cost"]["$gte"] = min_cost
        if max_cost is not None:
            query["cost"]["$lte"] = max_cost

    # Filter by execution time range
    if min_execution_time is not None or max_execution_time is not None:
        query["executionTime"] = {}
        if min_execution_time is not None:
            query["executionTime"]["$gte"] = min_execution_time
        if max_execution_time is not None:
            query["executionTime"]["$lte"] = max_execution_time

    # Filter by date range
    if from_date or to_date:
        query["executionDateTime"] = {}
        if from_date:
            query["executionDateTime"]["$gte"] = from_date
        if to_date:
            query["executionDateTime"]["$lte"] = to_date

    # Define projection - fetch only needed fields for better performance
    projection = {
        "_id": 1,
        "inputTokenCount": 1,
        "outputTokenCount": 1,
        "cost": 1,
        "executionTime": 1,
        "originalWorkId": 1,
        "revision": 1,
        "feedbackId": 1,
        "promptId": 1,
        "userId": 1,
        "executionDateTime": 1,
        "isDelete": 1,
        "createdAt": 1
    }

    # Execute query with pagination (always applied with defaults: page=1, page_size=5)
    cursor = db[Collections.PROMPT_EXECUTION].find(query, projection).sort("executionDateTime", -1)

    # Apply pagination
    skip = (page - 1) * page_size
    cursor = cursor.skip(skip).limit(page_size)

    # Execute count and fetch in parallel for better performance
    if not query or (len(query) == 1 and "isDelete" in query):
        count_task = db[Collections.PROMPT_EXECUTION].estimated_document_count()
    else:
        count_task = db[Collections.PROMPT_EXECUTION].count_documents(query)

    total, executions = await asyncio.gather(
        count_task,
        cursor.to_list(length=page_size)
    )

    # Batch populate promptName for all executions
    if executions:
        executions = await _batch_populate_prompt_names(db, executions)

    # Convert ObjectIds
    return [_convert_objectid_to_str(execution) for execution in executions], total
