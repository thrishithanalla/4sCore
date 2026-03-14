"""
Approval Flow Master Router.

This module provides FastAPI endpoints for managing approval flow master records.
Approval flow masters define templates for hierarchical approval workflows,
specifying the sequence of approvers, approval units, ranks, and conditions.

An approval flow master is a blueprint that gets instantiated as an approval chain
when a user submits a request requiring approval. Each flow defines:
    - The module/feature this flow applies to
    - Final approval unit and rank requirements
    - District-specific configuration (optional)
    - Further processing steps after approval

Key Features:
    - Full CRUD operations for approval flow masters
    - RBAC permission checking for all operations
    - Soft delete and restore functionality
    - Foreign key validation (module, unit, rank, personnel)
    - Pagination and filtering support
    - Population of nested objects via aggregation
    - Transaction logging and error logging
    - IP tracking for audit trail

Endpoints:
    POST /create - Create a new approval flow master
    GET /list - List all approval flow masters with filters
    GET /get/{flow_id} - Get approval flow master by ID
    GET /get/by-module/{module_id} - Get flows by module ID
    PATCH /update/{flow_id} - Update an approval flow master
    DELETE /delete/{flow_id} - Soft delete an approval flow master
    PATCH /restore/{flow_id} - Restore a deleted approval flow master

Collections Used:
    - approval_flow_master: Primary collection
    - modules: For module lookup
    - unit: For unit lookups
    - rank_master: For rank lookup
    - district: For district lookup
    - personnel_master: For targetUserId in furtherProcess

Usage:
    from app.api.v1.routers.approval_flow_master import router

    app.include_router(router)

See Also:
    - ApprovalFlowMasterRepository: Data access layer
    - ApprovalFlowMasterSchema: Request/response schemas
    - ApprovalChainRouter: For instantiated approval workflows
"""
import logging
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.v1.dependencies.auth import get_current_user
from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.approval_flow_master_schema import (
    ApprovalFlowMasterCreateSchema,
    ApprovalFlowMasterResponseSchema,
    ApprovalFlowMasterUpdateSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error, get_success_message
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.jobs import Jobs
from app.constants.collections import Collections
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ModulePrefixes
from app.constants.error_codes import ErrorCodes
from app.constants.log_codes import LogCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/approval-flow-master", tags=["approval-flow-master"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.APPROVAL_FLOW_MASTER

# Module configuration
MODULE_PREFIX = ModulePrefixes.APPROVAL_FLOW_MASTER
ENTITY_NAME = "Approval Flow Master"
ENTITY_NAME_PLURAL = "Approval Flow Masters"

# Collection name (using centralized constant)
COLLECTION_NAME = Collections.APPROVAL_FLOW_MASTER




class PaginatedApprovalFlowMasterResponse(BaseModel):
    """Paginated response model for approval flow master list"""
    data: List[ApprovalFlowMasterResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


async def validate_approval_flow_master_foreign_keys(db, flow_data: dict):
    """
    Validate all foreign key constraints for approval flow master.

    This function validates that all foreign key references in the flow data
    point to existing, non-deleted records in their respective collections.

    Args:
        db: AsyncIOMotorDatabase instance for MongoDB operations.
        flow_data: Dictionary containing approval flow master data with foreign keys.

    Validated Foreign Keys:
        - moduleId: Must exist in modules collection and not be deleted
        - finalApprovalUnitId: Must exist in unit collection and not be deleted
        - finalApprovalRankId: Must exist in rank_master collection and not be deleted
        - furtherProcess[].targetUserId: Each must exist in personnel_master and not be deleted

    Returns:
        bool: True if all validations pass.

    Raises:
        HTTPException(400): If any ObjectId format is invalid.
        HTTPException(404): If any referenced record is not found or is deleted.

    Example:
        await validate_approval_flow_master_foreign_keys(db, {
            "moduleId": "507f1f77bcf86cd799439011",
            "finalApprovalUnitId": "507f1f77bcf86cd799439012",
            "finalApprovalRankId": "507f1f77bcf86cd799439013"
        })
    """
    # Validate moduleId (required FK)
    if flow_data.get("moduleId"):
        module_id = flow_data["moduleId"]

        # Validate ObjectId format
        if not ObjectId.is_valid(module_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="moduleId")
            )

        # Check if module exists
        module = await db[Collections.MODULES].find_one({"_id": ObjectId(module_id)})
        if not module:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_validation_error("fk_not_found", field_name="moduleId", collection_name="module")
            )

        if module.get("isDelete", False) or module.get("isDeleted", False):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_validation_error("fk_deleted", field_name="moduleId", collection_name="module")
            )

    # Validate finalApprovalUnitId (required FK)
    if flow_data.get("finalApprovalUnitId"):
        final_unit_id = flow_data["finalApprovalUnitId"]

        # Validate ObjectId format
        if not ObjectId.is_valid(final_unit_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="finalApprovalUnitId")
            )

        # Check if unit exists and is not deleted
        unit = await db[Collections.UNIT].find_one({"_id": ObjectId(final_unit_id)})
        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_validation_error("fk_not_found", field_name="finalApprovalUnitId", collection_name="unit")
            )

        if unit.get("isDelete", False) or unit.get("isDeleted", False):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_validation_error("fk_deleted", field_name="finalApprovalUnitId", collection_name="unit")
            )

    # Validate finalApprovalRankId (required FK - rank_master collection)
    if flow_data.get("finalApprovalRankId"):
        final_rank_id = flow_data["finalApprovalRankId"]

        # Validate ObjectId format
        if not ObjectId.is_valid(final_rank_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="finalApprovalRankId")
            )

        # Check if rank exists and is not deleted
        rank = await db[Collections.RANK_MASTER].find_one({"_id": ObjectId(final_rank_id)})
        if not rank:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_validation_error("fk_not_found", field_name="finalApprovalRankId", collection_name="rank_master")
            )

        if rank.get("isDelete", False) or rank.get("isDeleted", False):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_validation_error("fk_deleted", field_name="finalApprovalRankId", collection_name="rank_master")
            )

    # Validate targetUserId in furtherProcess array (optional FK - personnel collection)
    if flow_data.get("furtherProcess"):
        for idx, process in enumerate(flow_data["furtherProcess"]):
            if process.get("targetUserId"):
                target_user_id = process["targetUserId"]

                # Validate ObjectId format
                if not ObjectId.is_valid(target_user_id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=get_validation_error("invalid_objectid", field_name=f"furtherProcess[{idx}].targetUserId")
                    )

                # Check if personnel exists and is not deleted
                personnel = await db[Collections.PERSONNEL_MASTER].find_one({"_id": ObjectId(target_user_id)})
                if not personnel:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=get_validation_error("fk_not_found", field_name=f"furtherProcess[{idx}].targetUserId", collection_name="personnel")
                    )

                if personnel.get("isDelete", False) or personnel.get("isDeleted", False):
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=get_validation_error("fk_deleted", field_name=f"furtherProcess[{idx}].targetUserId", collection_name="personnel")
                    )

    return True


