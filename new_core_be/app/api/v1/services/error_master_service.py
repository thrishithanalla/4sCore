# app/services/error_master_service.py
"""
Error Master Service Layer.

This module provides the business logic and data access layer for the Error Master
collection in MongoDB. Error Masters define error codes, types, severities, and
associated metadata used throughout the application for standardized error handling.

Key Features:
    - CRUD operations for error master records
    - Normalization of errorType (title-case) and errorSeverity (UPPERCASE) via valueSets
    - Stores canonical STRINGS (HttpUrl → str via Pydantic JSON mode)
    - Enforces unique errorCode constraint
    - Soft delete pattern with isDelete flag
    - Full audit trail (createdBy, createdAt, createdIp, updatedBy, updatedAt, updatedIp)
    - Search and pagination support
    - Foreign key validation for moduleId

Error Types:
    - Business: Business logic errors (validation failures, rule violations)
    - System: System-level errors (database errors, service failures)
    - Integration: Third-party or external service integration errors

Error Severities:
    - LOW: Minor issues that don't affect core functionality
    - MEDIUM: Moderate issues requiring attention
    - HIGH: Critical issues requiring immediate attention
    - CRITICAL: Severe issues that may cause system failure

Usage:
    from app.api.v1.services.error_master_service import create_error_master, get_error_master_by_id

    # Create a new error master
    error_master = await create_error_master(
        db=db,
        data=ErrorMasterCreateSchema(
            errorCode="ERR.CORE.UNIT.CREATE.FAILED",
            errorType="Business",
            errorSeverity="HIGH",
            messages=[{"language": "en", "template": "Failed to create unit: {reason}"}]
        ),
        created_by=current_user.id,
        created_ip=client_ip
    )

    # Get error master by ID
    error_master = await get_error_master_by_id(db, "507f1f77bcf86cd799439011")
"""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from app.core.value_sets import normalize_code
from app.api.v1.schemas.error_master_schema import (ErrorMasterCreateSchema,
                                             ErrorMasterResponseSchema, ErrorMasterSearchOutSchema,
                                             ErrorMasterUpdateSchema, PageOut)
from app.utils.dt import utc_now
from app.utils.mongo import parse_object_id
from app.api.v1.utils.validators import validate_foreign_key
from app.utils.error_messages import get_validation_error, get_field_error
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.constants.collections import Collections

logger = logging.getLogger(__name__)

# Use centralized collection names
COLL = Collections.ERROR_MASTER
ERROR_LOG_COLL = Collections.ERROR_LOGS

# Map any uppercase/legacy to schema's title-cased literals
ERROR_TYPE_TO_TITLE = {
    "BUSINESS": "Business",
    "SYSTEM": "System",
    "INTEGRATION": "Integration",
    "Business": "Business",
    "System": "System",
    "Integration": "Integration",
}


async def ensure_error_master_indexes(db: AsyncIOMotorDatabase) -> None:
    """
    Create required indexes for the errorMaster collection.

    This function ensures optimal query performance by creating indexes on
    frequently queried fields. Should be called during application startup.

    Indexes created:
        - uniq_errorCode: Unique index on errorCode field for fast lookups
        - idx_errorSeverity: Index on errorSeverity for filtering

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.

    Returns:
        None

    Note:
        Silently logs warnings if index creation fails (e.g., if indexes already exist).
    """
    try:
        await db[COLL].create_index([("errorCode", ASCENDING)], name="uniq_errorCode", unique=True)
        await db[COLL].create_index([("errorSeverity", ASCENDING)], name="idx_errorSeverity")
    except Exception as exc:
        logger.warning("ensure_error_master_indexes failed: %s", exc, exc_info=True)

