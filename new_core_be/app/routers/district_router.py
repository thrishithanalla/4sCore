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

from app.schemas.district_schema import (
    DistrictCreateSchema,
    DistrictUpdateSchema,
    DistrictResponseSchema
)
from app.schemas.auth_schema import TokenDataSchema
from app.utils.dependencies import get_current_user
from app.utils.request_helpers import get_client_ip
from app.utils.standard_response import (
    ResponseBuilder,
    api_success,
    api_created,
    api_paginated
)
from app.constants.api_constants import (
    ErrorCodes,
    SuccessMessages,
    ErrorMessages,
    PermissionMessages,
    ModulePrefixes
)
from app.constants.jobs import Jobs
from app.services.district_service import (
    create_district,
    update_district,
    delete_district,
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


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)


class PaginatedDistrictResponse(BaseModel):
    """Paginated response model for districts list"""
    data: List[DistrictResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_district_endpoint(
    district: DistrictCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new district record
    """
    try:
        
        # Get client IP using utility (handles X-Forwarded-For, X-Real-IP, etc.)
        client_ip = get_client_ip(request)

        # Prepare district data with IP
        district_data = district.model_dump()
        district_data["createdIp"] = client_ip

        result = await create_district(district_data, current_user.id)
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(
                data=result,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=e.detail if isinstance(e.detail, str) else str(e.detail),
                error_code=_error_code(ErrorCodes.VALIDATION),
                code=e.status_code
            )
        )
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.CREATE)
            )
        )


@router.get("/list")
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
    By default returns only active (isActive=true) and non-deleted records.
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
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


@router.get("/get/{district_id}")
async def get_district_endpoint(
    district_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a district record by ID (includes soft-deleted records)
    """
    try:

        if not ObjectId.is_valid(district_id):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower()),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )

        district = await get_district(district_id)

        if not district:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
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
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=e.detail if isinstance(e.detail, str) else str(e.detail),
                error_code=_error_code(ErrorCodes.VALIDATION),
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.READ)
            )
        )


@router.put("/update/{district_id}")
async def update_district_endpoint(
    district_id: str,
    district_update: DistrictUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update a district record
    """
    try:

        if not ObjectId.is_valid(district_id):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower()),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )

        # Get client IP using utility (handles X-Forwarded-For, X-Real-IP, etc.)
        client_ip = get_client_ip(request)

        # Prepare update data with IP
        update_data = district_update.model_dump(exclude_unset=True)
        update_data["updatedIp"] = client_ip

        result = await update_district(district_id, update_data, current_user.id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=result,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=e.detail if isinstance(e.detail, str) else str(e.detail),
                error_code=_error_code(ErrorCodes.VALIDATION),
                code=e.status_code
            )
        )
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.UPDATE)
            )
        )


@router.delete("/delete/{district_id}")
async def delete_district_endpoint(
    district_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a district record (sets isDelete=True, isActive=False)
    """
    try:
        

        if not ObjectId.is_valid(district_id):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower()),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )

        # Get client IP using utility (handles X-Forwarded-For, X-Real-IP, etc.)
        client_ip = get_client_ip(request)

        await delete_district(district_id, current_user.id, deleted_ip=client_ip)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=e.detail if isinstance(e.detail, str) else str(e.detail),
                error_code=_error_code(ErrorCodes.VALIDATION),
                code=e.status_code
            )
        )
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=str(e),
                error_code=_error_code(ErrorCodes.NOT_FOUND)
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.DELETE)
            )
        )




