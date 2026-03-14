"""
RankMaster Router
Provides API endpoints for RankMaster management
Routes: /api/v1/ranks
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

from app.api.v1.schemas.rank_master_schema import (
    RankMasterCreateSchema,
    RankMasterUpdateSchema,
    RankMasterResponseSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import (
    ResponseBuilder,
    api_success,
    api_created,
    api_paginated
)
from app.constants.api_constants import (
    SuccessMessages,
    ErrorMessages,
    PermissionMessages,
    ModulePrefixes
)
from app.constants.error_codes import ErrorCodes
from app.constants.jobs import Jobs
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.services.rank_master_service import (
    create_rank,
    update_rank,
    delete_rank,
    restore_rank,
    get_rank,
    list_ranks
)
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/ranks",
    tags=["ranks"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication token"},
        403: {"description": "Forbidden - Insufficient permissions"},
        500: {"description": "Internal Server Error"}
    }
)

# Job name for RBAC permission checks (from centralized constants)
JOB_NAME = Jobs.RANK
MODULE_PREFIX = ModulePrefixes.RANK
ENTITY_NAME = "Rank"
ENTITY_NAME_PLURAL = "Ranks"


class PaginatedRankMasterResponse(BaseModel):
    """Paginated response model for ranks list"""
    data: List[RankMasterResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new rank",
    description="Creates a new rank record in the system. Requires CREATE permission on the RANK job."
)
async def create_rank_endpoint(
    rank: RankMasterCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new rank record in the system.

    This endpoint creates a new rank with the provided details. The rank name must be unique
    and follow the validation rules (alphabets, spaces, hyphens, underscores only, minimum 2 alphabets).

    **Request Body Parameters:**
    - **name** (str, required): Rank name - alphabets, spaces, hyphens, underscores only, min 2 alphabets, max 100 chars
    - **cctnsRankCd** (int, required): CCTNS Rank Code - integer between 0 and 999999
    - **shortCode** (str, optional): Short code for the rank, max 20 chars

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Rank created successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "cctnsRankCd": 0,
            "shortCode": "string",
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string",
            "isActive": true,
            "isDelete": false
        },
        "code": 201
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid input data or validation error (e.g., invalid name format, duplicate rank)
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks CREATE permission on RANK job
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as createdIp
    - Logs transaction with RANK_CREATED log code on success
    - Logs error with RANK_CREATE_FAILED error code on failure

    **Required Permission:** CREATE on RANK job
    """
    try:


        # Get client IP and set in data
        rank_data = rank.model_dump()
        client_ip = get_client_ip(request)
        rank_data["createdIp"] = client_ip

        result = await create_rank(rank_data, current_user.id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.RANK_CREATED,
            json_values={
                "rankId": result.get("_id", ""),
                "name": result.get("name", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(
                data=result,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.RANK_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.RANK_CREATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.RANK_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.RANK_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.RANK_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.RANK_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all ranks",
    description="Retrieves a paginated list of all ranks with optional filtering. Requires READ permission on the RANK job."
)
async def get_all_ranks_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    search: Optional[str] = Query(None, description="Search in name, cctnsRankCd, or shortCode"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all ranks with optional pagination and filters.

    This endpoint retrieves all rank records from the database with support for
    pagination, search filtering, and inclusion of soft-deleted records.

    **Query Parameters:**
    - **include_deleted** (bool, optional, default=False): When true, includes soft-deleted records in results
    - **search** (str, optional): Search term to filter ranks by name, cctnsRankCd, or shortCode (case-insensitive)
    - **page** (int, optional, min=1): Page number for pagination. If not provided, returns all records
    - **page_size** (int, optional, min=1, max=1000): Number of records per page. Required if page is specified

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Rank list fetched successfully",
        "data": [
            {
                "_id": "string",
                "name": "string",
                "cctnsRankCd": 0,
                "shortCode": "string",
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string",
                "isActive": true,
                "isDelete": false
            }
        ],
        "total": 100,
        "page": 1,
        "page_size": 10,
        "total_pages": 10,
        "code": 200
    }
    ```

    **Error Responses:**
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks READ permission on RANK job
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Logs error with RANK_LIST_FAILED error code on failure

    **Required Permission:** READ on RANK job
    """
    try:


        ranks_list, total = await list_ranks(
            include_deleted=include_deleted,
            search=search,
            page=page,
            page_size=page_size
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=ranks_list,
                total=total,
                page=page,
                page_size=page_size,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.RANK_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.RANK_LIST_FAILED
            )
        )


@router.get(
    "/get/{rank_id}",
    summary="Get a rank by ID",
    description="Retrieves a single rank record by its ID. Includes soft-deleted records. Requires READ permission on the RANK job."
)
async def get_rank_endpoint(
    rank_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a rank by ID (includes soft-deleted records).

    This endpoint retrieves a single rank record using its unique identifier.
    It will return the record even if it has been soft-deleted.

    **Path Parameters:**
    - **rank_id** (str, required): The unique MongoDB ObjectId of the rank to retrieve

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Rank fetched successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "cctnsRankCd": 0,
            "shortCode": "string",
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string",
            "updatedBy": "string",
            "updatedAt": "datetime",
            "updatedIp": "string",
            "isActive": true,
            "isDelete": false
        },
        "code": 200
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid rank ID format (not a valid MongoDB ObjectId)
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks READ permission on RANK job
    - **404 Not Found**: Rank with the specified ID does not exist
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Logs error with RANK_GET_NOT_FOUND error code on failure

    **Required Permission:** READ on RANK job
    """
    try:


        if not ObjectId.is_valid(rank_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.RANK_GET_NOT_FOUND,
                parameters={"errorMessage": f"Invalid rank ID: {rank_id}"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.RANK_GET_NOT_FOUND
                )
            )

        rank = await get_rank(rank_id)

        if not rank:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.RANK_GET_NOT_FOUND,
                parameters={"errorMessage": f"Rank with ID '{rank_id}' not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.RANK_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=rank,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.RANK_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.RANK_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.RANK_GET_NOT_FOUND,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.RANK_GET_NOT_FOUND
            )
        )


@router.put(
    "/update/{rank_id}",
    summary="Update a rank",
    description="Updates an existing rank record with the provided data. Requires UPDATE permission on the RANK job."
)
async def update_rank_endpoint(
    rank_id: str,
    rank_update: RankMasterUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update a rank record.

    This endpoint updates an existing rank with the provided data. Only the fields
    that are included in the request body will be updated (partial update supported).
    Cannot update a soft-deleted rank.

    **Path Parameters:**
    - **rank_id** (str, required): The unique MongoDB ObjectId of the rank to update

    **Request Body Parameters:**
    - **name** (str, optional): New rank name - alphabets, spaces, hyphens, underscores only, min 2 alphabets, max 100 chars
    - **cctnsRankCd** (int, optional): New CCTNS Rank Code - integer between 0 and 999999
    - **shortCode** (str, optional): New short code for the rank, max 20 chars

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Rank updated successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "cctnsRankCd": 0,
            "shortCode": "string",
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string",
            "updatedBy": "string",
            "updatedAt": "datetime",
            "updatedIp": "string",
            "isActive": true,
            "isDelete": false
        },
        "code": 200
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid rank ID format, invalid input data, or validation error
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks UPDATE permission on RANK job
    - **404 Not Found**: Rank with the specified ID does not exist or is soft-deleted
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as updatedIp
    - Updates updatedBy field with current user ID
    - Updates updatedAt timestamp
    - Logs transaction with RANK_UPDATED log code on success
    - Logs error with RANK_UPDATE_FAILED or RANK_UPDATE_NOT_FOUND error code on failure

    **Required Permission:** UPDATE on RANK job
    """
    try:

        if not ObjectId.is_valid(rank_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.RANK_UPDATE_FAILED,
                parameters={"errorMessage": f"Invalid rank ID: {rank_id}"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.RANK_UPDATE_FAILED
                )
            )

        # Get client IP and set in update data
        update_data = rank_update.model_dump(exclude_unset=True)
        client_ip = get_client_ip(request)
        update_data["updatedIp"] = client_ip

        result = await update_rank(rank_id, update_data, current_user.id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.RANK_UPDATED,
            json_values={
                "rankId": rank_id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=result,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.RANK_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_code = ErrorCodes.RANK_UPDATE_NOT_FOUND if "not found" in str(e).lower() else ErrorCodes.RANK_UPDATE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=error_code
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.RANK_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{rank_id}",
    summary="Delete a rank",
    description="Soft deletes a rank record by setting isDelete flag to true. Requires DELETE permission on the RANK job."
)
async def delete_rank_endpoint(
    rank_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a rank record.

    This endpoint performs a soft delete on a rank record by setting its isDelete
    flag to true. The record remains in the database but will not appear in normal
    list queries unless include_deleted=true is specified. Soft-deleted records
    can be restored using the restore endpoint.

    **Path Parameters:**
    - **rank_id** (str, required): The unique MongoDB ObjectId of the rank to delete

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Rank deleted successfully",
        "data": null,
        "code": 200
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid rank ID format (not a valid MongoDB ObjectId)
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks DELETE permission on RANK job
    - **404 Not Found**: Rank with the specified ID does not exist or is already deleted
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as deletedIp
    - Sets deletedBy field with current user ID
    - Sets deletedAt timestamp
    - Sets isDelete flag to true
    - Logs transaction with RANK_DELETED log code on success
    - Logs error with RANK_DELETE_FAILED or RANK_DELETE_NOT_FOUND error code on failure

    **Required Permission:** DELETE on RANK job
    """
    try:

        if not ObjectId.is_valid(rank_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.RANK_DELETE_FAILED,
                parameters={"errorMessage": f"Invalid rank ID: {rank_id}"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.RANK_DELETE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await delete_rank(rank_id, current_user.id, deleted_ip=client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.RANK_DELETED,
            json_values={
                "rankId": rank_id,
                "deletedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.RANK_DELETE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.RANK_DELETE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_code = ErrorCodes.RANK_DELETE_NOT_FOUND if "not found" in str(e).lower() else ErrorCodes.RANK_DELETE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=error_message,
                error_code=error_code
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.RANK_DELETE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.RANK_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{rank_id}",
    summary="Restore a deleted rank",
    description="Restores a soft-deleted rank record by setting isDelete flag to false. Requires UPDATE permission on the RANK job."
)
async def restore_rank_endpoint(
    rank_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted rank record.

    This endpoint restores a previously soft-deleted rank record by setting its
    isDelete flag back to false. The record will then appear in normal list queries
    again. Only records that have been soft-deleted can be restored.

    **Path Parameters:**
    - **rank_id** (str, required): The unique MongoDB ObjectId of the rank to restore

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Rank restored successfully",
        "data": null,
        "code": 200
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid rank ID format, or rank is not soft-deleted
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks UPDATE permission on RANK job
    - **404 Not Found**: Rank with the specified ID does not exist
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as restoredIp
    - Sets restoredBy field with current user ID
    - Sets restoredAt timestamp
    - Sets isDelete flag to false
    - Clears deletedBy, deletedAt, deletedIp fields
    - Logs transaction with RANK_RESTORED log code on success
    - Logs error with RANK_UPDATE_FAILED error code on failure

    **Required Permission:** UPDATE on RANK job

    **Note:** This endpoint requires UPDATE permission as restoring is considered
    a modification operation on the record.
    """
    try:

        if not ObjectId.is_valid(rank_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.RANK_UPDATE_FAILED,
                parameters={"errorMessage": f"Invalid rank ID: {rank_id}"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.RANK_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await restore_rank(rank_id, current_user.id, restored_ip=client_ip)

        # Log successful restore
        await log_transaction(
            request=request,
            log_code=LogCodes.RANK_RESTORED,
            json_values={
                "rankId": rank_id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.RANK_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.RANK_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.RANK_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.RANK_UPDATE_FAILED
            )
        )