async def get_approval_flow_with_populated_data(db, flow_id) -> dict:
    """
    Fetch a single approval flow master with populated nested objects.

    This function uses MongoDB aggregation with $lookup to populate related
    data from referenced collections, transforming foreign key IDs into
    full object representations.

    Args:
        db: AsyncIOMotorDatabase instance.
        flow_id: MongoDB ObjectId or string ID of the approval flow master.

    Returns:
        dict: Approval flow master document with populated fields:
            - module: {_id, name} from modules collection
            - finalApprovalUnit: {_id, name, policeReferenceId} from unit collection
            - finalApprovalRank: {_id, name, shortCode} from rank_master collection
            - district: {_id, name} from district collection
        None: If no matching record exists.

    Note:
        All ObjectId and datetime fields are converted to strings for JSON serialization.
    """
    pipeline = [
        {"$match": {"_id": ObjectId(flow_id) if isinstance(flow_id, str) else flow_id}},
        # Lookup module
        {
            "$lookup": {
                "from": Collections.MODULES,
                "localField": "moduleId",
                "foreignField": "_id",
                "as": "moduleData"
            }
        },
        # Lookup finalApprovalUnit
        {
            "$lookup": {
                "from": Collections.UNIT,
                "localField": "finalApprovalUnitId",
                "foreignField": "_id",
                "as": "finalApprovalUnitData"
            }
        },
        # Lookup finalApprovalRank
        {
            "$lookup": {
                "from": Collections.RANK_MASTER,
                "localField": "finalApprovalRankId",
                "foreignField": "_id",
                "as": "finalApprovalRankData"
            }
        },
        # Lookup district
        {
            "$lookup": {
                "from": Collections.DISTRICT,
                "localField": "districtId",
                "foreignField": "_id",
                "as": "districtData"
            }
        },
        # Add populated fields
        {
            "$addFields": {
                "module": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$moduleData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$moduleData._id", 0]}},
                            "name": {"$arrayElemAt": ["$moduleData.name", 0]}
                        },
                        "else": None
                    }
                },
                "finalApprovalUnit": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$finalApprovalUnitData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$finalApprovalUnitData._id", 0]}},
                            "name": {"$arrayElemAt": ["$finalApprovalUnitData.name", 0]},
                            "policeReferenceId": {"$arrayElemAt": ["$finalApprovalUnitData.policeReferenceId", 0]}
                        },
                        "else": None
                    }
                },
                "finalApprovalRank": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$finalApprovalRankData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$finalApprovalRankData._id", 0]}},
                            "name": {"$arrayElemAt": ["$finalApprovalRankData.name", 0]},
                            "shortCode": {"$arrayElemAt": ["$finalApprovalRankData.shortCode", 0]}
                        },
                        "else": None
                    }
                },
                "district": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$districtData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$districtData._id", 0]}},
                            "name": {"$arrayElemAt": ["$districtData.name", 0]}
                        },
                        "else": None
                    }
                }
            }
        },
        # Remove temporary lookup arrays
        {
            "$project": {
                "moduleData": 0,
                "finalApprovalUnitData": 0,
                "finalApprovalRankData": 0,
                "districtData": 0
            }
        }
    ]

    cursor = db[COLLECTION_NAME].aggregate(pipeline)
    results = await cursor.to_list(length=1)

    if results:
        return convert_objectid_to_str(results[0])
    return None