def _doc_to_out(doc: Dict[str, Any]) -> ErrorMasterResponseSchema:
    """
    Convert a MongoDB document to an ErrorMasterResponseSchema.

    This internal function transforms raw MongoDB documents into Pydantic
    response schemas, handling ObjectId to string conversion and field mapping.

    Args:
        doc: Raw MongoDB document dictionary containing error master data.

    Returns:
        ErrorMasterResponseSchema: Pydantic model with all fields properly formatted.

    Note:
        - Converts ObjectId fields (_id, moduleId, createdBy, updatedBy) to strings
        - Normalizes errorType to title-case using ERROR_TYPE_TO_TITLE mapping
        - Sets default values for optional fields (log=True, isActive=True, isDelete=False)
    """
    return ErrorMasterResponseSchema(
        id=str(doc["_id"]),
        errorCode=doc["errorCode"],
        errorType=ERROR_TYPE_TO_TITLE.get(doc.get("errorType"), doc.get("errorType")),
        errorSeverity=doc["errorSeverity"],
        log=doc.get("log", True),
        moduleId=str(doc["moduleId"]) if doc.get("moduleId") else None,
        businessArea=doc.get("businessArea"),
        technicalArea=doc.get("technicalArea"),
        tool=doc.get("tool"),
        partnerSystem=doc.get("partnerSystem"),
        thirdParty=doc.get("thirdParty"),
        sourceType=doc.get("sourceType"),
        sourceName=doc.get("sourceName"),
        appCode=doc.get("appCode"),
        notificationId=str(doc["notificationId"]) if doc.get("notificationId") else None,
        messages=doc.get("messages", []),
        devMessage=doc.get("devMessage"),
        helpLink=doc.get("helpLink"),
        videoLink=doc.get("videoLink"),
        # Audit fields (master table)
        isActive=doc.get("isActive", True),
        isDelete=doc.get("isDelete", False),
        createdBy=str(doc["createdBy"]) if doc.get("createdBy") else None,
        createdAt=doc.get("createdAt"),
        createdIp=doc.get("createdIp"),
        updatedAt=doc.get("updatedAt"),
        updatedBy=str(doc["updatedBy"]) if doc.get("updatedBy") else None,
        updatedIp=doc.get("updatedIp"),
    )


async def _normalize_value_sets(db: AsyncIOMotorDatabase, data: Dict[str, Any]) -> None:
    """
    Normalize enumeration fields using valueSets collection.

    This function validates and normalizes enum-like fields against the valueSets
    collection to ensure consistency across the application. It modifies the data
    dictionary in place.

    Args:
        db: AsyncIOMotorDatabase instance for valueSets lookup.
        data: Dictionary containing error master data to be normalized.
              Modified in place with normalized values.

    Normalized Fields:
        - errorType: Normalized to title-case (Business, System, Integration)
        - errorSeverity: Normalized to UPPERCASE (LOW, MEDIUM, HIGH, CRITICAL)

    Raises:
        ValueError: If the provided value is not valid in the valueSets collection.

    Example:
        data = {"errorType": "BUSINESS", "errorSeverity": "high"}
        await _normalize_value_sets(db, data)
        # data now contains: {"errorType": "Business", "errorSeverity": "HIGH"}
    """
    if "errorType" in data and data["errorType"] is not None:
        et = await normalize_code(db, "errorType", data["errorType"])
        data["errorType"] = ERROR_TYPE_TO_TITLE.get(et, et)

    if "errorSeverity" in data and data["errorSeverity"] is not None:
        es = await normalize_code(db, "errorSeverity", data["errorSeverity"])
        data["errorSeverity"] = es  # schema expects UPPERCASE literals

    if "sourceType" in data and data["sourceType"] is not None:
        data["sourceType"] = await normalize_code(db, "sourceType", data["sourceType"])


