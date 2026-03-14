"""
Approval Chain Router.

This module provides FastAPI endpoints for managing approval chains in the system.
Approval chains track the progress of approval workflows across multiple stages
and approvers, enabling hierarchical approval processes.

Key Features:
    - Full CRUD operations for approval chains
    - RBAC permission checking for all operations
    - Soft delete and restore functionality
    - Pagination and filtering support
    - Foreign key population for nested objects
    - Transaction logging and error logging
    - IP tracking for audit trail

Endpoints:
    POST /create - Create a new approval chain
    GET /list - List all approval chains with filters
    GET /get/{chain_id} - Get approval chain by ID
    PATCH /update/{chain_id} - Update an approval chain
    DELETE /delete/{chain_id} - Soft delete an approval chain
    PATCH /restore/{chain_id} - Restore a deleted approval chain
    GET /get/pending/by-user-module-district/{module_id} - Get pending approvals for user

Collections Used:
    - approval_chain: Primary collection
    - modules: For module lookup
    - unit: For unit lookups
    - district: For district lookup
    - rank_master: For rank lookup
    - personnel_master: For approver lookup

Usage:
    from app.api.v1.routers.approval_chain_router import router

    app.include_router(router)

See Also:
    - ApprovalChainRepository: Data access layer
    - ApprovalFlowMasterRepository: Flow template definitions
    - ApprovalChainSchema: Request/response schemas
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
from app.api.v1.schemas.approval_chain_schema import (
    ApprovalChainCreateSchema,
    ApprovalChainResponseSchema,
    ApprovalChainUpdateSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error, get_success_message
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.jobs import Jobs
from app.constants.collections import Collections
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes as OldErrorCodes, ModulePrefixes
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/approval-chain", tags=["approval-chain"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.APPROVAL_CHAIN

# Module configuration
MODULE_PREFIX = ModulePrefixes.APPROVAL_CHAIN
ENTITY_NAME = "Approval Chain"
ENTITY_NAME_PLURAL = "Approval Chains"

# Collection name (using centralized constant)
COLLECTION_NAME = Collections.APPROVAL_CHAIN


class PaginatedApprovalChainResponse(BaseModel):
    """Paginated response model for approval chain list"""
    data: List[ApprovalChainResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


async def validate_approval_chain_foreign_keys(db, chain_data: dict):
    """
    Validate all foreign key constraints for approval chain
    All validations are commented out - uncomment when ready to enforce
    """
    # Validate moduleId (required FK)
    # if chain_data.get("moduleId"):
    #     module_id = chain_data["moduleId"]
    #     if not ObjectId.is_valid(module_id):
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail=get_validation_error("invalid_objectid", field_name="moduleId")
    #         )

    # Validate currentUnitId (optional FK)
    # if chain_data.get("currentUnitId"):
    #     current_unit_id = chain_data["currentUnitId"]
    #     if not ObjectId.is_valid(current_unit_id):
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail=get_validation_error("invalid_objectid", field_name="currentUnitId")
    #         )
    #     unit = await db.unit.find_one({"_id": ObjectId(current_unit_id)})
    #     if not unit:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_not_found", field_name="currentUnitId", collection_name="unit")
    #         )
    #     if unit.get("isDeleted", False):
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_deleted", field_name="currentUnitId", collection_name="unit")
    #         )

    # Validate currentApproverId (optional FK - personnel collection)
    # if chain_data.get("currentApproverId"):
    #     current_approver_id = chain_data["currentApproverId"]
    #     if not ObjectId.is_valid(current_approver_id):
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail=get_validation_error("invalid_objectid", field_name="currentApproverId")
    #         )
    #     personnel = await db.personnel_master.find_one({"_id": ObjectId(current_approver_id)})
    #     if not personnel:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_not_found", field_name="currentApproverId", collection_name="personnel")
    #         )
    #     if personnel.get("isDeleted", False):
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_deleted", field_name="currentApproverId", collection_name="personnel")
    #         )

    # Validate finalApprovalUnitId (required FK)
    # if chain_data.get("finalApprovalUnitId"):
    #     final_unit_id = chain_data["finalApprovalUnitId"]
    #     if not ObjectId.is_valid(final_unit_id):
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail=get_validation_error("invalid_objectid", field_name="finalApprovalUnitId")
    #         )
    #     unit = await db.unit.find_one({"_id": ObjectId(final_unit_id)})
    #     if not unit:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_not_found", field_name="finalApprovalUnitId", collection_name="unit")
    #         )
    #     if unit.get("isDeleted", False):
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_deleted", field_name="finalApprovalUnitId", collection_name="unit")
    #         )

    # Validate finalApprovalRoleId (required FK - roles collection)
    # if chain_data.get("finalApprovalRoleId"):
    #     role_id = chain_data["finalApprovalRoleId"]
    #     if not ObjectId.is_valid(role_id):
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail=get_validation_error("invalid_objectid", field_name="finalApprovalRoleId")
    #         )
    #     role = await db.roles.find_one({"_id": ObjectId(role_id)})
    #     if not role:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_not_found", field_name="finalApprovalRoleId", collection_name="roles")
    #         )
    #     if role.get("isDeleted", False):
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_deleted", field_name="finalApprovalRoleId", collection_name="roles")
    #         )

    # Validate districtId (optional FK - district collection)
    # if chain_data.get("districtId"):
    #     district_id = chain_data["districtId"]
    #     if not ObjectId.is_valid(district_id):
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail=get_validation_error("invalid_objectid", field_name="districtId")
    #         )
    #     district = await db.district.find_one({"_id": ObjectId(district_id)})
    #     if not district:
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_not_found", field_name="districtId", collection_name="district")
    #         )
    #     if district.get("isDeleted", False):
    #         raise HTTPException(
    #             status_code=status.HTTP_404_NOT_FOUND,
    #             detail=get_validation_error("fk_deleted", field_name="districtId", collection_name="district")
    #         )

    # Validate transactionHistory array
    # if chain_data.get("transactionHistory"):
    #     for idx, transaction in enumerate(chain_data["transactionHistory"]):
    #         if transaction.get("unitId"):
    #             unit_id = transaction["unitId"]
    #             if not ObjectId.is_valid(unit_id):
    #                 raise HTTPException(
    #                     status_code=status.HTTP_400_BAD_REQUEST,
    #                     detail=get_validation_error("invalid_objectid", field_name=f"transactionHistory[{idx}].unitId")
    #                 )
    #         if transaction.get("userId"):
    #             user_id = transaction["userId"]
    #             if not ObjectId.is_valid(user_id):
    #                 raise HTTPException(
    #                     status_code=status.HTTP_400_BAD_REQUEST,
    #                     detail=get_validation_error("invalid_objectid", field_name=f"transactionHistory[{idx}].userId")
    #                 )

    return True


async def get_approval_chain_with_populated_data(db, chain_id) -> dict:
    """
    Fetch a single approval chain with populated nested objects using aggregation pipeline.

    This function uses MongoDB aggregation with $lookup to populate related
    data from referenced collections, transforming foreign key IDs into
    full object representations.

    Args:
        db: AsyncIOMotorDatabase instance.
        chain_id: MongoDB ObjectId or string ID of the approval chain.

    Returns:
        dict: Approval chain document with populated fields:
            - module: {_id, name} from modules collection
            - currentUnit: {_id, name, policeReferenceId} from unit collection
            - finalApprovalUnit: {_id, name, policeReferenceId} from unit collection
            - district: {_id, name} from district collection
            - finalApprovalRank: {_id, name, shortCode} from rank_master collection
            - currentApprover: {_id, name, email} from personnel_master collection
        None: If no matching record exists.

    Note:
        All ObjectId and datetime fields are converted to strings for JSON serialization.
    """
    pipeline = [
        {"$match": {"_id": ObjectId(chain_id) if isinstance(chain_id, str) else chain_id}},
        # Lookup module
        {
            "$lookup": {
                "from": Collections.MODULES,
                "localField": "moduleId",
                "foreignField": "_id",
                "as": "moduleData"
            }
        },
        # Lookup currentUnit
        {
            "$lookup": {
                "from": Collections.UNIT,
                "localField": "currentUnitId",
                "foreignField": "_id",
                "as": "currentUnitData"
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
        # Lookup district
        {
            "$lookup": {
                "from": Collections.DISTRICT,
                "localField": "districtId",
                "foreignField": "_id",
                "as": "districtData"
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
        # Lookup currentApprover
        {
            "$lookup": {
                "from": Collections.PERSONNEL_MASTER,
                "localField": "currentApproverId",
                "foreignField": "_id",
                "as": "currentApproverData"
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
                "currentUnit": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$currentUnitData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$currentUnitData._id", 0]}},
                            "name": {"$arrayElemAt": ["$currentUnitData.name", 0]},
                            "policeReferenceId": {"$arrayElemAt": ["$currentUnitData.policeReferenceId", 0]}
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
                "district": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$districtData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$districtData._id", 0]}},
                            "name": {"$arrayElemAt": ["$districtData.name", 0]}
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
                "currentApprover": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$currentApproverData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$currentApproverData._id", 0]}},
                            "name": {"$arrayElemAt": ["$currentApproverData.name", 0]},
                            "email": {"$arrayElemAt": ["$currentApproverData.email", 0]}
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
                "currentUnitData": 0,
                "finalApprovalUnitData": 0,
                "districtData": 0,
                "finalApprovalRankData": 0,
                "currentApproverData": 0
            }
        }
    ]

    cursor = db[COLLECTION_NAME].aggregate(pipeline)
    results = await cursor.to_list(length=1)

    if results:
        return convert_objectid_to_str(results[0])
    return None


async def get_approval_chains_with_populated_data(db, query: dict, skip: int = 0, limit: int = None) -> list:
    """
    Fetch multiple approval chains with populated nested objects using aggregation pipeline.

    This function uses MongoDB aggregation with $lookup to populate related
    data for a list of approval chains, supporting pagination.

    Args:
        db: AsyncIOMotorDatabase instance.
        query: MongoDB query filter to match documents.
        skip: Number of documents to skip (for pagination). Default: 0.
        limit: Maximum number of documents to return. None for no limit.

    Returns:
        list: List of approval chain documents with populated fields:
            - module: {_id, name} from modules collection
            - currentUnit: {_id, name, policeReferenceId} from unit collection
            - finalApprovalUnit: {_id, name, policeReferenceId} from unit collection
            - district: {_id, name} from district collection
            - finalApprovalRank: {_id, name, shortCode} from rank_master collection
            - currentApprover: {_id, name, email} from personnel_master collection

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
        {"$lookup": {"from": Collections.UNIT, "localField": "currentUnitId", "foreignField": "_id", "as": "currentUnitData"}},
        {"$lookup": {"from": Collections.UNIT, "localField": "finalApprovalUnitId", "foreignField": "_id", "as": "finalApprovalUnitData"}},
        {"$lookup": {"from": Collections.DISTRICT, "localField": "districtId", "foreignField": "_id", "as": "districtData"}},
        {"$lookup": {"from": Collections.RANK_MASTER, "localField": "finalApprovalRankId", "foreignField": "_id", "as": "finalApprovalRankData"}},
        {"$lookup": {"from": Collections.PERSONNEL_MASTER, "localField": "currentApproverId", "foreignField": "_id", "as": "currentApproverData"}},
        {
            "$addFields": {
                "module": {"$cond": {"if": {"$gt": [{"$size": "$moduleData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$moduleData._id", 0]}}, "name": {"$arrayElemAt": ["$moduleData.name", 0]}}, "else": None}},
                "currentUnit": {"$cond": {"if": {"$gt": [{"$size": "$currentUnitData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$currentUnitData._id", 0]}}, "name": {"$arrayElemAt": ["$currentUnitData.name", 0]}, "policeReferenceId": {"$arrayElemAt": ["$currentUnitData.policeReferenceId", 0]}}, "else": None}},
                "finalApprovalUnit": {"$cond": {"if": {"$gt": [{"$size": "$finalApprovalUnitData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$finalApprovalUnitData._id", 0]}}, "name": {"$arrayElemAt": ["$finalApprovalUnitData.name", 0]}, "policeReferenceId": {"$arrayElemAt": ["$finalApprovalUnitData.policeReferenceId", 0]}}, "else": None}},
                "district": {"$cond": {"if": {"$gt": [{"$size": "$districtData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$districtData._id", 0]}}, "name": {"$arrayElemAt": ["$districtData.name", 0]}}, "else": None}},
                "finalApprovalRank": {"$cond": {"if": {"$gt": [{"$size": "$finalApprovalRankData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$finalApprovalRankData._id", 0]}}, "name": {"$arrayElemAt": ["$finalApprovalRankData.name", 0]}, "shortCode": {"$arrayElemAt": ["$finalApprovalRankData.shortCode", 0]}}, "else": None}},
                "currentApprover": {"$cond": {"if": {"$gt": [{"$size": "$currentApproverData"}, 0]}, "then": {"_id": {"$toString": {"$arrayElemAt": ["$currentApproverData._id", 0]}}, "name": {"$arrayElemAt": ["$currentApproverData.name", 0]}, "email": {"$arrayElemAt": ["$currentApproverData.email", 0]}}, "else": None}}
            }
        },
        {"$project": {"moduleData": 0, "currentUnitData": 0, "finalApprovalUnitData": 0, "districtData": 0, "finalApprovalRankData": 0, "currentApproverData": 0}}
    ])

    cursor = db[COLLECTION_NAME].aggregate(pipeline)
    results = await cursor.to_list(length=limit if limit else None)

    return [convert_objectid_to_str(doc) for doc in results]