async def get_approval_flows_with_populated_data(db, query: dict, skip: int = 0, limit: int = None) -> list:
    """
    Fetch multiple approval flow masters with populated nested objects.

    This function uses MongoDB aggregation with $lookup to populate related
    data for a list of approval flow masters, supporting pagination.

    Args:
        db: AsyncIOMotorDatabase instance.
        query: MongoDB query filter to match documents.
        skip: Number of documents to skip (for pagination). Default: 0.
        limit: Maximum number of documents to return. None for no limit.

    Returns:
        list: List of approval flow master documents with populated fields:
            - module: {_id, name} from modules collection
            - finalApprovalUnit: {_id, name, policeReferenceId} from unit collection
            - finalApprovalRank: {_id, name, shortCode} from rank_master collection
            - district: {_id, name} from district collection

    Note:
        - Results are sorted by createdAt in descending order.
        - All ObjectId and datetime fields are converted to strings.
    """
    pipeline = [
        {"$match": query},
        {"$sort": {"createdAt": -1}},
    ]

    if skip > 0:
        pipeline.append({"$skip": skip})

    if limit is not None:
        pipeline.append({"$limit": limit})

    # Add lookups and projections
    pipeline.extend([
        {"$lookup": {"from": Collections.MODULES, "localField": "moduleId", "foreignField": "_id", "as": "moduleData"}},
        {"$lookup": {"from": Collections.UNIT, "localField": "finalApprovalUnitId", "foreignField": "_id", "as": "finalApprovalUnitData"}},
        {"$lookup": {"from": Collections.RANK_MASTER, "localField": "finalApprovalRankId", "foreignField": "_id", "as": "finalApprovalRankData"}},
        {"$lookup": {"from": Collections.DISTRICT, "localField": "districtId", "foreignField": "_id", "as": "districtData"}},
        {
            "$addFields": {
                "module": {"$cond": {"if": {"$gt": [{"$size": "$moduleData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$moduleData._id", 0]}}, "name": {"$arrayElemAt": ["$moduleData.name", 0]}}, "else": None}},
                "finalApprovalUnit": {"$cond": {"if": {"$gt": [{"$size": "$finalApprovalUnitData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$finalApprovalUnitData._id", 0]}}, "name": {"$arrayElemAt": ["$finalApprovalUnitData.name", 0]}, "policeReferenceId": {"$arrayElemAt": ["$finalApprovalUnitData.policeReferenceId", 0]}}, "else": None}},
                "finalApprovalRank": {"$cond": {"if": {"$gt": [{"$size": "$finalApprovalRankData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$finalApprovalRankData._id", 0]}}, "name": {"$arrayElemAt": ["$finalApprovalRankData.name", 0]}, "shortCode": {"$arrayElemAt": ["$finalApprovalRankData.shortCode", 0]}}, "else": None}},
                "district": {"$cond": {"if": {"$gt": [{"$size": "$districtData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$districtData._id", 0]}}, "name": {"$arrayElemAt": ["$districtData.name", 0]}}, "else": None}}
            }
        },
        {"$project": {"moduleData": 0, "finalApprovalUnitData": 0, "finalApprovalRankData": 0, "districtData": 0}}
    ])

    cursor = db[COLLECTION_NAME].aggregate(pipeline)
    results = await cursor.to_list(length=limit if limit else None)

    return [convert_objectid_to_str(doc) for doc in results]


