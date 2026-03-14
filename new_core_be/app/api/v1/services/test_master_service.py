"""
TestMaster Service
Business logic for TestMaster collection operations.

- Create, Get, List, Update, Delete, Restore
- Has both isDelete and isActive
- name is required and unique (case-insensitive, including deleted records)
- questions array with unique questionId
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from bson import ObjectId

from app.constants.collections import Collections
from app.api.v1.schemas.test_master_schema import (
    TestMasterCreateSchema,
    TestMasterUpdateSchema,
    TestMasterResponseSchema,
    QuestionSchema,
)
from app.utils.time_utils import get_ist_now
from app.utils.mongo import parse_object_id
from app.utils.error_messages import get_validation_error, get_business_error

logger = logging.getLogger(__name__)

COLL = Collections.TEST_MASTER


async def _validate_module_id(db: AsyncIOMotorDatabase, module_id: str) -> None:
    """
    Validate moduleId exists in modules collection.
    """
    try:
        module_oid = parse_object_id(module_id)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="moduleId")
        ) from ve

    module = await db[Collections.MODULES].find_one({
        "_id": module_oid,
        "isDelete": {"$ne": True}
    })
    if not module:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Module with moduleId '{module_id}' not found"
        )


def _doc_to_response(doc: Dict[str, Any]) -> TestMasterResponseSchema:
    """Convert MongoDB document to response schema"""
    questions = []
    for q in doc.get("questions", []):
        questions.append(QuestionSchema(
            questionId=q.get("questionId", ""),
            question=q.get("question", ""),
            expectedAnswer=q.get("expectedAnswer", {})
        ))

    # Convert moduleId to string if it's an ObjectId
    module_id = doc.get("moduleId")
    if isinstance(module_id, ObjectId):
        module_id = str(module_id)

    return TestMasterResponseSchema(
        _id=str(doc["_id"]),
        moduleId=module_id,
        name=doc.get("name"),
        questions=questions,
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
        mod_id = doc["moduleId"] if isinstance(doc["moduleId"], ObjectId) else ObjectId(doc["moduleId"])
        mod = await db[Collections.MODULES].find_one({
            "_id": mod_id,
            "isDelete": {"$ne": True}
        })
        if mod:
            doc["module"] = {
                "_id": str(mod["_id"]),
                "name": mod.get("name"),
            }

    return doc


async def create_test_master(
    db: AsyncIOMotorDatabase,
    data: TestMasterCreateSchema,
    created_by: str,
    created_ip: Optional[str] = None
) -> TestMasterResponseSchema:
    """
    Create a new TestMaster record.

    Args:
        db: MongoDB database instance
        data: Validated create schema
        created_by: User ID from authenticated token
        created_ip: IP address of the request

    Returns:
        TestMasterResponseSchema: The created record

    Raises:
        HTTPException: If validation fails or name already exists
    """
    try:
        now = get_ist_now()

        # Validate moduleId FK
        await _validate_module_id(db, data.moduleId)

        # Check for duplicate name (case-insensitive, check all records including deleted)
        existing = await db[COLL].find_one({
            "name": {"$regex": f"^{data.name}$", "$options": "i"}
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"TestMaster with name '{data.name}' already exists"
            )

        doc = data.model_dump(mode="json", by_alias=False)

        # Convert moduleId to ObjectId for storage
        doc["moduleId"] = parse_object_id(data.moduleId)

        # Set audit fields
        doc["createdBy"] = parse_object_id(created_by)
        doc["createdAt"] = now
        doc["createdIp"] = created_ip
        doc["isDelete"] = False
        doc["isActive"] = True

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
        logger.exception("create_test_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while creating test master"
        ) from exc


async def update_test_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    data: TestMasterUpdateSchema,
    updated_by: str,
    updated_ip: Optional[str] = None
) -> TestMasterResponseSchema:
    """
    Update an existing TestMaster record.

    Args:
        db: MongoDB database instance
        id_str: The TestMaster ID to update
        data: Validated update schema
        updated_by: User ID from authenticated token
        updated_ip: IP address of the request

    Returns:
        TestMasterResponseSchema: The updated record

    Raises:
        HTTPException: If not found, already deleted, or name conflict
    """
    try:
        try:
            object_id = parse_object_id(id_str)
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="id")
            ) from ve

        # Check if exists and not soft-deleted
        existing = await db[COLL].find_one({
            "_id": object_id,
            "isDelete": {"$ne": True}
        })
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="TestMaster not found or already deleted"
            )

        # Build update data with only provided fields (PATCH behavior)
        update_data = data.model_dump(mode="json", by_alias=False, exclude_none=True)

        # Validate and convert moduleId if provided
        if data.moduleId is not None:
            await _validate_module_id(db, data.moduleId)
            update_data["moduleId"] = parse_object_id(data.moduleId)

        # Check for duplicate name if name is being updated
        if data.name is not None:
            name_exists = await db[COLL].find_one({
                "name": {"$regex": f"^{data.name}$", "$options": "i"},
                "_id": {"$ne": object_id}
            })
            if name_exists:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"TestMaster with name '{data.name}' already exists"
                )

        update_data["updatedBy"] = parse_object_id(updated_by)
        update_data["updatedAt"] = get_ist_now()
        update_data["updatedIp"] = updated_ip

        await db[COLL].update_one(
            {"_id": object_id},
            {"$set": update_data}
        )

        updated = await db[COLL].find_one({"_id": object_id})

        # Populate relations
        updated = await _populate_relations(db, updated)

        return _doc_to_response(updated)

    except HTTPException:
        raise
    except ValueError as ve:
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="updatedBy")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("update_test_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while updating test master"
        ) from exc


async def get_test_master_by_id(
    db: AsyncIOMotorDatabase,
    id_str: str
) -> Optional[TestMasterResponseSchema]:
    """
    Get a TestMaster by ID (excludes soft-deleted records).

    Args:
        db: MongoDB database instance
        id_str: The TestMaster ID

    Returns:
        TestMasterResponseSchema or None
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
        logger.exception("get_test_master_by_id failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while fetching test master"
        ) from exc


