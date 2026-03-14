"""
RankMaster Service
Business logic for RankMaster collection operations
"""
import logging
from typing import Optional, List, Tuple
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status, Request
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.utils.validators import validate_unique_constraint
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error

logger = logging.getLogger(__name__)


def convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    if not document:
        return document

    # Convert _id
    if "_id" in document:
        document["_id"] = str(document["_id"])

    # Convert ObjectId fields
    objectid_fields = ["createdBy", "updatedBy"]
    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    datetime_fields = ["createdAt", "updatedAt"]
    for field in datetime_fields:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    return document


async def create_rank(
    rank_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new rank record

    Args:
        rank_data: Rank data from schema
        current_user_id: ID of the user creating the record

    Returns:
        Created rank document

    Raises:
        HTTPException: If validation fails or creation error
    """
    db = get_database()

    # Validate unique constraint for name (check against all records including deleted)
    await validate_unique_constraint(
        db,
        Collections.RANK_MASTER,
        {"name": rank_data["name"]},
        exclude_id=None,
        include_deleted=True
    )

    # Validate unique constraint for cctnsRankCd
    if rank_data.get("cctnsRankCd") is not None:
        await validate_unique_constraint(
            db,
            Collections.RANK_MASTER,
            {"cctnsRankCd": rank_data["cctnsRankCd"]},
            exclude_id=None,
            include_deleted=True
        )

    # Prepare rank document
    rank_dict = {**rank_data}
    rank_dict.pop("createdBy", None)  # Remove deprecated field from payload
    rank_dict["createdAt"] = get_ist_now()
    rank_dict["isActive"] = True
    rank_dict["isDelete"] = False
    rank_dict["createdBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id

    # Insert into database
    try:
        result = await db[Collections.RANK_MASTER].insert_one(rank_dict)
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_CREATE_DUPLICATE_NAME,
            parameters={"name": rank_data.get("name"), "cctnsRankCd": rank_data.get("cctnsRankCd")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name, cctnsRankCd")
        )

    created_rank = await db[Collections.RANK_MASTER].find_one({"_id": result.inserted_id})

    return convert_objectid_to_str(created_rank)


async def get_rank(rank_id: str) -> Optional[dict]:
    """
    Get a rank by ID (includes soft-deleted records)

    Args:
        rank_id: The rank ID

    Returns:
        Rank document or None
    """
    db = get_database()

    if not ObjectId.is_valid(rank_id):
        return None

    rank = await db[Collections.RANK_MASTER].find_one({"_id": ObjectId(rank_id)})

    if rank:
        return convert_objectid_to_str(rank)

    return None


async def update_rank(
    rank_id: str,
    update_data: dict,
    current_user_id: str,
    request: Optional[Request] = None
) -> dict:
    """
    Update a rank record

    Args:
        rank_id: The rank ID to update
        update_data: Fields to update
        current_user_id: ID of the user performing update

    Returns:
        Updated rank document

    Raises:
        HTTPException: If validation fails or rank not found
    """
    db = get_database()

    if not ObjectId.is_valid(rank_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_FAILED,
            parameters={"rank_id": rank_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="rank_id")
        )

    object_id = ObjectId(rank_id)

    # Check if rank exists
    existing_rank = await db[Collections.RANK_MASTER].find_one({"_id": object_id, "isDelete": {"$ne": True}})
    if not existing_rank:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_NOT_FOUND,
            parameters={"rank_id": rank_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("rank_not_found")
        )

    # Filter out None values and prepare update
    filtered_update = {k: v for k, v in update_data.items() if v is not None}

    if not filtered_update:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_FAILED,
            parameters={"rank_id": rank_id, "reason": "No fields to update"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("no_fields_to_update")
        )

    # Validate unique constraint for name if it's being updated (check against all records including deleted)
    if "name" in filtered_update:
        await validate_unique_constraint(
            db,
            Collections.RANK_MASTER,
            {"name": filtered_update["name"]},
            exclude_id=rank_id,
            include_deleted=True
        )

    # Validate unique constraint for cctnsRankCd if it's being updated
    if "cctnsRankCd" in filtered_update:
        await validate_unique_constraint(
            db,
            Collections.RANK_MASTER,
            {"cctnsRankCd": filtered_update["cctnsRankCd"]},
            exclude_id=rank_id,
            include_deleted=True
        )

    # Set updatedBy and updatedAt
    filtered_update["updatedBy"] = ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id
    filtered_update["updatedAt"] = get_ist_now()

    # Update in database
    try:
        await db[Collections.RANK_MASTER].update_one({"_id": object_id}, {"$set": filtered_update})
    except DuplicateKeyError:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_DUPLICATE_NAME,
            parameters={"rank_id": rank_id, "name": filtered_update.get("name"), "cctnsRankCd": filtered_update.get("cctnsRankCd")},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names="name, cctnsRankCd")
        )

    updated_rank = await db[Collections.RANK_MASTER].find_one({"_id": object_id})

    return convert_objectid_to_str(updated_rank)


async def delete_rank(
    rank_id: str,
    current_user_id: str,
    deleted_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a rank record

    Args:
        rank_id: The rank ID to delete
        current_user_id: ID of the user performing delete
        deleted_ip: IP address of the request

    Returns:
        True if deleted successfully

    Raises:
        HTTPException: If rank not found
    """
    db = get_database()

    if not ObjectId.is_valid(rank_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_DELETE_FAILED,
            parameters={"rank_id": rank_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="rank_id")
        )

    object_id = ObjectId(rank_id)

    # Check if rank exists
    existing_rank = await db[Collections.RANK_MASTER].find_one({"_id": object_id, "isDelete": {"$ne": True}})
    if not existing_rank:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_DELETE_NOT_FOUND,
            parameters={"rank_id": rank_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("rank_not_found")
        )

    # Check if any personnel are using this rank (among non-deleted personnel)
    personnel_using_rank = await db[Collections.PERSONNEL_MASTER].find_one({
        "rankId": object_id,
        "isDelete": False
    })
    if personnel_using_rank:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_DELETE_IN_USE,
            parameters={"rank_id": rank_id, "reference": "personnel"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("rank_has_personnel")
        )

    # Soft delete
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }
    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    await db[Collections.RANK_MASTER].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def restore_rank(
    rank_id: str,
    current_user_id: str,
    restored_ip: Optional[str] = None,
    request: Optional[Request] = None
) -> bool:
    """
    Restore a soft-deleted rank record

    Args:
        rank_id: The rank ID to restore
        current_user_id: ID of the user performing restore
        restored_ip: IP address of the request

    Returns:
        True if restored successfully

    Raises:
        HTTPException: If rank not found or not deleted
    """
    db = get_database()

    if not ObjectId.is_valid(rank_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_RESTORE_FAILED,
            parameters={"rank_id": rank_id, "reason": "Invalid ObjectId format"},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="rank_id")
        )

    object_id = ObjectId(rank_id)

    # Check if rank exists (including soft-deleted)
    existing_rank = await db[Collections.RANK_MASTER].find_one({"_id": object_id})
    if not existing_rank:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_RESTORE_NOT_FOUND,
            parameters={"rank_id": rank_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("rank_not_found")
        )

    # Check if already active (handle both old isDeleted and new isDelete)
    is_deleted = existing_rank.get("isDelete", existing_rank.get("isDeleted", False))
    if not is_deleted:
        await log_error(
            request=request,
            error_code=ErrorCodes.RANK_RESTORE_ALREADY_ACTIVE,
            parameters={"rank_id": rank_id},
            actor_user_id=current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_business_error("already_active")
        )

    # Restore (set isDelete to False only - isActive should be managed separately)
    update_data = {
        "isDelete": False,
        "updatedBy": ObjectId(current_user_id) if ObjectId.is_valid(current_user_id) else current_user_id,
        "updatedAt": get_ist_now()
    }
    if restored_ip:
        update_data["updatedIp"] = restored_ip

    await db[Collections.RANK_MASTER].update_one(
        {"_id": object_id},
        {"$set": update_data}
    )

    return True