async def create_error_master(
    db: AsyncIOMotorDatabase,
    data: ErrorMasterCreateSchema,
    created_by: str,
    created_ip: Optional[str] = None
) -> ErrorMasterResponseSchema:
    """
    Create a new error master.

    Args:
        db: Mongo DB.
        data: Validated create schema.
        created_by: User ID from authenticated token.
        created_ip: IP address of the request.

    Returns:
        ErrorMasterResponseSchema: The created record.

    Raises:
        HTTPException: If validation fails (400/404) or unique errorCode is violated (409).
        ValueError: If valueSets validation fails.
    """
    try:
        now = utc_now()

        doc = data.model_dump(mode="json", by_alias=False)
        await _normalize_value_sets(db, doc)

        # Validate moduleId exists if provided
        if doc.get("moduleId"):
            try:
                await validate_foreign_key(
                    db, Collections.MODULES, "moduleId", doc["moduleId"], required=False
                )
            except HTTPException:
                raise  # Re-raise HTTPException from validator
            except Exception as e:
                logger.exception("Error validating moduleId")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("fk_not_found", field_name="moduleId", collection_name=Collections.MODULES)
                ) from e
            doc["moduleId"] = parse_object_id(doc["moduleId"])

        # Convert notificationId to ObjectId if provided (no FK validation)
        if doc.get("notificationId"):
            doc["notificationId"] = parse_object_id(doc["notificationId"])

        # Set audit fields from authenticated user context
        try:
            doc["createdBy"] = parse_object_id(created_by)
        except ValueError:
            doc["createdBy"] = created_by  # allow plain string (e.g. "system")
        doc["createdAt"] = now
        doc["createdIp"] = created_ip
        # Master table audit fields
        doc["isActive"] = True
        doc["isDelete"] = False
        # Enforce: log must be True when isActive is True
        if doc.get("isActive"):
            doc["log"] = True

        res = await db[COLL].insert_one(doc)
        created = await db[COLL].find_one({"_id": res.inserted_id})
        return _doc_to_out(created)
    except HTTPException:
        raise  # Re-raise HTTPException
    except DuplicateKeyError as exc:
        logger.error("Duplicate errorCode on create: %s", doc.get("errorCode"))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_field_error("error_code_exists")
        ) from exc
    except ValueError as ve:
        # Check if it's ObjectId validation error
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="createdBy")
            ) from ve
        raise  # Re-raise other ValueError (e.g., from valueSets)
    except Exception as exc:
        logger.exception("create_error_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while creating error master"
        ) from exc


