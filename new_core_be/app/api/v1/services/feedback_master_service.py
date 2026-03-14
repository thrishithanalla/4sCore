"""
FeedbackMaster Service
Business logic for FeedbackMaster collection operations.

- Name is unique when isDelete=false
- Different error messages based on isActive state for duplicates
- Supports Activate/Deactivate (no Restore)
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError

from app.constants.collections import Collections
from app.api.v1.schemas.feedback_master_schema import (
    FeedbackMasterCreateSchema,
    FeedbackMasterResponseSchema,
    FeedbackMasterUpdateSchema,
)
from app.utils.dt import utc_now
from app.utils.mongo import parse_object_id
from app.api.v1.utils.validators import validate_foreign_key
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error

logger = logging.getLogger(__name__)

COLL = Collections.FEEDBACK_MASTER


def _doc_to_response(doc: Dict[str, Any]) -> FeedbackMasterResponseSchema:
    """Convert MongoDB document to response schema"""
    return FeedbackMasterResponseSchema(
        _id=str(doc["_id"]),
        name=doc["name"],
        componentType=doc["componentType"],
        options=doc.get("options"),
        moduleId=str(doc["moduleId"]) if doc.get("moduleId") else None,
        isActive=doc.get("isActive", True),
        isDelete=doc.get("isDelete", False),
        createdBy=str(doc["createdBy"]) if doc.get("createdBy") else None,
        createdAt=doc.get("createdAt"),
        createdIp=doc.get("createdIp"),
        updatedBy=str(doc["updatedBy"]) if doc.get("updatedBy") else None,
        updatedAt=doc.get("updatedAt"),
        updatedIp=doc.get("updatedIp"),
        module=doc.get("module"),
    )


async def _populate_relations(db: AsyncIOMotorDatabase, doc: Dict[str, Any]) -> Dict[str, Any]:
    """Populate foreign key relations with actual data"""
    if not doc:
        return doc

    # Populate module
    if doc.get("moduleId"):
        from bson import ObjectId
        module_id = doc["moduleId"] if isinstance(doc["moduleId"], ObjectId) else ObjectId(doc["moduleId"])
        module = await db[Collections.MODULES].find_one({
            "_id": module_id,
            "isDelete": {"$ne": True}
        })
        if module:
            doc["module"] = {
                "_id": str(module["_id"]),
                "name": module.get("name"),
            }

    return doc


async def _check_name_uniqueness(
    db: AsyncIOMotorDatabase,
    name: str,
    exclude_id: Optional[str] = None
) -> None:
    """
    Check if name is unique among all records (including deleted).
    Returns different error messages based on isDelete/isActive state if duplicate found.
    """
    query = {
        "name": name
    }

    if exclude_id:
        from bson import ObjectId
        query["_id"] = {"$ne": ObjectId(exclude_id)}

    existing = await db[COLL].find_one(query)

    if existing:
        if existing.get("isDelete", False):
            # Deleted record exists
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists_deleted", field_names="name")
            )
        elif existing.get("isActive", True):
            # Active record exists
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists_active", field_names="name")
            )
        else:
            # Inactive record exists
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists_inactive", field_names="name")
            )


async def create_feedback_master(
    db: AsyncIOMotorDatabase,
    data: FeedbackMasterCreateSchema,
    created_by: str,
    created_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> FeedbackMasterResponseSchema:
    """
    Create a new FeedbackMaster record.

    Args:
        db: MongoDB database instance
        data: Validated create schema
        created_by: User ID from authenticated token
        created_ip: IP address of the request

    Returns:
        FeedbackMasterResponseSchema: The created record

    Raises:
        HTTPException: If validation fails or unique constraint violated
    """
    try:
        now = utc_now()

        doc = data.model_dump(mode="json", by_alias=False)

        # Check unique constraint for name among non-deleted records
        await _check_name_uniqueness(db, doc["name"])

        # Validate moduleId exists if provided
        if doc.get("moduleId"):
            try:
                await validate_foreign_key(
                    db, Collections.MODULES, "moduleId", doc["moduleId"], required=False
                )
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("Error validating moduleId")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("fk_not_found", field_name="moduleId", collection_name=Collections.MODULES)
                ) from e
            doc["moduleId"] = parse_object_id(doc["moduleId"])

        # Set audit fields
        doc["createdBy"] = parse_object_id(created_by)
        doc["createdAt"] = now
        doc["createdIp"] = created_ip
        doc["isActive"] = True
        doc["isDelete"] = False

        res = await db[COLL].insert_one(doc)
        created = await db[COLL].find_one({"_id": res.inserted_id})

        # Populate relations
        created = await _populate_relations(db, created)

        return _doc_to_response(created)

    except HTTPException:
        raise
    except DuplicateKeyError as exc:
        logger.error("Duplicate name on create: %s", doc.get("name"))
        await log_error(
            request=request,
            error_code=ErrorCodes.FEEDBACK_MASTER_CREATE_DUPLICATE_NAME,
            parameters={"name": doc.get("name")},
            actor_user_id=created_by
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name")
        ) from exc
    except ValueError as ve:
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="createdBy")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("create_feedback_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while creating feedback master"
        ) from exc


async def get_feedback_master_by_id(
    db: AsyncIOMotorDatabase,
    id_str: str
) -> Optional[FeedbackMasterResponseSchema]:
    """
    Get a FeedbackMaster by ID (excludes soft-deleted records).

    Args:
        id_str: The FeedbackMaster ID

    Returns:
        FeedbackMasterResponseSchema or None
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
        logger.exception("get_feedback_master_by_id failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while fetching feedback master"
        ) from exc


