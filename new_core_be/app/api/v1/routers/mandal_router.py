"""
Mandal Router
Provides API endpoints for Mandal management
Routes: /api/v1/mandals
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

from app.api.v1.schemas.mandal_schema import (
    MandalCreateSchema,
    MandalUpdateSchema,
    MandalResponseSchema
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
from app.constants.log_codes import LogCodes
from app.constants.jobs import Jobs
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip
from app.api.v1.services.mandal_service import (
    create_mandal,
    update_mandal,
    delete_mandal,
    restore_mandal,
    get_mandal,
    list_mandals
)
from app.api.v1.services.hierarchy_access_service import HierarchyAccessService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/mandals", tags=["mandals"])

# Job name for RBAC permission checks (from centralized constants)
JOB_NAME = Jobs.MANDALS
MODULE_PREFIX = ModulePrefixes.MANDAL
ENTITY_NAME = "Mandal"
ENTITY_NAME_PLURAL = "Mandals"


class PaginatedMandalResponse(BaseModel):
    """Paginated response model for mandals list"""
    data: List[MandalResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new mandal",
    description="Creates a new mandal (sub-district administrative unit) with district association."
)
async def create_mandal_endpoint(
    mandal: MandalCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new mandal record.

    This endpoint creates a new mandal (sub-district administrative unit)
    that is associated with a district.

    **Request Body (MandalCreateSchema):**
    - `mandalName` (required): Name of the mandal
    - `districtId` (required): FK reference to district collection
    - `description` (optional): Description of the mandal

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Mandal created successfully"
    - `data`: Created mandal object with all fields

    **Error Responses:**
    - 400: Validation error (invalid data, missing required fields)
    - 403: Permission denied (CREATE permission required)
    - 409: Conflict (duplicate mandal name in district)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with MANDAL_CREATED code
    - Records createdIp from request
    """
    try:
       

        # Get client IP and add to mandal data
        client_ip = get_client_ip(request)
        mandal_data = mandal.model_dump()
        mandal_data["createdIp"] = client_ip

        result = await create_mandal(mandal_data, current_user.id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.MANDAL_CREATED,
            json_values={
                "mandalId": result.get("_id", ""),
                "mandalName": result.get("mandalName", ""),
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
            error_code=ErrorCodes.MANDAL_CREATE_FAILED,
            parameters={"mandalName": mandal.mandalName, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_CREATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_CREATE_FAILED,
            parameters={"mandalName": mandal.mandalName, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.MANDAL_CREATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MANDAL_CREATE_FAILED,
            parameters={"mandalName": mandal.mandalName, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all mandals",
    description="Retrieves all mandals with optional pagination, search, and filters. Results are filtered based on user's unit hierarchy."
)
async def get_all_mandals_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    search: Optional[str] = Query(None, description="Search in mandalName"),
    districtId: Optional[str] = Query(None, description="Filter by district ID"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all mandals with optional pagination, filters, and hierarchy-based access control.

    Results are automatically filtered based on the user's assigned unit hierarchy:
    - If user's unit has NO parent (top-level): Returns ALL mandals (no restrictions)
    - If user's unit has parent: Returns only mandals with villages mapped to accessible units

    Returns all mandals with support for pagination, search, and
    district filtering. By default excludes soft-deleted records.

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `search` (optional): Search in mandalName field
    - `districtId` (optional): Filter by district ID (FK: district._id)
    - `page` (optional): Page number starting from 1. If not provided, returns all
    - `page_size` (optional): Records per page (1-1000). Only used when page is provided

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Mandal list fetched successfully"
    - `data`: Array of mandal objects (filtered by hierarchy)
    - `pagination`: Pagination metadata (totalItems, page, pageSize, totalPages)

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        

        # Get accessible unit IDs based on user's hierarchy
        accessible_unit_ids = await HierarchyAccessService.get_accessible_unit_ids(
            user_unit_id=current_user.unitId,
            district_id=current_user.districtId,
            include_deleted=include_deleted
        )

        # Debug: Print accessible unit IDs count
        # If accessible_unit_ids is None (top-level user), no hierarchy filtering but still respect districtId query param
        if accessible_unit_ids is None:
            print(f"[MANDALS LIST] User {current_user.id} - Top-level unit (no parent) - No hierarchy filtering, districtId filter: {districtId}")
        else:
            print(f"[MANDALS LIST] User {current_user.id} - Accessible unit IDs count: {len(accessible_unit_ids)}")

        # Call list_mandals with the query param districtId (can be None if not provided)
        # Top-level users (accessible_unit_ids=None): No hierarchy filtering, but districtId query param is respected if provided
        # Non-top-level users: Filter by accessible units AND optional districtId query param
        mandals_list, total = await list_mandals(
            include_deleted=include_deleted,
            search=search,
            district_id=districtId,  # Respect districtId query param for all users
            page=page,
            page_size=page_size,
            accessible_unit_ids=accessible_unit_ids  # None = no hierarchy filtering, List = filter by villages
        )

        # Debug: Print result count
        print(f"[MANDALS LIST] Total mandals returned: {total}, Data count: {len(mandals_list)}")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=mandals_list,
                total=total,
                page=page,
                page_size=page_size,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(status_code=e.status_code, detail=error_message)
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MANDAL_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_LIST_FAILED
            )
        )


@router.get(
    "/get/{mandal_id}",
    summary="Get mandal by ID",
    description="Retrieves a single mandal by its ID, including soft-deleted records."
)
async def get_mandal_endpoint(
    mandal_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a mandal record by ID (includes soft-deleted records).

    Retrieves complete mandal details including all fields and metadata.
    This endpoint returns soft-deleted records to allow viewing
    historical data.

    **Path Parameters:**
    - `mandal_id` (required): MongoDB ObjectId of the mandal

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Mandal fetched successfully"
    - `data`: Mandal object with all fields including:
      - `_id`: Mandal ID
      - `mandalName`: Mandal name
      - `districtId`: FK to district
      - `description`: Optional description
      - `isActive`, `isDelete`: Status flags
      - Audit fields (createdBy, updatedBy, timestamps)

    **Error Responses:**
    - 400: Invalid mandal ID format
    - 403: Permission denied (READ permission required)
    - 404: Mandal not found
    - 500: Internal server error
    """
    try:
        

        if not ObjectId.is_valid(mandal_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MANDAL_GET_NOT_FOUND,
                parameters={"mandalId": mandal_id, "errorMessage": "Invalid mandal ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MANDAL_GET_NOT_FOUND
                )
            )

        mandal = await get_mandal(mandal_id)

        if not mandal:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MANDAL_GET_NOT_FOUND,
                parameters={"mandalId": mandal_id, "errorMessage": "Mandal not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.MANDAL_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=mandal,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_GET_NOT_FOUND,
            parameters={"mandalId": mandal_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MANDAL_GET_NOT_FOUND,
            parameters={"mandalId": mandal_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_GET_NOT_FOUND
            )
        )


@router.put(
    "/update/{mandal_id}",
    summary="Update a mandal",
    description="Updates an existing mandal record with the provided fields."
)
async def update_mandal_endpoint(
    mandal_id: str,
    mandal_update: MandalUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update a mandal record.

    Updates an existing mandal with the provided fields.
    Only fields included in the request body are updated.

    **Path Parameters:**
    - `mandal_id` (required): MongoDB ObjectId of the mandal to update

    **Request Body (MandalUpdateSchema):**
    All fields are optional - only provided fields are updated:
    - `mandalName`: Mandal name
    - `districtId`: FK to district
    - `description`: Mandal description
    - `isActive`: Active status flag

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Mandal updated successfully"
    - `data`: Updated mandal object

    **Error Responses:**
    - 400: Validation error (invalid mandal ID, invalid data)
    - 403: Permission denied (UPDATE permission required)
    - 404: Mandal not found
    - 409: Conflict (duplicate mandal name in district)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with MANDAL_UPDATED code
    - Records updatedIp from request
    """
    try:
        
        if not ObjectId.is_valid(mandal_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
                parameters={"mandalId": mandal_id, "errorMessage": "Invalid mandal ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MANDAL_UPDATE_FAILED
                )
            )

        # Get client IP and add to update data
        client_ip = get_client_ip(request)
        update_data = mandal_update.model_dump(exclude_unset=True)
        update_data["updatedIp"] = client_ip

        result = await update_mandal(mandal_id, update_data, current_user.id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.MANDAL_UPDATED,
            json_values={
                "mandalId": mandal_id,
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
            error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
            parameters={"mandalId": mandal_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_NOT_FOUND,
            parameters={"mandalId": mandal_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.MANDAL_UPDATE_NOT_FOUND
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
            parameters={"mandalId": mandal_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{mandal_id}",
    summary="Soft delete a mandal",
    description="Performs a soft delete on a mandal by setting isDeleted=true."
)
async def delete_mandal_endpoint(
    mandal_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a mandal record.

    This endpoint performs a soft delete by setting isDelete=true and
    isActive=false. The record remains in the database but is excluded
    from normal queries.

    **Path Parameters:**
    - `mandal_id` (required): MongoDB ObjectId of the mandal to delete

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Mandal deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid mandal ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Mandal not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=true, isActive=false
    - Logs transaction with MANDAL_DELETED code
    - Records deletedIp from request
    """
    try:
        

        if not ObjectId.is_valid(mandal_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MANDAL_DELETE_FAILED,
                parameters={"mandalId": mandal_id, "errorMessage": "Invalid mandal ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MANDAL_DELETE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await delete_mandal(mandal_id, current_user.id, client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.MANDAL_DELETED,
            json_values={
                "mandalId": mandal_id,
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
            error_code=ErrorCodes.MANDAL_DELETE_FAILED,
            parameters={"mandalId": mandal_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_DELETE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_DELETE_NOT_FOUND,
            parameters={"mandalId": mandal_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=error_message,
                error_code=ErrorCodes.MANDAL_DELETE_NOT_FOUND
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MANDAL_DELETE_FAILED,
            parameters={"mandalId": mandal_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{mandal_id}",
    summary="Restore a deleted mandal",
    description="Restores a soft-deleted mandal by setting isDeleted=false and isActive=true."
)
async def restore_mandal_endpoint(
    mandal_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted mandal record.

    This endpoint restores a previously soft-deleted mandal, making it
    active and visible in normal queries again.

    **Path Parameters:**
    - `mandal_id` (required): MongoDB ObjectId of the mandal to restore

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Mandal restored successfully"
    - `data`: null

    **Error Responses:**
    - 400: Validation error (invalid mandal ID, mandal already active)
    - 403: Permission denied (UPDATE permission required)
    - 404: Mandal not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=false, isActive=true
    - Logs transaction with MANDAL_RESTORED code
    - Records restoredIp from request
    """
    try:
        if not ObjectId.is_valid(mandal_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
                parameters={"mandalId": mandal_id, "errorMessage": "Invalid mandal ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MANDAL_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await restore_mandal(mandal_id, current_user.id, client_ip)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.MANDAL_RESTORED,
            json_values={
                "mandalId": mandal_id,
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
            error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
            parameters={"mandalId": mandal_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_NOT_FOUND,
            parameters={"mandalId": mandal_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.MANDAL_UPDATE_NOT_FOUND
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MANDAL_UPDATE_FAILED,
            parameters={"mandalId": mandal_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MANDAL_UPDATE_FAILED
            )
        )