async def get_error_master_by_id(
    db: AsyncIOMotorDatabase, id_str: str
) -> Optional[ErrorMasterResponseSchema]:
    """
    Retrieve a single error master record by its MongoDB ObjectId.

    This function fetches an error master document from the database,
    excluding soft-deleted records (isDelete=True).

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        id_str: MongoDB ObjectId as a hex string (24 characters).

    Returns:
        ErrorMasterResponseSchema: The error master record if found.
        None: If no matching record exists or it has been soft-deleted.

    Raises:
        HTTPException(400): If id_str is not a valid ObjectId format.
        HTTPException(500): If an unexpected database error occurs.

    Example:
        error_master = await get_error_master_by_id(db, "507f1f77bcf86cd799439011")
        if error_master:
            print(f"Found: {error_master.errorCode}")
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

        return _doc_to_out(doc) if doc else None
    except HTTPException:
        raise  # Re-raise HTTPException
    except Exception as exc:
        logger.exception("get_error_master_by_id failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while fetching error master"
        ) from exc


async def get_error_master_by_code(
    db: AsyncIOMotorDatabase, error_code: str
) -> Optional[ErrorMasterResponseSchema]:
    """
    Retrieve a single error master record by its unique error code.

    This function fetches an error master document using the errorCode field,
    which has a unique constraint. Excludes soft-deleted records.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        error_code: The unique error code string (e.g., "ERR.CORE.UNIT.CREATE.FAILED").

    Returns:
        ErrorMasterResponseSchema: The error master record if found.
        None: If no matching record exists or it has been soft-deleted.

    Raises:
        Exception: If an unexpected database error occurs (logged and re-raised).

    Example:
        error_master = await get_error_master_by_code(db, "ERR.CORE.UNIT.CREATE.FAILED")
        if error_master:
            print(f"Severity: {error_master.errorSeverity}")
    """
    try:
        # doc = await db[COLL].find_one({"errorCode": error_code})
        doc = await db[COLL].find_one({
    "errorCode": error_code,
    "isDelete": {"$ne": True}
})

        return _doc_to_out(doc) if doc else None
    except Exception:
        logger.exception("get_error_master_by_code failed")
        raise


async def update_error_master(
    db: AsyncIOMotorDatabase, id_str: str, patch: ErrorMasterUpdateSchema, updated_by: str, updated_ip: Optional[str] = None
) -> Optional[ErrorMasterResponseSchema]:
    """
    Update an existing error master record with partial data.

    This function performs a partial update (PATCH) on an error master document.
    Only the fields provided in the patch schema are updated. The errorCode field
    is immutable and cannot be changed after creation.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        id_str: MongoDB ObjectId as a hex string identifying the record to update.
        patch: ErrorMasterUpdateSchema containing the fields to update.
        updated_by: User ID who is updating the record (from authenticated token).
        updated_ip: IP address of the client making the update (optional).

    Returns:
        ErrorMasterResponseSchema: The updated error master record.
        None: If no matching record exists.

    Raises:
        HTTPException(400): If id_str is invalid, updatedBy is missing, or
                           moduleId/updatedBy validation fails.
        HTTPException(409): If the update would violate the unique errorCode constraint.
        HTTPException(500): If an unexpected database error occurs.

    Validations Performed:
        - ObjectId format for id_str, moduleId, and updatedBy
        - Foreign key existence for moduleId (modules collection)
        - Foreign key existence for updatedBy (personnel_master collection)
        - ValueSets normalization for errorType and errorSeverity

    Example:
        updated = await update_error_master(
            db=db,
            id_str="507f1f77bcf86cd799439011",
            patch=ErrorMasterUpdateSchema(errorSeverity="CRITICAL"),
            updated_by=current_user.id
        )
    """
    try:
        updates = patch.model_dump(exclude_unset=True, mode="json", by_alias=False)
        if not updates:
            return await get_error_master_by_id(db, id_str)

        await _normalize_value_sets(db, updates)

        # Skip updatedBy validation if not provided (e.g., auth disabled)
        if not updated_by:
            updated_by = "system"

        # Validate moduleId exists if provided
        if "moduleId" in updates and updates["moduleId"]:
            try:
                await validate_foreign_key(
                    db, Collections.MODULES, "moduleId", updates["moduleId"], required=False
                )
            except HTTPException:
                raise  # Re-raise HTTPException from validator
            except Exception as e:
                logger.exception("Error validating moduleId")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("fk_not_found", field_name="moduleId", collection_name=Collections.MODULES)
                ) from e
            updates["moduleId"] = parse_object_id(updates["moduleId"])

        # Convert notificationId to ObjectId if provided
        if "notificationId" in updates and updates["notificationId"]:
            updates["notificationId"] = parse_object_id(updates["notificationId"])

        # Validate updatedBy personnel exists (skip for "system")
        if updated_by and updated_by != "system":
            try:
                await validate_foreign_key(
                    db, Collections.PERSONNEL_MASTER, "updatedBy", updated_by, required=True
                )
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("Error validating updatedBy personnel")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("fk_not_found", field_name="updatedBy", collection_name=Collections.PERSONNEL_MASTER)
                ) from e

        # Audit fields
        updates["updatedAt"] = utc_now()
        try:
            updates["updatedBy"] = parse_object_id(updated_by)
        except ValueError:
            updates["updatedBy"] = updated_by
        if updated_ip is not None:
            updates["updatedIp"] = updated_ip

        # Sync log with isActive: inactive records must have log=false
        if "isActive" in updates:
            if updates["isActive"] is False:
                updates["log"] = False
            elif updates["isActive"] is True and "log" not in updates:
                updates["log"] = True

        # Validate id_str is valid ObjectId
        try:
            object_id = parse_object_id(id_str)
        except ValueError as ve:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="id")
            ) from ve

        updated = await db[COLL].find_one_and_update(
            {"_id": object_id},
            {"$set": updates},
            return_document=ReturnDocument.AFTER,
        )
        return _doc_to_out(updated) if updated else None

    except HTTPException:
        raise  # Re-raise HTTPException
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="errorCode")
        ) from exc
    except ValueError as ve:
        # Check if it's ObjectId validation error
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="updatedBy")
            ) from ve
        raise  # Re-raise other ValueError
    except Exception as exc:
        logger.exception("update_error_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while updating error master"
        ) from exc


async def delete_error_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    deleted_by: Optional[str] = None,
    deleted_ip: Optional[str] = None,
) -> bool:
    """
    Soft delete an error master record.

    This function performs a soft delete by setting isDelete=True rather than
    removing the document from the database. This preserves the audit trail
    and allows for potential restoration.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        id_str: MongoDB ObjectId as a hex string identifying the record to delete.
        deleted_by: User ID (ObjectId hex string) who performed the deletion.
                   Used for audit trail (stored in updatedBy).
        deleted_ip: IP address of the client making the delete request.
                   Used for audit trail (stored in updatedIp).

    Returns:
        bool: True if the record was successfully soft-deleted.
              False if no matching record was found.

    Raises:
        HTTPException(400): If id_str or deleted_by is not a valid ObjectId format.
        HTTPException(500): If an unexpected database error occurs.

    Side Effects:
        - Sets isDelete=True on the document
        - Updates updatedAt with current timestamp
        - Updates updatedBy with deleted_by value
        - Updates updatedIp with deleted_ip value

    Note:
        This function never performs hard deletes. Records remain in the database
        and can be restored using restore_error_master().

    Example:
        success = await delete_error_master(
            db=db,
            id_str="507f1f77bcf86cd799439011",
            deleted_by=current_user.id,
            deleted_ip=client_ip
        )
        if success:
            print("Record soft-deleted successfully")
    """
    try:
        # Validate id_str is valid ObjectId
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

        update_data = {
            "isDelete": True,
            "updatedAt": utc_now(),
        }

        if deleted_by:
            try:
                update_data["updatedBy"] = parse_object_id(deleted_by)
            except ValueError:
                update_data["updatedBy"] = deleted_by
        if deleted_ip:
            update_data["updatedIp"] = deleted_ip

        res = await db[COLL].update_one(
            {"_id": doc["_id"]},
            {"$set": update_data}
        )

        return res.modified_count == 1

    except HTTPException:
        raise  # Re-raise HTTPException
    except ValueError as ve:
        # Check if it's ObjectId validation error
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="deleted_by")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("delete_error_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while deleting error master"
        ) from exc


async def restore_error_master(
    db: AsyncIOMotorDatabase,
    id_str: str,
    restored_by: Optional[str] = None,
    restored_ip: Optional[str] = None,
) -> bool:
    """
    Restore a previously soft-deleted error master record.

    This function reverses a soft delete by setting isDelete=False, making
    the record visible again in normal queries.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        id_str: MongoDB ObjectId as a hex string identifying the record to restore.
        restored_by: User ID (ObjectId hex string) who performed the restoration.
                    Used for audit trail (stored in updatedBy).
        restored_ip: IP address of the client making the restore request.
                    Used for audit trail (stored in updatedIp).

    Returns:
        bool: True if the record was successfully restored.
              False if no matching record was found or it was not deleted.

    Raises:
        HTTPException(400): If id_str or restored_by is not a valid ObjectId format.
        HTTPException(500): If an unexpected database error occurs.

    Side Effects:
        - Sets isDelete=False on the document
        - Updates updatedAt with current timestamp
        - Updates updatedBy with restored_by value
        - Updates updatedIp with restored_ip value

    Note:
        Returns False without error if the record is already active (not deleted).
        The isActive field is NOT automatically restored - it should be managed
        separately if needed.

    Example:
        success = await restore_error_master(
            db=db,
            id_str="507f1f77bcf86cd799439011",
            restored_by=current_user.id,
            restored_ip=client_ip
        )
        if success:
            print("Record restored successfully")
    """
    try:
        # Validate id_str is valid ObjectId
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

        if not doc.get("isDelete", False):
            # Already active
            return False

        # Restore (set isDelete to False only - isActive should be managed separately)
        update_data = {
            "isDelete": False,
            "updatedAt": utc_now(),
        }

        if restored_by:
            try:
                update_data["updatedBy"] = parse_object_id(restored_by)
            except ValueError:
                update_data["updatedBy"] = restored_by
        if restored_ip:
            update_data["updatedIp"] = restored_ip

        res = await db[COLL].update_one(
            {"_id": doc["_id"]},
            {"$set": update_data}
        )

        return res.modified_count == 1

    except HTTPException:
        raise  # Re-raise HTTPException
    except ValueError as ve:
        if "ObjectId" in str(ve) or "must be a valid ObjectId" in str(ve):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="restored_by")
            ) from ve
        raise
    except Exception as exc:
        logger.exception("restore_error_master failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error while restoring error master"
        ) from exc


# async def search_error_masters(
#     db: AsyncIOMotorDatabase,
#     q: Optional[str],
#     severity: Optional[str],
#     err_type: Optional[str],
#     created_from: Optional[Any],
#     created_to: Optional[Any],
#     limit: int,
#     offset: int,
# ) -> Tuple[List[ErrorMasterOutSchema], int]:
#     """Search with filters and pagination. Sorted by createdAt desc."""
#     try:
#         # Base filter: exclude soft-deleted
#         filt: Dict[str, Any] = {"isDelete": {"$ne": True}}

#         if q:
#             filt["errorCode"] = {"$regex": q, "$options": "i"}

#         if severity:
#             filt["errorSeverity"] = severity

#         if err_type:
#             # Allow uppercase or title-case; normalize to stored form
#             filt["errorType"] = ERROR_TYPE_TO_TITLE.get(err_type, err_type)

#         if created_from or created_to:
#             rng: Dict[str, Any] = {}
#             if created_from:
#                 rng["$gte"] = created_from
#             if created_to:
#                 rng["$lte"] = created_to
#             filt["createdAt"] = rng

#         total = await db[COLL].count_documents(filt)

#         cursor = (
#             db[COLL]
#             .find(filt)
#             .sort([("createdAt", DESCENDING)])
#             .skip(offset)
#             .limit(limit)
#         )

#         docs = [_doc_to_out(d) async for d in cursor]
#         return docs, total

#     except Exception:
#         logger.exception("search_error_masters failed")
#         raise
async def search_error_masters(
    db: AsyncIOMotorDatabase,
    q: Optional[str],
    module_id: Optional[str],
    severity: Optional[str],
    err_type: Optional[str],
    created_from: Optional[Any],
    created_to: Optional[Any],
    limit: Optional[int],
    offset: int,
    source_type: Optional[str] = None,
    app_code: Optional[str] = None,
    business_area: Optional[str] = None,
    technical_area: Optional[str] = None,
    partner_system: Optional[str] = None,
    third_party: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Tuple[List[ErrorMasterResponseSchema], int]:
    """
    Search error masters with filters and optional pagination.

    This function provides flexible search capabilities for error masters,
    supporting text search on errorCode, filtering by module, severity/type, and
    date range filtering. Results are sorted by createdAt in descending order.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        q: Optional search query for errorCode (case-insensitive regex match).
           Supports partial/prefix search (e.g., 'ERR.ICP' finds all codes starting with that prefix).
        module_id: Optional filter by module ID (FK: modules._id).
        severity: Optional filter for errorSeverity (LOW, MEDIUM, HIGH, CRITICAL).
        err_type: Optional filter for errorType (Business, System, Integration).
                 Accepts both uppercase and title-case values.
        created_from: Optional start date for createdAt range filter.
        created_to: Optional end date for createdAt range filter.
        limit: Maximum number of records to return. If None, returns all matches.
        offset: Number of records to skip (for pagination).

    Returns:
        Tuple containing:
            - List[ErrorMasterResponseSchema]: List of matching error masters.
            - int: Total count of matching records (before pagination).

    Raises:
        Exception: If an unexpected database error occurs (logged and re-raised).

    Note:
        - Soft-deleted records (isDelete=True) are automatically excluded.
        - Date filters use $gte and $lte for inclusive range matching.

    Example:
        results, total = await search_error_masters(
            db=db,
            q="ERR.ICP",
            module_id="507f1f77bcf86cd799439011",
            severity="HIGH",
            err_type=None,
            created_from=None,
            created_to=None,
            limit=10,
            offset=0
        )
        print(f"Found {total} records, returning {len(results)}")
    """
    try:
        # Base filter: exclude soft-deleted
        filt: Dict[str, Any] = {"isDelete": {"$ne": True}}

        if q:
            filt["errorCode"] = {"$regex": q, "$options": "i"}

        if module_id:
            # Validate and convert moduleId to ObjectId
            try:
                filt["moduleId"] = parse_object_id(module_id)
            except ValueError:
                # Invalid ObjectId - return empty result
                return [], 0

        if severity:
            filt["errorSeverity"] = severity

        if err_type:
            # Allow uppercase or title-case; normalize to stored form
            filt["errorType"] = ERROR_TYPE_TO_TITLE.get(err_type, err_type)

        if source_type:
            filt["sourceType"] = source_type

        if app_code:
            filt["appCode"] = app_code

        if business_area:
            filt["businessArea"] = {"$regex": business_area, "$options": "i"}

        if technical_area:
            filt["technicalArea"] = {"$regex": technical_area, "$options": "i"}

        if partner_system:
            filt["partnerSystem"] = {"$regex": partner_system, "$options": "i"}

        if third_party:
            filt["thirdParty"] = {"$regex": third_party, "$options": "i"}

        if is_active is not None:
            filt["isActive"] = is_active

        if created_from or created_to:
            rng: Dict[str, Any] = {}
            if created_from:
                rng["$gte"] = created_from
            if created_to:
                rng["$lte"] = created_to
            filt["createdAt"] = rng

        total = await db[COLL].count_documents(filt)

        cursor = (
            db[COLL]
            .find(filt)
            .sort([("createdAt", DESCENDING)])
            .skip(offset)
        )

        # Apply limit only if provided
        if limit is not None:
            cursor = cursor.limit(limit)

        docs = [_doc_to_out(d) async for d in cursor]
        return docs, total

    except Exception:
        logger.exception("search_error_masters failed")
        raise


from typing import Any, Dict, List, Optional

from pymongo import DESCENDING



# async def list_error_masters_all(
#     db: AsyncIOMotorDatabase,
#     q: Optional[str] = None,
#     severity: Optional[str] = None,
#     err_type: Optional[str] = None,
#     created_from: Optional[Any] = None,
#     created_to: Optional[Any] = None,
#     hard_cap: int = 5000,
# ) -> Tuple[List[ErrorMasterOutSchema], int]:
#     """
#     Return ALL matching error masters (up to hard_cap) + total count.
#     Sorted by createdAt desc.
#     """
#     filt: Dict[str, Any] = {}
#     if q:
#         filt["errorCode"] = {"$regex": q, "$options": "i"}
#     if severity:
#         filt["errorSeverity"] = severity
#     if err_type:
#         filt["errorType"] = ERROR_TYPE_TO_TITLE.get(err_type, err_type)
#     if created_from or created_to:
#         rng: Dict[str, Any] = {}
#         if created_from:
#             rng["$gte"] = created_from
#         if created_to:
#             rng["$lte"] = created_to
#         filt["createdAt"] = rng