def convert_objectid_to_str(document: dict) -> dict:
    """
    Recursively convert ObjectId and datetime fields to strings for JSON serialization.

    This utility function traverses a document and converts all BSON ObjectId
    instances to hex strings and datetime instances to ISO format strings.

    Args:
        document: Dictionary containing the document to convert.

    Returns:
        dict: The converted document with all ObjectId and datetime fields as strings.
        Returns the original document if None.

    Converted Fields:
        - _id: Always converted if present
        - moduleId, finalApprovalUnitId, finalApprovalRankId, districtId: FK fields
        - createdBy, updatedBy: Audit fields
        - createdAt, updatedAt: Timestamp fields
        - furtherProcess[].targetUserId: Nested FK in array
    """
    from datetime import datetime

    if not document:
        return document

    if "_id" in document:
        document["_id"] = str(document["_id"])

    # Convert top-level ObjectId fields
    for field in ["moduleId", "finalApprovalUnitId", "finalApprovalRankId", "districtId", "createdBy", "updatedBy"]:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    for field in ["createdAt", "updatedAt"]:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    # Convert ObjectId in furtherProcess array
    if "furtherProcess" in document and document["furtherProcess"]:
        for process in document["furtherProcess"]:
            if "targetUserId" in process and isinstance(process["targetUserId"], ObjectId):
                process["targetUserId"] = str(process["targetUserId"])

    return document