async def get_feedback_master_by_name(
    db: AsyncIOMotorDatabase,
    name: str
) -> Optional[FeedbackMasterResponseSchema]:
    """
    Get a FeedbackMaster by name (excludes soft-deleted records).

    Args:
        db: MongoDB database instance
        name: The FeedbackMaster name (case-insensitive)

    Returns:
        FeedbackMasterResponseSchema or None
    """
    try:
        if not name or not name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("required_field", field_name="name")
            )

        doc = await db[COLL].find_one({
            "name": {"$regex": f"^{name.strip()}$", "$options": "i"},
            "isDelete": {"$ne": True}
        })

        if doc:
            doc = await _populate_relations(db, doc)
            return _doc_to_response(doc)

        return None

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_feedback_master_by_name failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while fetching feedback master by name"
        ) from exc


async def update_feedback_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    patch: FeedbackMasterUpdateSchema,
    updated_ip: Optional[str] = None,
    request: Optional[Request] = None,
    updated_by: Optional[str] = None
) -> Optional[FeedbackMasterResponseSchema]:
    """
    Update a FeedbackMaster record.

    Args:
        db: MongoDB database instance
        id_str: The FeedbackMaster ID to update
        patch: Update schema

    Returns:
        Updated FeedbackMasterResponseSchema or None

    Raises:
        HTTPException: If validation fails or record not found
    """
    try:
        try:
            object_id = parse_object_id(id_str)
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="id")
            ) from ve

        # Check if record exists and is not deleted
        existing = await db[COLL].find_one({
            "_id": object_id,
            "isDelete": {"$ne": True}
        })
        if not existing:
            return None

        updates = patch.model_dump(exclude_unset=True, mode="json", by_alias=False)
        if not updates:
            doc = await _populate_relations(db, existing)
            return _doc_to_response(doc)

        # Check unique constraint for name if being updated
        if "name" in updates and updates["name"]:
            await _check_name_uniqueness(db, updates["name"], exclude_id=id_str)

        # Validate moduleId exists if provided
        if "moduleId" in updates and updates["moduleId"]:
            try:
                await validate_foreign_key(
                    db, Collections.MODULES, "moduleId", updates["moduleId"], required=False
                )
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("Error validating moduleId")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("fk_not_found", field_name="moduleId", collection_name=Collections.MODULES)
                ) from e
            updates["moduleId"] = parse_object_id(updates["moduleId"])

        # Set audit fields
        updates["updatedAt"] = utc_now()
        if updated_ip is not None:
            updates["updatedIp"] = updated_ip
        if updated_by:
            updates["updatedBy"] = parse_object_id(updated_by)

        await db[COLL].update_one({"_id": object_id}, {"$set": updates})

        updated = await db[COLL].find_one({"_id": object_id})
        updated = await _populate_relations(db, updated)

        return _doc_to_response(updated)

    except HTTPException:
        raise
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name")
        ) from exc
    except ValueError as ve:
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="updatedBy")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("update_feedback_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while updating feedback master"
        ) from exc