#     total = await db[COLL].count_documents(filt)
#     cursor = (
#         db[COLL]
#         .find(filt)
#         .sort([("createdAt", DESCENDING)])
#         .limit(hard_cap)
#     )
#     items = [_doc_to_out(d) async for d in cursor]
#     return items, total

async def list_error_masters_all(
    db: AsyncIOMotorDatabase,
    q: Optional[str] = None,
    severity: Optional[str] = None,
    err_type: Optional[str] = None,
    created_from: Optional[Any] = None,
    created_to: Optional[Any] = None,
    hard_cap: int = 5000,
) -> Tuple[List[ErrorMasterResponseSchema], int]:
    """
    List all matching error masters without pagination (up to hard_cap).

    This function returns all error masters matching the provided filters,
    useful for export operations or dropdowns where all records are needed.
    A hard cap prevents memory issues with very large result sets.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        q: Optional search query for errorCode (case-insensitive regex match).
        severity: Optional filter for errorSeverity.
        err_type: Optional filter for errorType.
        created_from: Optional start date for createdAt range filter.
        created_to: Optional end date for createdAt range filter.
        hard_cap: Maximum number of records to return (default: 5000).
                 Acts as a safety limit to prevent memory exhaustion.

    Returns:
        Tuple containing:
            - List[ErrorMasterResponseSchema]: List of all matching error masters (up to hard_cap).
            - int: Total count of matching records (may exceed hard_cap).

    Note:
        - Soft-deleted records (isDelete=True) are automatically excluded.
        - Results are sorted by createdAt descending.
        - If total exceeds hard_cap, only hard_cap records are returned but
          the total count reflects the actual matching record count.

    Example:
        all_errors, total = await list_error_masters_all(db, severity="HIGH")
        print(f"Retrieved {len(all_errors)} of {total} HIGH severity errors")
    """
    filt: Dict[str, Any] = {"isDelete": {"$ne": True}}

    if q:
        filt["errorCode"] = {"$regex": q, "$options": "i"}

    if severity:
        filt["errorSeverity"] = severity

    if err_type:
        filt["errorType"] = ERROR_TYPE_TO_TITLE.get(err_type, err_type)

    if created_from or created_to:
        rng: Dict[str, Any] = {}
        if created_from:
            rng["$gte"] = created_from
        if created_to:
            rng["$lte"] = created_to
        filt["createdAt"] = rng

    total = await db[COLL].count_documents(filt)

    cursor = (
        db[COLL]
        .find(filt)
        .sort([("createdAt", DESCENDING)])
        .limit(hard_cap)
    )

    items = [_doc_to_out(d) async for d in cursor]
    return items, total