async def delete_test_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    deleted_by: Optional[str] = None,
    deleted_ip: Optional[str] = None,
) -> bool:
    """
    Soft delete a TestMaster record.
    Sets isDelete=True.

    Args:
        db: MongoDB database instance
        id_str: The TestMaster ID to delete
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
        logger.exception("delete_test_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while deleting test master"
        ) from exc


async def restore_test_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    restored_by: Optional[str] = None,
    restored_ip: Optional[str] = None,
) -> bool:
    """
    Restore a soft-deleted TestMaster record.
    Sets isDelete=False.

    Args:
        db: MongoDB database instance
        id_str: The TestMaster ID to restore
        restored_by: User ID performing the restore
        restored_ip: IP address of the request

    Returns:
        True if restored successfully, False if not found
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

        # Check if not deleted
        if not doc.get("isDelete", False):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("not_deleted")
            )

        update_data = {
            "isDelete": False,
            "updatedAt": get_ist_now(),
        }

        if restored_by:
            update_data["updatedBy"] = parse_object_id(restored_by)
        if restored_ip:
            update_data["updatedIp"] = restored_ip

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
                detail=get_validation_error("invalid_objectid", field_name="restored_by")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("restore_test_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while restoring test master"
        ) from exc


async def list_test_masters(
    db: AsyncIOMotorDatabase,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> Tuple[List[TestMasterResponseSchema], int]:
    """
    List TestMasters with optional pagination and filtering.

    Args:
        db: MongoDB database instance
        include_deleted: Whether to include soft-deleted records
        page: Page number (1-indexed). If None, returns all records
        page_size: Number of records per page

    Returns:
        Tuple of (list of TestMasterResponseSchema, total count)
    """
    try:
        # Build query
        query: Dict[str, Any] = {}

        # Filter by delete status
        if not include_deleted:
            query["isDelete"] = {"$ne": True}

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

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("list_test_masters failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while listing test masters"
        ) from exc