@router.post("/create", response_model=ApprovalFlowMasterResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_approval_flow_master(
    flow: ApprovalFlowMasterCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new approval flow master with automatic audit field population.

    This endpoint creates a new approval flow template that defines how
    approval workflows should be structured for a specific module.

    **Request Body (ApprovalFlowMasterCreateSchema):**
    - `moduleId` (required): Reference to the module this flow applies to
    - `finalApprovalUnitId` (required): Unit where final approval occurs
    - `finalApprovalRankId` (required): Minimum rank required for final approval
    - `districtId` (optional): District-specific configuration
    - `furtherProcess` (optional): Array of post-approval processing steps
    - `isActive` (optional): Whether flow is active (default: true)

    **Response (ApprovalFlowMasterResponseSchema):**
    - `success`: true on success
    - `code`: 201 (Created)
    - `message`: "Approval Flow Master created successfully"
    - `data`: Created approval flow master with populated nested objects

    **Error Responses:**
    - 400: Validation error (invalid ObjectId format)
    - 403: Permission denied (CREATE permission required)
    - 404: Referenced module, unit, rank, or personnel not found
    - 500: Internal server error

    **Side Effects:**
    - Sets audit fields (createdBy, createdAt, createdIp)
    - Logs transaction with APPROVAL_FLOW_MASTER_CREATED code
    """
    try:
        

        db = get_database()

        # Prepare document
        flow_dict = flow.model_dump()

        # Validate foreign key constraints
        await validate_approval_flow_master_foreign_keys(db, flow_dict)

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        # Set audit fields
        flow_dict["createdBy"] = current_user.id
        flow_dict["createdAt"] = get_ist_now()
        flow_dict["createdIp"] = client_ip
        flow_dict["updatedBy"] = None
        flow_dict["updatedAt"] = None
        flow_dict["updatedIp"] = None
        flow_dict["isDelete"] = False

        # Convert string IDs to ObjectId
        flow_dict["moduleId"] = ObjectId(flow_dict["moduleId"])
        flow_dict["finalApprovalUnitId"] = ObjectId(flow_dict["finalApprovalUnitId"])
        flow_dict["finalApprovalRankId"] = ObjectId(flow_dict["finalApprovalRankId"])
        flow_dict["createdBy"] = ObjectId(flow_dict["createdBy"])

        # Convert optional districtId to ObjectId if provided
        if flow_dict.get("districtId"):
            flow_dict["districtId"] = ObjectId(flow_dict["districtId"])

        # Convert targetUserId in furtherProcess to ObjectId
        if flow_dict.get("furtherProcess"):
            for process in flow_dict["furtherProcess"]:
                if process.get("targetUserId"):
                    process["targetUserId"] = ObjectId(process["targetUserId"])

        # Insert into database
        result = await db[COLLECTION_NAME].insert_one(flow_dict)

        # Fetch created document with populated nested objects
        created_flow = await get_approval_flow_with_populated_data(db, result.inserted_id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.APPROVAL_FLOW_MASTER_CREATED,
            json_values={
                "approvalFlowMasterId": str(result.inserted_id),
                "moduleId": str(flow_dict.get("moduleId", "")),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=ResponseBuilder.created(
                data=created_flow,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_CREATE_FAILED
            )
        )


@router.get("/list", response_model=PaginatedApprovalFlowMasterResponse)
async def get_all_approval_flow_masters(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1)"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page"),
    is_active: Optional[bool] = Query(True, description="Filter by active status (true=active only, false=inactive only, null=all)"),
    moduleId: Optional[str] = Query(None, description="Filter by module ID"),
    finalApprovalUnitId: Optional[str] = Query(None, description="Filter by final approval unit ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all approval flow masters with optional pagination and filters.

    Retrieves a list of approval flow masters with support for filtering by
    module, unit, and active status. When pagination parameters are provided,
    returns paginated results.

    **Query Parameters:**
    - `page` (optional): Page number (1-indexed). Omit for all records.
    - `page_size` (optional): Items per page (1-1000)
    - `is_active` (optional): Filter by active status (default: true for active only)
    - `moduleId` (optional): Filter by module ID (must be valid ObjectId)
    - `finalApprovalUnitId` (optional): Filter by final approval unit ID
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Response (PaginatedApprovalFlowMasterResponse):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Flow Master list fetched successfully"
    - `data`: Array of approval flow masters with populated nested objects
    - `total`, `page`, `page_size`, `total_pages`: Pagination info (when page provided)

    **Error Responses:**
    - 400: Invalid ObjectId format for filter parameters
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        
        db = get_database()

        # Build query
        query = {}
        if not include_deleted:
            query["isDelete"] = False

        # Filter by active status (default: only active records)
        if is_active is not None:
            query["isActive"] = is_active

        if moduleId:
            if not ObjectId.is_valid(moduleId):
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID,
                    parameters={"errorMessage": "Invalid module ID"},
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "module")
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID
                    )
                )
            query["moduleId"] = ObjectId(moduleId)

        if finalApprovalUnitId:
            if not ObjectId.is_valid(finalApprovalUnitId):
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID,
                    parameters={"errorMessage": "Invalid finalApprovalUnit ID"},
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "finalApprovalUnit")
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID
                    )
                )
            query["finalApprovalUnitId"] = ObjectId(finalApprovalUnitId)

        total = await db[COLLECTION_NAME].count_documents(query)

        if page is not None and page_size is not None:
            skip = (page - 1) * page_size

            flows_list = await get_approval_flows_with_populated_data(db, query, skip=skip, limit=page_size)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.paginated(
                    data=flows_list,
                    total=total,
                    page=page,
                    page_size=page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
        else:
            flows_list = await get_approval_flows_with_populated_data(db, query)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.success(
                    data=flows_list,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME_PLURAL}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED
            )
        )


@router.get("/get/{flow_id}", response_model=ApprovalFlowMasterResponseSchema)
async def get_approval_flow_master(
    flow_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get an approval flow master by ID with populated nested objects.

    Retrieves a single approval flow master by its MongoDB ObjectId with all
    related data populated (module, unit, rank, district).

    **Path Parameters:**
    - `flow_id` (required): MongoDB ObjectId of the approval flow master

    **Response (ApprovalFlowMasterResponseSchema):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Flow Master fetched successfully"
    - `data`: Approval flow master with populated nested objects

    **Error Responses:**
    - 400: Invalid ObjectId format
    - 403: Permission denied (READ permission required)
    - 404: Approval flow master not found
    - 500: Internal server error
    """
    try:
        

        db = get_database()

        if not ObjectId.is_valid(flow_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "flow")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID
                )
            )

        object_id = ObjectId(flow_id)
        flow = await get_approval_flow_with_populated_data(db, object_id)

        if not flow:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_GET_NOT_FOUND,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ResponseBuilder.success(
                data=flow,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_GET_NOT_FOUND,
            parameters={"flowId": flow_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_GET_NOT_FOUND,
            parameters={"flowId": flow_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_GET_NOT_FOUND
            )
        )


@router.patch("/update/{flow_id}", response_model=ApprovalFlowMasterResponseSchema)
async def update_approval_flow_master(
    flow_id: str,
    flow_update: ApprovalFlowMasterUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Partially update an approval flow master.

    Updates an existing approval flow master with partial data. Only provided
    fields are updated (PATCH semantics).

    **Path Parameters:**
    - `flow_id` (required): MongoDB ObjectId of the flow to update

    **Request Body (ApprovalFlowMasterUpdateSchema):**
    All fields are optional. Only provided fields are updated:
    - `moduleId`: New module reference
    - `finalApprovalUnitId`: New final approval unit
    - `finalApprovalRankId`: New final approval rank
    - `districtId`: New district configuration
    - `furtherProcess`: Updated processing steps
    - `isActive`: Enable/disable the flow

    **Response (ApprovalFlowMasterResponseSchema):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Flow Master updated successfully"
    - `data`: Updated approval flow master with populated nested objects

    **Error Responses:**
    - 400: Validation error (no fields to update, invalid ObjectId)
    - 403: Permission denied (UPDATE permission required)
    - 404: Approval flow master not found or deleted
    - 500: Internal server error

    **Side Effects:**
    - Updates audit fields (updatedBy, updatedAt, updatedIp)
    - Logs transaction with APPROVAL_FLOW_MASTER_UPDATED code
    """
    try:
        db = get_database()

        if not ObjectId.is_valid(flow_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "flow")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID
                )
            )

        object_id = ObjectId(flow_id)

        existing_flow = await db[COLLECTION_NAME].find_one({"_id": object_id, "isDelete": False})
        if not existing_flow:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_NOT_FOUND,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_NOT_FOUND
                )
            )

        update_data = flow_update.model_dump(exclude_unset=True)

        if not update_data:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
                parameters={"flowId": flow_id, "errorMessage": "No fields to update"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.NO_FIELDS_TO_UPDATE
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED
                )
            )

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        # Set audit fields
        update_data["updatedBy"] = ObjectId(current_user.id)
        update_data["updatedAt"] = get_ist_now()
        update_data["updatedIp"] = client_ip

        # Convert string IDs to ObjectId
        for field in ["moduleId", "finalApprovalUnitId", "finalApprovalRankId", "districtId"]:
            if field in update_data and update_data[field]:
                update_data[field] = ObjectId(update_data[field])

        if "furtherProcess" in update_data and update_data["furtherProcess"]:
            for process in update_data["furtherProcess"]:
                if process.get("targetUserId"):
                    process["targetUserId"] = ObjectId(process["targetUserId"])

        await db[COLLECTION_NAME].update_one({"_id": object_id}, {"$set": update_data})

        updated_flow = await get_approval_flow_with_populated_data(db, object_id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.APPROVAL_FLOW_MASTER_UPDATED,
            json_values={
                "approvalFlowMasterId": flow_id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ResponseBuilder.success(
                data=updated_flow,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
            parameters={"flowId": flow_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
            parameters={"flowId": flow_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED
            )
        )


@router.delete("/delete/{flow_id}")
async def delete_approval_flow_master(
    flow_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete an approval flow master.

    Performs a soft delete by setting `isDelete=True`. The record is not
    physically removed and can be restored using the restore endpoint.

    **Path Parameters:**
    - `flow_id` (required): MongoDB ObjectId of the flow to delete

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Flow Master deleted successfully"

    **Recorded Metadata:**
    - `isDelete`: Set to true
    - `updatedBy`: User who performed deletion
    - `updatedAt`: Deletion timestamp
    - `updatedIp`: IP address of the deletion request

    **Error Responses:**
    - 400: Invalid ObjectId format
    - 403: Permission denied (DELETE permission required)
    - 404: Approval flow master not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with APPROVAL_FLOW_MASTER_DELETED code
    """
    try:
        

        db = get_database()

        if not ObjectId.is_valid(flow_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "flow")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID
                )
            )

        object_id = ObjectId(flow_id)

        existing_flow = await db[COLLECTION_NAME].find_one({"_id": object_id, "isDelete": False})
        if not existing_flow:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_DELETE_NOT_FOUND,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_DELETE_NOT_FOUND
                )
            )

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        await db[COLLECTION_NAME].update_one(
            {"_id": object_id},
            {
                "$set": {
                    "isDelete": True,
                    "updatedBy": ObjectId(current_user.id),
                    "updatedAt": get_ist_now(),
                    "updatedIp": client_ip
                }
            }
        )

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.APPROVAL_FLOW_MASTER_DELETED,
            json_values={
                "approvalFlowMasterId": flow_id,
                "deletedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ResponseBuilder.success(
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_DELETE_FAILED,
            parameters={"flowId": flow_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_DELETE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_DELETE_FAILED,
            parameters={"flowId": flow_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_DELETE_FAILED
            )
        )


@router.patch("/restore/{flow_id}")
async def restore_approval_flow_master(
    flow_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted approval flow master.

    Restores a previously deleted approval flow master by setting `isDelete=False`
    and `isActive=True`. Only records that are currently deleted can be restored.

    **Path Parameters:**
    - `flow_id` (required): MongoDB ObjectId of the flow to restore

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Flow Master restored successfully"
    - `data`: Restored approval flow master with populated nested objects

    **Recorded Metadata:**
    - `isDelete`: Set to false
    - `isActive`: Set to true
    - `updatedBy`: User who performed restoration
    - `updatedAt`: Restoration timestamp
    - `updatedIp`: IP address of the restoration request

    **Error Responses:**
    - 400: Invalid ObjectId format or flow is not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Approval flow master not found
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with APPROVAL_FLOW_MASTER_RESTORED code
    """
    try:

        db = get_database()

        # Validate flow_id format
        if not ObjectId.is_valid(flow_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID
                )
            )

        object_id = ObjectId(flow_id)

        # Check if flow exists
        existing_flow = await db[COLLECTION_NAME].find_one({"_id": object_id})
        if not existing_flow:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_NOT_FOUND,
                parameters={"flowId": flow_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_NOT_FOUND
                )
            )

        # Check if actually deleted
        if not existing_flow.get("isDelete", False):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
                parameters={"flowId": flow_id, "errorMessage": "Flow is not deleted"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED
                )
            )

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        # Restore the flow
        await db[COLLECTION_NAME].update_one(
            {"_id": object_id},
            {
                "$set": {
                    "isDelete": False,
                    "isActive": True,
                    "updatedBy": ObjectId(current_user.id),
                    "updatedAt": get_ist_now(),
                    "updatedIp": client_ip
                }
            }
        )

        # Fetch restored flow with populated data
        restored_flow = await get_approval_flow_with_populated_data(db, object_id)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.APPROVAL_FLOW_MASTER_RESTORED,
            json_values={
                "approvalFlowMasterId": flow_id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ResponseBuilder.success(
                data=restored_flow,
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
            parameters={"flowId": flow_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED,
            parameters={"flowId": flow_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_UPDATE_FAILED
            )
        )


@router.get("/get/by-module/{module_id}", response_model=PaginatedApprovalFlowMasterResponse)
async def get_approval_flow_masters_by_module(
    module_id: str,
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Items per page"),
    is_active: Optional[bool] = Query(True, description="Filter by active status (true=active only, false=inactive only, null=all)"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get approval flow masters filtered by module ID.

    Retrieves all approval flow masters that belong to a specific module.
    Useful for finding available approval workflows for a particular feature.

    **Path Parameters:**
    - `module_id` (required): MongoDB ObjectId of the module to filter by

    **Query Parameters:**
    - `page` (optional): Page number (1-indexed). Omit for all records.
    - `page_size` (optional): Items per page (1-1000)
    - `is_active` (optional): Filter by active status (default: true for active only)
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Response (PaginatedApprovalFlowMasterResponse):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Flow Master list fetched successfully"
    - `data`: Array of approval flow masters with populated nested objects
    - `total`, `page`, `page_size`, `total_pages`: Pagination info (when page provided)

    **Error Responses:**
    - 400: Invalid ObjectId format for module_id
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        db = get_database()

        # Validate module_id format
        if not ObjectId.is_valid(module_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID,
                parameters={"moduleId": module_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "module")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_FLOW_INVALID_ID
                )
            )

        module_object_id = ObjectId(module_id)

        # Build query
        query = {"moduleId": module_object_id}
        if not include_deleted:
            query["isDelete"] = False

        # Filter by active status (default: only active records)
        if is_active is not None:
            query["isActive"] = is_active

        total = await db[COLLECTION_NAME].count_documents(query)

        if page is not None and page_size is not None:
            skip = (page - 1) * page_size

            flows_list = await get_approval_flows_with_populated_data(db, query, skip=skip, limit=page_size)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.paginated(
                    data=flows_list,
                    total=total,
                    page=page,
                    page_size=page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
        else:
            flows_list = await get_approval_flows_with_populated_data(db, query)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.success(
                    data=flows_list,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED,
            parameters={"moduleId": module_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME_PLURAL} by module")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED,
            parameters={"moduleId": module_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_FLOW_LIST_FAILED
            )
        )
