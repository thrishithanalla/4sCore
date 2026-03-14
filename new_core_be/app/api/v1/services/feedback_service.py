"""
Feedback Service
Business logic for Feedback collection operations.

- Only Create, Get, List, Delete (NO Update, NO Restore)
- Has only isDelete (no isActive)
- userFeedback is a structured object containing component-specific data:
  - screen: NO componentId/componentExecutionId (only screen-specific fields)
  - prompt: HAS componentId and componentExecutionId (ObjectId references) + prompt-specific fields
  - api: NO componentId/componentExecutionId (only api-specific fields)
  - function: NO componentId/componentExecutionId (only function-specific fields)
  - Only one component type is populated at a time
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING

from app.constants.collections import Collections
from app.api.v1.schemas.feedback_schema import (
    FeedbackCreateSchema,
    FeedbackResponseSchema,
)
from app.utils.time_utils import get_ist_now
from app.utils.mongo import parse_object_id
from app.api.v1.utils.validators import validate_foreign_key
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error
from app.core.value_sets import normalize_code
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error

# Default state for new feedback (from valueSet key: "state")
DEFAULT_FEEDBACK_STATE = "submitted"

logger = logging.getLogger(__name__)

COLL = Collections.FEEDBACKS


def _doc_to_response(doc: Dict[str, Any]) -> FeedbackResponseSchema:
    """Convert MongoDB document to response schema"""
    from bson import ObjectId

    # Extract userFeedback - it's already in the new structured format in the database
    user_feedback = doc.get("userFeedback", {})

    # Convert ObjectIds to strings for prompt type (ONLY prompt has componentId and componentExecutionId)
    if user_feedback.get("prompt"):
        prompt_data = user_feedback["prompt"]
        if prompt_data.get("componentId") and isinstance(prompt_data["componentId"], ObjectId):
            prompt_data["componentId"] = str(prompt_data["componentId"])
        if prompt_data.get("componentExecutionId") and isinstance(prompt_data["componentExecutionId"], ObjectId):
            prompt_data["componentExecutionId"] = str(prompt_data["componentExecutionId"])

    return FeedbackResponseSchema(
        _id=str(doc["_id"]),
        feedbackMasterId=str(doc["feedbackMasterId"]) if doc.get("feedbackMasterId") else None,
        userFeedback=user_feedback,
        comment=doc.get("comment", ""),
        isLiked=doc.get("isLiked"),
        quickFeedback=doc.get("quickFeedback"),
        rating=doc.get("rating"),
        isRegenerated=doc.get("isRegenerated"),
        state=doc.get("state"),
        isDelete=doc.get("isDelete", False),
        createdBy=str(doc["createdBy"]) if doc.get("createdBy") else None,
        createdAt=doc.get("createdAt"),
        createdIp=doc.get("createdIp"),
        updatedBy=str(doc["updatedBy"]) if doc.get("updatedBy") else None,
        updatedAt=doc.get("updatedAt"),
        updatedIp=doc.get("updatedIp"),
        feedbackMaster=doc.get("feedbackMaster"),
    )


async def _populate_relations(db: AsyncIOMotorDatabase, doc: Dict[str, Any]) -> Dict[str, Any]:
    """Populate foreign key relations with actual data"""
    if not doc:
        return doc

    # Populate feedbackMaster
    if doc.get("feedbackMasterId"):
        from bson import ObjectId
        fm_id = doc["feedbackMasterId"] if isinstance(doc["feedbackMasterId"], ObjectId) else ObjectId(doc["feedbackMasterId"])
        fm = await db[Collections.FEEDBACK_MASTER].find_one({
            "_id": fm_id,
            "isDelete": {"$ne": True}
        })
        if fm:
            doc["feedbackMaster"] = {
                "_id": str(fm["_id"]),
                "name": fm.get("name"),
                "componentType": fm.get("componentType"),
            }

    return doc


async def create_feedback(
    db: AsyncIOMotorDatabase,
    data: FeedbackCreateSchema,
    created_by: str,
    created_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> FeedbackResponseSchema:
    """
    Create a new Feedback record.

    Args:
        db: MongoDB database instance
        data: Validated create schema
        created_by: User ID from authenticated token
        created_ip: IP address of the request

    Returns:
        FeedbackResponseSchema: The created record

    Raises:
        HTTPException: If validation fails
    """
    try:
        now = get_ist_now()

        doc = data.model_dump(mode="json", by_alias=False)

        # Look up feedbackMasterId by name
        feedback_master_name = doc.pop("feedbackMasterName")
        feedback_master = await db[Collections.FEEDBACK_MASTER].find_one({
            "name": feedback_master_name,
            "isDelete": {"$ne": True}
        })
        if not feedback_master:
            await log_error(
                request=request,
                error_code=ErrorCodes.FEEDBACK_CREATE_INVALID_MASTER,
                parameters={"feedbackMasterName": feedback_master_name},
                actor_user_id=created_by
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"FeedbackMaster with name '{feedback_master_name}' not found"
            )

        # Store the feedbackMasterId (ObjectId) in the document
        doc["feedbackMasterId"] = feedback_master["_id"]

        # Set default state from valueSet (key: "state", value: "submitted")
        try:
            doc["state"] = await normalize_code(db, "state", DEFAULT_FEEDBACK_STATE)
        except Exception as e:
            logger.warning(f"Could not normalize state value: {e}. Using default value.")
            doc["state"] = DEFAULT_FEEDBACK_STATE

        # Extract and validate userFeedback structure
        user_feedback = doc.get("userFeedback", {})

        # Determine which component type is populated
        component_type = None
        component_data = None
        for comp_type in ["screen", "prompt", "api", "function"]:
            if user_feedback.get(comp_type) is not None:
                component_type = comp_type
                component_data = user_feedback[comp_type]
                break

        if not component_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="userFeedback must have exactly one component type (screen/prompt/api/function) populated"
            )

        # Validate componentType matches feedbackMaster's componentType
        if feedback_master.get("componentType") != component_type:
            await log_error(
                request=request,
                error_code=ErrorCodes.FEEDBACK_CREATE_INVALID_COMPONENT_TYPE,
                parameters={
                    "expectedComponentType": feedback_master.get("componentType"),
                    "providedComponentType": component_type
                },
                actor_user_id=created_by
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Component type mismatch: FeedbackMaster expects '{feedback_master.get('componentType')}', but received '{component_type}'"
            )

        # Convert componentId and componentExecutionId to ObjectId ONLY for prompt type
        # Other types (screen, api, function) do NOT have these fields
        if component_type == "prompt":
            # Resolve promptName to componentId if provided
            if component_data and component_data.get("promptName"):
                prompt_name = component_data.pop("promptName")  # Remove promptName from data

                # Look up prompt_master by name to get _id
                prompt_master = await db[Collections.PROMPT_MASTER].find_one({
                    "name": prompt_name,
                    "isDelete": {"$ne": True}
                })

                if not prompt_master:
                    await log_error(
                        request=request,
                        error_code=ErrorCodes.FEEDBACK_CREATE_INVALID_PROMPT,
                        parameters={"promptName": prompt_name},
                        actor_user_id=created_by
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Prompt with name '{prompt_name}' not found in prompt_master"
                    )

                # Set componentId from prompt_master._id
                component_data["componentId"] = prompt_master["_id"]
                logger.info(f"Resolved promptName '{prompt_name}' to componentId '{prompt_master['_id']}'")

            elif component_data and component_data.get("componentId"):
                # Direct componentId provided - parse it
                try:
                    component_data["componentId"] = parse_object_id(component_data["componentId"])
                except ValueError as ve:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=get_validation_error("invalid_objectid", field_name=f"userFeedback.prompt.componentId")
                    ) from ve
            else:
                # Neither promptName nor componentId provided
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="prompt feedback requires either 'promptName' or 'componentId'"
                )

            if component_data and component_data.get("componentExecutionId"):
                try:
                    component_data["componentExecutionId"] = parse_object_id(component_data["componentExecutionId"])
                except ValueError as ve:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=get_validation_error("invalid_objectid", field_name=f"userFeedback.prompt.componentExecutionId")
                    ) from ve

        # Set audit fields
        doc["createdBy"] = parse_object_id(created_by)
        doc["createdAt"] = now
        doc["createdIp"] = created_ip
        doc["isDelete"] = False

        res = await db[COLL].insert_one(doc)
        created = await db[COLL].find_one({"_id": res.inserted_id})

        # Populate relations
        created = await _populate_relations(db, created)

        return _doc_to_response(created)

    except HTTPException:
        raise
    except ValueError as ve:
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="createdBy")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("create_feedback failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while creating feedback"
        ) from exc


async def get_feedback_by_id(
    db: AsyncIOMotorDatabase,
    id_str: str
) -> Optional[FeedbackResponseSchema]:
    """
    Get a Feedback by ID (excludes soft-deleted records).

    Args:
        id_str: The Feedback ID

    Returns:
        FeedbackResponseSchema or None
    """
    try:
        try:
            object_id = parse_object_id(id_str)
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="id")
            ) from ve

        doc = await db[COLL].find_one({
            "_id": object_id,
            "isDelete": {"$ne": True}
        })

        if doc:
            doc = await _populate_relations(db, doc)
            return _doc_to_response(doc)

        return None

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_feedback_by_id failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while fetching feedback"
        ) from exc


async def delete_feedback(
    db: AsyncIOMotorDatabase,
    id_str: str,
    deleted_by: Optional[str] = None,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a Feedback record.
    Sets isDelete=True.

    Args:
        db: MongoDB database instance
        id_str: The Feedback ID to delete
        deleted_by: User ID performing the delete
        deleted_ip: IP address of the request

    Returns:
        True if deleted successfully, False if not found
    """
    try:
        try:
            object_id = parse_object_id(id_str)
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="id")
            ) from ve

        doc = await db[COLL].find_one({"_id": object_id})
        if not doc:
            return False

        # Check if already deleted
        if doc.get("isDelete", False):
            await log_error(
                request=request,
                error_code=ErrorCodes.FEEDBACK_DELETE_FAILED,
                parameters={"id": id_str},
                actor_user_id=deleted_by
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("already_deleted")
            )

        update_data = {
            "isDelete": True,
            "updatedAt": get_ist_now(),
        }

        if deleted_by:
            update_data["updatedBy"] = parse_object_id(deleted_by)
        if deleted_ip:
            update_data["updatedIp"] = deleted_ip

        res = await db[COLL].update_one(
            {"_id": doc["_id"]},
            {"$set": update_data}
        )

        return res.modified_count == 1

    except HTTPException:
        raise
    except ValueError as ve:
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="deleted_by")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("delete_feedback failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while deleting feedback"
        ) from exc