async def _search_impl(
    db: AsyncIOMotorDatabase,
    q: Optional[str],
    error_severity: Optional[str],
    error_type: Optional[str],
    created_from: Optional[datetime],
    created_to: Optional[datetime],
    limit: int,
    offset: int,
) -> ErrorMasterSearchOutSchema:
    """
    Internal implementation for search endpoint response formatting.

    This is a wrapper function that calls search_error_masters and formats
    the response into the ErrorMasterSearchOutSchema with pagination metadata.
    Used internally by the router layer.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        q: Optional search query for errorCode.
        error_severity: Optional filter for errorSeverity.
        error_type: Optional filter for errorType.
        created_from: Optional start date for createdAt range filter.
        created_to: Optional end date for createdAt range filter.
        limit: Maximum number of records to return per page.
        offset: Number of records to skip.

    Returns:
        ErrorMasterSearchOutSchema: Search results with pagination info containing:
            - data: List of matching error masters
            - page: PageOut with total, limit, and offset

    Raises:
        HTTPException(500): If an unexpected error occurs during search.
    """
    try:
        data, total = await search_error_masters(
            db=db,
            q=q,
            severity=error_severity,
            err_type=error_type,
            created_from=created_from,
            created_to=created_to,
            limit=limit,
            offset=offset,
        )
        return ErrorMasterSearchOutSchema(
            data=data,
            page=PageOut(totalItems=total, limit=limit, offset=offset),
        )
    except Exception:
        # logger.exception("error masters search failed")
        raise HTTPException(status_code=500, detail="Internal server error")
