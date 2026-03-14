"""
District Router
Provides API endpoints for District management
Routes: /api/v1/districts
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

from app.api.v1.schemas.district_schema import (
    DistrictCreateSchema,
    DistrictUpdateSchema,
    DistrictResponseSchema
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
from app.api.v1.services.log_logger import log_transaction
from app.constants.log_codes import LogCodes
from app.api.v1.utils.request_helpers import get_client_ip
from app.api.v1.services.district_service import (
    create_district,
    update_district,
    delete_district,
    restore_district,
    get_district,
    list_districts
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/districts", tags=["districts"])

# Job name for RBAC permission checks (from centralized constants)
JOB_NAME = Jobs.DISTRICT
MODULE_PREFIX = ModulePrefixes.DISTRICT
ENTITY_NAME = "District"
ENTITY_NAME_PLURAL = "Districts"


class PaginatedDistrictResponse(BaseModel):
    """Paginated response model for districts list"""
    data: List[DistrictResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new district",
    description="Creates a new district record with the provided details."
)
async def create_district_endpoint(
    district: DistrictCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new district record.

    This endpoint creates a new district with validation for uniqueness
    on cctnsDistrictCd field.

    **Request Body (DistrictCreateSchema):**
    - `name` (required): District name
    - `cctnsDistrictCd` (required): Unique CCTNS district code
    - `stateName` (optional): State name
    - `isActive` (optional): Active status (default: true)

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "District created successfully"
    - `data`: Created district object with _id and audit fields

    **Error Responses:**
    - 400: Validation error
    - 403: Permission denied (CREATE permission required)
    - 409: Conflict (duplicate name or cctnsDistrictCd)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with DISTRICT_CREATED code
    """
    try:

        # Get client IP
        client_ip = get_client_ip(request)

        # Prepare district data with IP
        district_data = district.model_dump()
        district_data["createdIp"] = client_ip

        result = await create_district(district_data, current_user.id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.DISTRICT_CREATED,
            json_values={
                "districtId": result.get("_id", ""),
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
            error_code=ErrorCodes.DISTRICT_CREATE_FAILED,
            parameters={"name": district.name, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_CREATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_CREATE_FAILED,
            parameters={"name": district.name, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_CREATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.DISTRICT_CREATE_FAILED,
            parameters={"name": district.name, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    status_code=status.HTTP_200_OK,
    summary="List all districts",
    description="Retrieves a paginated list of districts with optional filters."
)
async def get_all_districts_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    is_active: Optional[bool] = Query(True, description="Filter by active status (true=active only, false=inactive only, null=all)"),
    search: Optional[str] = Query(None, description="Search in name, cctnsDistrictCd, stateName"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all districts with optional pagination and filters.

    This endpoint retrieves district records with support for searching,
    filtering, and pagination.

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `is_active` (optional): Filter by active status (default: true for active only)
    - `search` (optional): Search in name, cctnsDistrictCd, stateName (case-insensitive)
    - `page` (optional): Page number (1-indexed), omit for all records
    - `page_size` (optional): Records per page (1-1000)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "District list fetched successfully"
    - `data`: Array of district objects
    - `total`: Total count of matching records
    - `page`: Current page number
    - `page_size`: Records per page
    - `total_pages`: Total number of pages

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:


        districts_list, total = await list_districts(
            include_deleted=include_deleted,
            is_active=is_active,
            search=search,
            page=page,
            page_size=page_size
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=districts_list,
                total=total,
                page=page,
                page_size=page_size,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(status_code=e.status_code, detail=error_message)
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.DISTRICT_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_LIST_FAILED
            )
        )


@router.get(
    "/get/{district_id}",
    status_code=status.HTTP_200_OK,
    summary="Get district by ID",
    description="Retrieves a single district record by its ObjectId."
)
async def get_district_endpoint(
    district_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a district record by ID.

    This endpoint retrieves a single district record including soft-deleted
    records to allow viewing of archived data.

    **Path Parameters:**
    - `district_id` (required): District ObjectId

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "District fetched successfully"
    - `data`: District object with all fields

    **Error Responses:**
    - 400: Invalid district ID format
    - 403: Permission denied (READ permission required)
    - 404: District not found
    - 500: Internal server error
    """
    try:


        if not ObjectId.is_valid(district_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND,
                parameters={"districtId": district_id, "errorMessage": "Invalid district ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND
                )
            )

        district = await get_district(district_id)

        if not district:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND,
                parameters={"districtId": district_id, "errorMessage": "District not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=district,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND,
            parameters={"districtId": district_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND,
            parameters={"districtId": district_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_GET_NOT_FOUND
            )
        )


@router.put(
    "/update/{district_id}",
    status_code=status.HTTP_200_OK,
    summary="Update a district",
    description="Updates an existing district record with the provided fields."
)
async def update_district_endpoint(
    district_id: str,
    district_update: DistrictUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update a district record.

    This endpoint updates an existing district with partial data.
    Only provided fields are updated.

    **Path Parameters:**
    - `district_id` (required): District ObjectId to update

    **Request Body (DistrictUpdateSchema):**
    - `name` (optional): New district name
    - `cctnsDistrictCd` (optional): New CCTNS district code
    - `stateName` (optional): New state name
    - `isActive` (optional): New active status

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "District updated successfully"
    - `data`: Updated district object

    **Error Responses:**
    - 400: Validation error or invalid ID format
    - 403: Permission denied (UPDATE permission required)
    - 404: District not found
    - 409: Conflict (duplicate name or cctnsDistrictCd)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with DISTRICT_UPDATED code
    """
    try:


        if not ObjectId.is_valid(district_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
                parameters={"districtId": district_id, "errorMessage": "Invalid district ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.DISTRICT_UPDATE_FAILED
                )
            )

        # Get client IP and add to update data
        client_ip = get_client_ip(request)
        update_data = district_update.model_dump(exclude_unset=True)
        update_data["updatedIp"] = client_ip

        result = await update_district(district_id, update_data, current_user.id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.DISTRICT_UPDATED,
            json_values={
                "districtId": district_id,
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
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"districtId": district_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_NOT_FOUND,
            parameters={"districtId": district_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_UPDATE_NOT_FOUND
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"districtId": district_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{district_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a district",
    description="Soft deletes a district record by setting isDelete=true."
)
async def delete_district_endpoint(
    district_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a district record.

    This endpoint performs a soft delete by setting isDelete=true and
    isActive=false. The record remains in the database but is excluded
    from normal queries.

    **Path Parameters:**
    - `district_id` (required): District ObjectId to delete

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "District deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid district ID format
    - 403: Permission denied (DELETE permission required)
    - 404: District not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with DISTRICT_DELETED code
    """
    try:

        if not ObjectId.is_valid(district_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.DISTRICT_DELETE_FAILED,
                parameters={"districtId": district_id, "errorMessage": "Invalid district ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.DISTRICT_DELETE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await delete_district(district_id, current_user.id, deleted_ip=client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.DISTRICT_DELETED,
            json_values={
                "districtId": district_id,
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
            error_code=ErrorCodes.DISTRICT_DELETE_FAILED,
            parameters={"districtId": district_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_DELETE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_DELETE_NOT_FOUND,
            parameters={"districtId": district_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_DELETE_NOT_FOUND
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.DISTRICT_DELETE_FAILED,
            parameters={"districtId": district_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{district_id}",
    status_code=status.HTTP_200_OK,
    summary="Restore a deleted district",
    description="Restores a soft-deleted district record by setting isDelete=false."
)
async def restore_district_endpoint(
    district_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted district record.

    This endpoint restores a previously soft-deleted district by setting
    isDelete=false and isActive=true.

    **Path Parameters:**
    - `district_id` (required): District ObjectId to restore

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "District restored successfully"
    - `data`: Restored district object

    **Error Responses:**
    - 400: Invalid district ID format or district not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: District not found
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with DISTRICT_RESTORED code
    """
    try:


        if not ObjectId.is_valid(district_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
                parameters={"districtId": district_id, "errorMessage": "Invalid district ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.DISTRICT_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        restored = await restore_district(district_id, current_user.id, restored_ip=client_ip, request=request)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.DISTRICT_RESTORED,
            json_values={
                "districtId": district_id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=restored,
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"districtId": district_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.DISTRICT_UPDATE_FAILED,
            parameters={"districtId": district_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.DISTRICT_UPDATE_FAILED
            )
        )