async def delete_feedback_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    deleted_by: Optional[str] = None,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a FeedbackMaster record.
    Sets isDelete=True, isActive=False.

    Args:
        db: MongoDB database instance
        id_str: The FeedbackMaster ID to delete
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
                error_code=ErrorCodes.FEEDBACK_MASTER_DELETE_ALREADY_DELETED,
                parameters={"id": id_str},
                actor_user_id=deleted_by
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("already_deleted")
            )

        update_data = {
            "isDelete": True,
            "updatedAt": utc_now(),
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
        logger.exception("delete_feedback_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while deleting feedback master"
        ) from exc


async def restore_feedback_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    restored_by: Optional[str] = None,
    restored_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> Optional[FeedbackMasterResponseSchema]:
    """
    Restore a soft-deleted FeedbackMaster record.
    Sets isDelete=False, isActive=True.

    Args:
        db: MongoDB database instance
        id_str: The FeedbackMaster ID to restore
        restored_by: User ID performing the restore
        restored_ip: IP address of the request
        request: FastAPI Request object for error logging

    Returns:
        Restored FeedbackMasterResponseSchema or None if not found
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
            return None

        # Check if actually deleted
        if not doc.get("isDelete", False):
            await log_error(
                request=request,
                error_code=ErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED,
                parameters={"id": id_str, "reason": "Record is not deleted"},
                actor_user_id=restored_by
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("not_deleted")
            )

        # Check name uniqueness before restore (among non-deleted records)
        name = doc.get("name")
        if name:
            existing_with_name = await db[COLL].find_one({
                "name": name,
                "isDelete": {"$ne": True},
                "_id": {"$ne": object_id}
            })
            if existing_with_name:
                await log_error(
                    request=request,
                    error_code=ErrorCodes.FEEDBACK_MASTER_UPDATE_DUPLICATE_NAME,
                    parameters={"id": id_str, "name": name},
                    actor_user_id=restored_by
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=get_validation_error("already_exists", field_names="name")
                )

        update_data = {
            "isDelete": False,
            "isActive": True,
            "updatedAt": utc_now(),
        }

        if restored_by:
            update_data["updatedBy"] = parse_object_id(restored_by)
        if restored_ip:
            update_data["updatedIp"] = restored_ip

        await db[COLL].update_one(
            {"_id": object_id},
            {"$set": update_data}
        )

        restored = await db[COLL].find_one({"_id": object_id})
        restored = await _populate_relations(db, restored)

        return _doc_to_response(restored)

    except HTTPException:
        raise
    except ValueError as ve:
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="restored_by")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("restore_feedback_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while restoring feedback master"
        ) from exc


async def list_feedback_masters(
    db: AsyncIOMotorDatabase,
    search: Optional[str] = None,
    include_deleted: bool = False,
    is_active: Optional[bool] = True,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> Tuple[List[FeedbackMasterResponseSchema], int]:
    """
    List FeedbackMasters with optional pagination and search.

    Args:
        db: MongoDB database instance
        search: Search term for name (case-insensitive regex)
        include_deleted: Whether to include soft-deleted records
        is_active: Filter by active status (True=active only, False=inactive only, None=all)
        page: Page number (1-indexed). If None, returns all records
        page_size: Number of records per page

    Returns:
        Tuple of (list of FeedbackMasterResponseSchema, total count)
    """
    try:
        # Build query
        query: Dict[str, Any] = {}

        # Filter by delete status
        if not include_deleted:
            query["isDelete"] = {"$ne": True}

        # Filter by active status (default: only active records)
        if is_active is not None:
            query["isActive"] = is_active

        if search:
            query["name"] = {"$regex": search, "$options": "i"}

        total = await db[COLL].count_documents(query)

        cursor = db[COLL].find(query).sort([("createdAt", DESCENDING)])

        # Apply pagination if requested
        if page is not None:
            effective_page_size = page_size if page_size is not None else 20
            offset = (page - 1) * effective_page_size
            cursor = cursor.skip(offset).limit(effective_page_size)

        docs = await cursor.to_list(length=None)

        # Populate relations and convert to response
        result = []
        for doc in docs:
            doc = await _populate_relations(db, doc)
            result.append(_doc_to_response(doc))

        return result, total

    except Exception as exc:
        logger.exception("list_feedback_masters failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while listing feedback masters"
        ) from exc