def convert_objectid_to_str(document) -> dict:
    """
    Recursively convert ObjectId and datetime fields to strings for JSON serialization.

    This utility function traverses a document (dict, list, or primitive) and
    converts all BSON ObjectId instances to hex strings and datetime instances
    to ISO format strings.

    Args:
        document: Document to convert. Can be:
            - dict: Recursively processes all values
            - list: Recursively processes all items
            - ObjectId: Converts to hex string
            - datetime: Converts to ISO format string
            - Other: Returns unchanged

    Returns:
        The converted document with all ObjectId and datetime fields as strings.
        Returns None if input is None.

    Example:
        doc = {"_id": ObjectId("507f1f77bcf86cd799439011"), "createdAt": datetime.now()}
        result = convert_objectid_to_str(doc)
        # result: {"_id": "507f1f77bcf86cd799439011", "createdAt": "2024-01-15T10:30:00"}
    """
    from datetime import datetime

    if document is None:
        return document

    if isinstance(document, ObjectId):
        return str(document)

    if isinstance(document, datetime):
        return document.isoformat()

    if isinstance(document, list):
        return [convert_objectid_to_str(item) for item in document]

    if isinstance(document, dict):
        return {key: convert_objectid_to_str(value) for key, value in document.items()}

    return document


@router.post(
    "/create",
    response_model=ApprovalChainResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new approval chain",
    description="Creates a new approval chain for workflow management with automatic audit field population."
)
async def create_approval_chain(
    chain: ApprovalChainCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new approval chain with automatic audit field population.

    This endpoint creates a new approval chain for managing hierarchical
    approval workflows across units and roles.

    **Request Body (ApprovalChainCreateSchema):**
    - `moduleId` (required): FK to modules collection
    - `requestId` (optional): Reference to the request being approved
    - `currentUnitId` (optional): Current unit in the approval chain
    - `currentApproverId` (optional): Current approver (personnel)
    - `finalApprovalUnitId` (required): Final unit for approval
    - `finalApprovalRankId` (required): Final rank for approval
    - `districtId` (optional): District context
    - `approvalChainStatus` (optional): Status (default: Pending)
    - `transactionHistory` (optional): Array of approval transactions

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Approval Chain created successfully"
    - `data`: Created approval chain with populated nested objects

    **Error Responses:**
    - 403: Permission denied (CREATE permission required)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with APPROVAL_CHAIN_CREATED code
    - Records createdIp from request
    """
    try:
        
        db = get_database()

        chain_dict = chain.model_dump(exclude={"createdIp"})

        # Validate foreign key constraints (all commented out)
        await validate_approval_chain_foreign_keys(db, chain_dict)

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        # Set audit fields
        chain_dict["createdBy"] = current_user.id
        chain_dict["createdAt"] = get_ist_now()
        chain_dict["createdIp"] = client_ip
        chain_dict["updatedBy"] = None
        chain_dict["updatedAt"] = None
        chain_dict["updatedIp"] = None

        # Convert string IDs to ObjectId
        for field in ["moduleId", "requestId", "currentUnitId", "currentApproverId", "finalApprovalUnitId",
                      "finalApprovalRankId", "districtId", "createdBy"]:
            if chain_dict.get(field):
                chain_dict[field] = ObjectId(chain_dict[field])

        # Convert ObjectIds in transactionHistory
        if chain_dict.get("transactionHistory"):
            for transaction in chain_dict["transactionHistory"]:
                if transaction.get("unitId"):
                    transaction["unitId"] = ObjectId(transaction["unitId"])
                if transaction.get("userId"):
                    transaction["userId"] = ObjectId(transaction["userId"])

        # Insert into database
        result = await db[COLLECTION_NAME].insert_one(chain_dict)

        # Fetch with populated data
        created_chain = await get_approval_chain_with_populated_data(db, result.inserted_id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.APPROVAL_CHAIN_CREATED,
            json_values={
                "approvalChainId": str(result.inserted_id),
                "moduleId": chain_dict.get("moduleId", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=ResponseBuilder.created(
                data=created_chain,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_CHAIN_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_CHAIN_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    response_model=PaginatedApprovalChainResponse,
    summary="List all approval chains",
    description="Retrieves all approval chains with optional pagination and filters."
)
async def get_all_approval_chains(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1)"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page"),
    approvalChainStatus: Optional[str] = Query(None, description="Filter by approval chain status"),
    moduleId: Optional[str] = Query(None, description="Filter by module ID"),
    currentUnitId: Optional[str] = Query(None, description="Filter by current unit ID"),
    finalApprovalUnitId: Optional[str] = Query(None, description="Filter by final approval unit ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted records (isDelete=True)"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all approval chains with optional pagination and filters.

    This endpoint retrieves approval chain records with support for
    filtering by status, module, and units.

    **Query Parameters:**
    - `page` (optional): Page number starting from 1
    - `page_size` (optional): Items per page (1-1000)
    - `approvalChainStatus` (optional): Filter by status (e.g., Pending, Approved)
    - `moduleId` (optional): Filter by module ID
    - `currentUnitId` (optional): Filter by current unit ID
    - `finalApprovalUnitId` (optional): Filter by final approval unit ID
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Chain list fetched successfully"
    - `data`: Array of approval chain objects with populated nested data
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 400: Invalid ObjectId format
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        
        db = get_database()

        query = {}
        if not include_deleted:
            query["isDelete"] = False

        if approvalChainStatus:
            query["approvalChainStatus"] = approvalChainStatus

        if moduleId:
            if not ObjectId.is_valid(moduleId):
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_MODULE_ID,
                    parameters={"moduleId": moduleId},
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "module")

                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_MODULE_ID
                    )
                )
            query["moduleId"] = ObjectId(moduleId)

        if currentUnitId:
            if not ObjectId.is_valid(currentUnitId):
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_UNIT_ID,
                    parameters={"unitId": currentUnitId},
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "currentUnit")

                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_UNIT_ID
                    )
                )
            query["currentUnitId"] = ObjectId(currentUnitId)

        if finalApprovalUnitId:
            if not ObjectId.is_valid(finalApprovalUnitId):
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_UNIT_ID,
                    parameters={"unitId": finalApprovalUnitId},
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "finalApprovalUnit")

                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_UNIT_ID
                    )
                )
            query["finalApprovalUnitId"] = ObjectId(finalApprovalUnitId)

        total = await db[COLLECTION_NAME].count_documents(query)

        if page is not None and page_size is not None:
            skip = (page - 1) * page_size

            chains_list = await get_approval_chains_with_populated_data(db, query, skip=skip, limit=page_size)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.paginated(
                    data=chains_list,
                    total=total,
                    page=page,
                    page_size=page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
        else:
            chains_list = await get_approval_chains_with_populated_data(db, query)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.success(
                    data=chains_list,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME_PLURAL}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_CHAIN_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_CHAIN_LIST_FAILED
            )
        )


@router.get(
    "/get/{chain_id}",
    response_model=ApprovalChainResponseSchema,
    summary="Get approval chain by ID",
    description="Retrieves a single approval chain by its ID with populated nested objects."
)
async def get_approval_chain(
    chain_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get an approval chain by ID with populated nested objects.

    This endpoint retrieves a single approval chain with all related
    data populated (module, units, district, rank, approver).

    **Path Parameters:**
    - `chain_id` (required): MongoDB ObjectId of the approval chain

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Chain fetched successfully"
    - `data`: Approval chain object with populated fields:
      - `module`: Module name and ID
      - `currentUnit`: Current unit details
      - `finalApprovalUnit`: Final approval unit details
      - `district`: District details
      - `finalApprovalRank`: Rank details
      - `currentApprover`: Approver personnel details

    **Error Responses:**
    - 400: Invalid chain ID format
    - 403: Permission denied (READ permission required)
    - 404: Approval chain not found
    - 500: Internal server error
    """
    try:
        

        db = get_database()

        if not ObjectId.is_valid(chain_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID,
                parameters={"chainId": chain_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "chain")

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID
                )
            )

        object_id = ObjectId(chain_id)
        chain = await get_approval_chain_with_populated_data(db, object_id)

        if not chain:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_GET_NOT_FOUND,
                parameters={"chainId": chain_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ResponseBuilder.success(
                data=chain,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_CHAIN_GET_NOT_FOUND,
            parameters={"chainId": chain_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_CHAIN_GET_NOT_FOUND
            )
        )


@router.patch(
    "/update/{chain_id}",
    response_model=ApprovalChainResponseSchema,
    summary="Update an approval chain",
    description="Partially updates an approval chain with the provided fields."
)
async def update_approval_chain(
    chain_id: str,
    chain_update: ApprovalChainUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Partially update an approval chain. Only updates the fields that are provided.

    This endpoint uses PATCH semantics - only provided fields are updated.
    Use this to advance the approval chain, change status, or update approvers.

    **Path Parameters:**
    - `chain_id` (required): MongoDB ObjectId of the approval chain

    **Request Body (ApprovalChainUpdateSchema):**
    All fields are optional:
    - `currentUnitId`: New current unit
    - `currentApproverId`: New current approver
    - `approvalChainStatus`: New status
    - `transactionHistory`: Updated transaction history
    - Other fields as per schema

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Chain updated successfully"
    - `data`: Updated approval chain with populated fields

    **Error Responses:**
    - 400: Invalid chain ID or no fields to update
    - 403: Permission denied (UPDATE permission required)
    - 404: Approval chain not found or deleted
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with APPROVAL_CHAIN_UPDATED code
    - Records updatedIp from request
    """
    try:
        

        db = get_database()

        if not ObjectId.is_valid(chain_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.INVALID_ID, "chain")},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "chain")

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID
                )
            )

        object_id = ObjectId(chain_id)

        existing_chain = await db[COLLECTION_NAME].find_one({"_id": object_id, "isDelete": False})
        if not existing_chain:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_UPDATE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_UPDATE_NOT_FOUND
                )
            )

        update_data = chain_update.model_dump(exclude_unset=True, exclude={"updatedIp"})

        if not update_data:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_UPDATE_NO_FIELDS,
                parameters={"errorMessage": ErrorMessages.NO_FIELDS_TO_UPDATE},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.NO_FIELDS_TO_UPDATE

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_UPDATE_NO_FIELDS
                )
            )

        # Validate foreign keys if they are being updated (all commented out)
        # if any(key in update_data for key in ["moduleId", "currentUnitId", "currentApproverId",
        #                                        "finalApprovalUnitId", "finalApprovalRoleId", "districtId",
        #                                        "transactionHistory"]):
        #     temp_dict = {**existing_chain, **update_data}
        #     for field in ["moduleId", "currentUnitId", "currentApproverId", "finalApprovalUnitId",
        #                   "finalApprovalRoleId", "districtId"]:
        #         if field in temp_dict and isinstance(temp_dict[field], ObjectId):
        #             temp_dict[field] = str(temp_dict[field])
        #
        #     if "transactionHistory" in temp_dict and temp_dict["transactionHistory"]:
        #         for transaction in temp_dict["transactionHistory"]:
        #             if "unitId" in transaction and isinstance(transaction["unitId"], ObjectId):
        #                 transaction["unitId"] = str(transaction["unitId"])
        #             if "userId" in transaction and isinstance(transaction["userId"], ObjectId):
        #                 transaction["userId"] = str(transaction["userId"])
        #
        #     await validate_approval_chain_foreign_keys(db, temp_dict)

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        # Set audit fields
        update_data["updatedBy"] = ObjectId(current_user.id)
        update_data["updatedAt"] = get_ist_now()
        update_data["updatedIp"] = client_ip

        # Convert string IDs to ObjectId
        for field in ["moduleId", "requestId", "currentUnitId", "currentApproverId", "finalApprovalUnitId",
                      "finalApprovalRankId", "districtId"]:
            if field in update_data and update_data[field]:
                update_data[field] = ObjectId(update_data[field])

        if "transactionHistory" in update_data and update_data["transactionHistory"]:
            for transaction in update_data["transactionHistory"]:
                if transaction.get("unitId"):
                    transaction["unitId"] = ObjectId(transaction["unitId"])
                if transaction.get("userId"):
                    transaction["userId"] = ObjectId(transaction["userId"])

        await db[COLLECTION_NAME].update_one({"_id": object_id}, {"$set": update_data})

        updated_chain = await get_approval_chain_with_populated_data(db, object_id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.APPROVAL_CHAIN_UPDATED,
            json_values={
                "approvalChainId": chain_id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ResponseBuilder.success(
                data=updated_chain,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_CHAIN_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_CHAIN_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{chain_id}",
    summary="Soft delete an approval chain",
    description="Performs a soft delete on an approval chain by setting isDelete=True."
)
async def delete_approval_chain(
    chain_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete an approval chain by setting isDelete=True.

    This endpoint performs a soft delete. The record remains in the
    database but is excluded from normal queries.

    **Path Parameters:**
    - `chain_id` (required): MongoDB ObjectId of the approval chain

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Chain deleted successfully"

    **Error Responses:**
    - 400: Invalid chain ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Approval chain not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=True
    - Logs transaction with APPROVAL_CHAIN_DELETED code
    - Records updatedIp from request
    """
    try:
        

        db = get_database()

        if not ObjectId.is_valid(chain_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.INVALID_ID, "chain")},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "chain")

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID
                )
            )

        object_id = ObjectId(chain_id)

        existing_chain = await db[COLLECTION_NAME].find_one({"_id": object_id, "isDelete": False})
        if not existing_chain:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_DELETE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_DELETE_NOT_FOUND
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
            log_code=LogCodes.APPROVAL_CHAIN_DELETED,
            json_values={
                "approvalChainId": chain_id,
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
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_CHAIN_DELETE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_CHAIN_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{chain_id}",
    summary="Restore a deleted approval chain",
    description="Restores a soft-deleted approval chain by setting isDelete=False."
)
async def restore_approval_chain(
    chain_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted approval chain by setting isDelete=False.

    This endpoint restores a previously soft-deleted approval chain,
    making it active and visible in normal queries again.

    **Path Parameters:**
    - `chain_id` (required): MongoDB ObjectId of the approval chain

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Chain restored successfully"

    **Error Responses:**
    - 400: Invalid chain ID or chain not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Approval chain not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=False
    - Logs transaction with APPROVAL_CHAIN_RESTORED code
    - Records updatedIp from request
    """
    try:

        db = get_database()

        if not ObjectId.is_valid(chain_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.INVALID_ID, "chain")},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "chain")

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_ID
                )
            )

        object_id = ObjectId(chain_id)

        existing_chain = await db[COLLECTION_NAME].find_one({"_id": object_id})
        if not existing_chain:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_RESTORE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_RESTORE_NOT_FOUND
                )
            )

        if not existing_chain.get("isDelete", False):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_ALREADY_ACTIVE,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_ALREADY_ACTIVE
                )
            )

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        await db[COLLECTION_NAME].update_one(
            {"_id": object_id},
            {
                "$set": {
                    "isDelete": False,
                    "updatedBy": ObjectId(current_user.id),
                    "updatedAt": get_ist_now(),
                    "updatedIp": client_ip
                }
            }
        )

        # Log successful restore
        await log_transaction(
            request=request,
            log_code=LogCodes.APPROVAL_CHAIN_RESTORED,
            json_values={
                "approvalChainId": chain_id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=ResponseBuilder.success(
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_CHAIN_RESTORE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_CHAIN_RESTORE_FAILED
            )
        )


# @router.get("/get/pending/by-module/{module_id}", response_model=PaginatedApprovalChainResponse)
# async def get_pending_approval_chains_by_module(
#     module_id: str,
#     page: Optional[int] = Query(None, ge=1, description="Page number"),
#     page_size: Optional[int] = Query(None, ge=1, le=1000, description="Items per page"),
#     include_deleted: bool = Query(False, description="Include soft-deleted records"),
#     current_user: TokenDataSchema = Depends(get_current_user)
# ):
#     """
#     Get all pending approval chains filtered by module ID
#     """
#     db = get_database()
#
#     try:
#         module_object_id = ObjectId(module_id)
#     except:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail=get_validation_error("invalid_objectid", field_name="module_id")
#         )
#
#     query = {
#         "moduleId": module_object_id,
#         "approvalChainStatus": "Pending"
#     }
#
#     if not include_deleted:
#         query["isDelete"] = False
#
#     total = await db[COLLECTION_NAME].count_documents(query)
#
#     if page is not None:
#         actual_page_size = page_size if page_size is not None else 10
#         skip = (page - 1) * actual_page_size
#         total_pages = (total + actual_page_size - 1) // actual_page_size
#
#         chains_list = await get_approval_chains_with_populated_data(db, query, skip=skip, limit=actual_page_size)
#
#         return {
#             "data": chains_list,
#             "total": total,
#             "page": page,
#             "page_size": actual_page_size,
#             "total_pages": total_pages
#         }
#     else:
#         chains_list = await get_approval_chains_with_populated_data(db, query)
#
#         return {
#             "data": chains_list,
#             "total": total,
#             "page": 1,
#             "page_size": total,
#             "total_pages": 1
#         }


@router.get(
    "/get/pending/by-user-module-district/{module_id}",
    response_model=PaginatedApprovalChainResponse,
    summary="Get pending approval chains for current user",
    description="Returns approval chains pending for the logged-in user filtered by module and district."
)
async def get_approval_chains_by_user_module_district(
    module_id: str,
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Items per page"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get approval chains filtered by current user ID, module ID, and district ID.

    This endpoint returns pending approval chains where the logged-in user
    is the current approver. Useful for showing a user's pending approvals.

    **Path Parameters:**
    - `module_id` (required): MongoDB ObjectId of the module

    **Query Parameters:**
    - `page` (optional): Page number starting from 1
    - `page_size` (optional): Items per page (1-1000)
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Filters Applied Automatically:**
    - `currentApproverId`: From JWT token (logged-in user)
    - `districtId`: From JWT token
    - `approvalChainStatus`: Contains "Pending" (case-insensitive)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Approval Chain list fetched successfully"
    - `data`: Array of pending approval chain objects
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 400: Invalid module ID or district ID not in token
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        

        db = get_database()

        # Validate moduleId
        if not ObjectId.is_valid(module_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_MODULE_ID,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.INVALID_ID, "module")},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "module")

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_INVALID_MODULE_ID
                )
            )
        module_object_id = ObjectId(module_id)

        # Get districtId from token
        district_id = current_user.districtId
        if not district_id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.APPROVAL_CHAIN_MISSING_DISTRICT_ID,
                parameters={"errorMessage": "District ID not found in token"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "District ID not found in token"

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.APPROVAL_CHAIN_MISSING_DISTRICT_ID
                )
            )

        # Build query with user ID, module ID, district ID and status containing "Pending" (case-insensitive)
        query = {
            "currentApproverId": ObjectId(current_user.id),
            "moduleId": module_object_id,
            "districtId": ObjectId(district_id),
            "approvalChainStatus": {"$regex": "pending", "$options": "i"}
        }

        if not include_deleted:
            query["isDelete"] = False

        total = await db[COLLECTION_NAME].count_documents(query)

        if page is not None and page_size is not None:
            skip = (page - 1) * page_size

            chains_list = await get_approval_chains_with_populated_data(db, query, skip=skip, limit=page_size)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.paginated(
                    data=chains_list,
                    total=total,
                    page=page,
                    page_size=page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
        else:
            chains_list = await get_approval_chains_with_populated_data(db, query)

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=ResponseBuilder.success(
                    data=chains_list,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME_PLURAL} by user/module/district")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.APPROVAL_CHAIN_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.APPROVAL_CHAIN_LIST_FAILED
            )
        )