async def list_ranks(
    include_deleted: bool = False,
    search: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> Tuple[List[dict], int]:
    """
    List ranks with optional pagination and filters

    Args:
        include_deleted: Whether to include soft-deleted records
        search: Search term for name, cctnsRankCd, or shortCode
        page: Page number (optional)
        page_size: Items per page (optional)

    Returns:
        Tuple of (list of ranks, total count)
    """
    db = get_database()

    # Build query (handle both old isDeleted and new isDelete)
    query = {}
    if not include_deleted:
        query["$or"] = [
            {"isDelete": False},
            {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
        ]

    # Search across multiple fields
    if search:
        search_query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"shortCode": {"$regex": search, "$options": "i"}}
            ]
        }
        # Try to search by cctnsRankCd if search is numeric
        if search.isdigit():
            search_query["$or"].append({"cctnsRankCd": int(search)})

        if "$or" in query:
            query = {"$and": [query, search_query]}
        else:
            query.update(search_query)

    # Get total count
    total = await db[Collections.RANK_MASTER].count_documents(query)

    # Build cursor
    cursor = db[Collections.RANK_MASTER].find(query).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    ranks_list = await cursor.to_list(length=None)

    # Convert documents for JSON
    result_list = [convert_objectid_to_str(r) for r in ranks_list]

    return result_list, total