async def list_feedbacks(
    db: AsyncIOMotorDatabase,
    feedback_master_id: Optional[str] = None,
    include_deleted: bool = False,
    is_active: Optional[bool] = True,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> Tuple[List[FeedbackResponseSchema], int]:
    """
    List Feedbacks with optional pagination and filtering.

    Args:
        db: MongoDB database instance
        feedback_master_id: Filter by FeedbackMaster ID
        include_deleted: Whether to include soft-deleted records
        is_active: Filter by active status (ignored - Feedback has no isActive field)
        page: Page number (1-indexed). If None, returns all records
        page_size: Number of records per page

    Returns:
        Tuple of (list of FeedbackResponseSchema, total count)
    """
    try:
        # Build query
        query: Dict[str, Any] = {}

        # Filter by delete status
        if not include_deleted:
            query["isDelete"] = {"$ne": True}

        # NOTE: Feedback doesn't have isActive field (only isDelete)
        # is_active parameter is kept for API compatibility but ignored

        if feedback_master_id:
            try:
                query["feedbackMasterId"] = parse_object_id(feedback_master_id)
            except ValueError as ve:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="feedbackMasterId")
                ) from ve

        total = await db[COLL].count_documents(query)

        cursor = db[COLL].find(query).sort([("createdAt", DESCENDING)])

        # Apply pagination if requested
        if page is not None:
            effective_page_size = page_size if page_size is not None else 20
            offset = (page - 1) * effective_page_size
            cursor = cursor.skip(offset).limit(effective_page_size)

        docs = await cursor.to_list(length=None)

        # Bulk populate feedbackMasters to avoid N+1 queries
        if docs:
            from bson import ObjectId

            # Collect all unique feedbackMasterIds
            master_ids = list(set(
                doc["feedbackMasterId"] for doc in docs
                if doc.get("feedbackMasterId")
            ))

            # Fetch all feedbackMasters in one query
            masters = {}
            if master_ids:
                master_cursor = db[Collections.FEEDBACK_MASTER].find({
                    "_id": {"$in": master_ids},
                    "isDelete": {"$ne": True}
                })
                master_list = await master_cursor.to_list(length=None)
                masters = {
                    str(fm["_id"]): {
                        "_id": str(fm["_id"]),
                        "name": fm.get("name"),
                        "componentType": fm.get("componentType"),
                    }
                    for fm in master_list
                }

            # Attach feedbackMaster to each doc
            for doc in docs:
                if doc.get("feedbackMasterId"):
                    master_id = str(doc["feedbackMasterId"]) if isinstance(doc["feedbackMasterId"], ObjectId) else doc["feedbackMasterId"]
                    doc["feedbackMaster"] = masters.get(master_id)

        # Convert to response
        result = [_doc_to_response(doc) for doc in docs]

        return result, total

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("list_feedbacks failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while listing feedbacks"
        ) from exc
