"""
TestExecution Service
Business logic for TestExecution collection operations.

- Create, Get, List, Delete (NO Update)
- Has both isDelete and isActive
- testMasterId is FK to TestMaster._id
- result enum: PASS/FAIL
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
from app.api.v1.schemas.test_execution_schema import (
    TestExecutionCreateSchema,
    TestExecutionResponseSchema,
    AnswerSchema,
)
from app.utils.time_utils import get_ist_now
from app.utils.mongo import parse_object_id
from app.utils.error_messages import get_validation_error, get_business_error

logger = logging.getLogger(__name__)

COLL = Collections.TEST_EXECUTION


def _doc_to_response(doc: Dict[str, Any]) -> TestExecutionResponseSchema:
    """Convert MongoDB document to response schema"""
    answers = []
    for a in doc.get("answers", []):
        answers.append(AnswerSchema(
            questionId=a.get("questionId", ""),
            actualAnswer=a.get("actualAnswer", {})
        ))

    return TestExecutionResponseSchema(
        _id=str(doc["_id"]),
        testMasterId=str(doc["testMasterId"]) if doc.get("testMasterId") else None,
        answers=answers,
        result=doc.get("result"),
        isActive=doc.get("isActive", True),
        isDelete=doc.get("isDelete", False),
        createdBy=str(doc["createdBy"]) if doc.get("createdBy") else None,
        createdAt=doc.get("createdAt"),
        createdIp=doc.get("createdIp"),
        updatedBy=str(doc["updatedBy"]) if doc.get("updatedBy") else None,
        updatedAt=doc.get("updatedAt"),
        updatedIp=doc.get("updatedIp"),
        testMaster=doc.get("testMaster"),
    )


async def _populate_relations(db: AsyncIOMotorDatabase, doc: Dict[str, Any]) -> Dict[str, Any]:
    """Populate foreign key relations with actual data"""
    if not doc:
        return doc

    # Populate testMaster
    if doc.get("testMasterId"):
        tm_id = doc["testMasterId"] if isinstance(doc["testMasterId"], ObjectId) else ObjectId(doc["testMasterId"])
        tm = await db[Collections.TEST_MASTER].find_one({
            "_id": tm_id,
            "isDelete": {"$ne": True}
        })
        if tm:
            doc["testMaster"] = {
                "_id": str(tm["_id"]),
                "name": tm.get("name"),
            }

    return doc


async def create_test_execution(
    db: AsyncIOMotorDatabase,
    data: TestExecutionCreateSchema,
    created_by: str,
    created_ip: Optional[str] = None
) -> TestExecutionResponseSchema:
    """
    Create a new TestExecution record.

    Args:
        db: MongoDB database instance
        data: Validated create schema
        created_by: User ID from authenticated token
        created_ip: IP address of the request

    Returns:
        TestExecutionResponseSchema: The created record

    Raises:
        HTTPException: If validation fails or TestMaster not found
    """
    try:
        now = get_ist_now()

        doc = data.model_dump(mode="json", by_alias=False)

        # Convert testMasterId to ObjectId and validate FK
        try:
            test_master_oid = parse_object_id(doc["testMasterId"])
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="testMasterId")
            ) from ve

        # Check if TestMaster exists
        test_master = await db[Collections.TEST_MASTER].find_one({
            "_id": test_master_oid,
            "isDelete": {"$ne": True}
        })
        if not test_master:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TestMaster not found or deleted"
            )

        doc["testMasterId"] = test_master_oid

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
        logger.exception("create_test_execution failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while creating test execution"
        ) from exc


async def get_test_execution_by_id(
    db: AsyncIOMotorDatabase,
    id_str: str
) -> Optional[TestExecutionResponseSchema]:
    """
    Get a TestExecution by ID (excludes soft-deleted records).

    Args:
        db: MongoDB database instance
        id_str: The TestExecution ID

    Returns:
        TestExecutionResponseSchema or None
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
        logger.exception("get_test_execution_by_id failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while fetching test execution"
        ) from exc


async def delete_test_execution(
    db: AsyncIOMotorDatabase,
    id_str: str,
    deleted_by: Optional[str] = None,
    deleted_ip: Optional[str] = None,
) -> bool:
    """
    Soft delete a TestExecution record.
    Sets isDelete=True.

    Args:
        db: MongoDB database instance
        id_str: The TestExecution ID to delete
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
        logger.exception("delete_test_execution failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while deleting test execution"
        ) from exc


async def list_test_executions(
    db: AsyncIOMotorDatabase,
    test_master_id: Optional[str] = None,
    result: Optional[str] = None,
    include_deleted: bool = False,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
) -> Tuple[List[TestExecutionResponseSchema], int]:
    """
    List TestExecutions with optional pagination and filtering.

    Args:
        db: MongoDB database instance
        test_master_id: Filter by TestMaster ID
        result: Filter by result (PASS/FAIL)
        include_deleted: Whether to include soft-deleted records
        page: Page number (1-indexed). If None, returns all records
        page_size: Number of records per page

    Returns:
        Tuple of (list of TestExecutionResponseSchema, total count)
    """
    try:
        # Build query
        query: Dict[str, Any] = {}

        # Filter by delete status
        if not include_deleted:
            query["isDelete"] = {"$ne": True}

        if test_master_id:
            try:
                query["testMasterId"] = parse_object_id(test_master_id)
            except ValueError as ve:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="testMasterId")
                ) from ve

        if result:
            query["result"] = result

        total = await db[COLL].count_documents(query)

        cursor = db[COLL].find(query).sort([("createdAt", DESCENDING)])

        # Apply pagination if requested
        if page is not None:
            effective_page_size = page_size if page_size is not None else 20
            offset = (page - 1) * effective_page_size
            cursor = cursor.skip(offset).limit(effective_page_size)

        docs = await cursor.to_list(length=None)

        # Populate relations and convert to response
        result_list = []
        for doc in docs:
            doc = await _populate_relations(db, doc)
            result_list.append(_doc_to_response(doc))

        return result_list, total

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("list_test_executions failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while listing test executions"
        ) from exc
