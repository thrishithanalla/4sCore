"""
Unit Enhance Router
API endpoints for Unit Enhance collection operations

Key differences from original Unit router:
- unitCd: Auto-generated unique code (name_unitTypeName)
- unitPath: Array of strings instead of backslash-delimited string
- name: Non-unique (uniqueness enforced via unitCd)
"""
import logging
from typing import Optional
from fastapi import APIRouter, Query, Request, HTTPException, status
from fastapi.responses import JSONResponse

from app.api.v1.schemas.unit_enhance_schema import (
    UnitEnhanceCreateSchema,
    UnitEnhanceUpdateSchema,
    UnitEnhanceCreateResponseDTO,
    UnitEnhanceListResponseDTO,
    UnitEnhanceMinimalListResponseDTO,
    UnitEnhanceGetResponseDTO,
    UnitEnhanceUpdateResponseDTO,
    UnitEnhanceDeleteResponseDTO,
    UnitEnhanceRestoreResponseDTO,
)
from app.api.v1.services.unit_enhance_service import UnitEnhanceService
from app.api.v1.utils.standard_response import api_success, api_paginated, ResponseBuilder
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/units-enhance", tags=["units-enhance"])


@router.post(
    "/create",
    response_model=UnitEnhanceCreateResponseDTO,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new enhanced unit",
    description="Creates a new unit with auto-generated unitCd and unitPath."
)
async def create_unit(
    unit_data: UnitEnhanceCreateSchema,
    request: Request
):
    """
    Create a new enhanced unit.

    This endpoint creates a new unit record with automatic generation of:
    - **unitCd**: Unique identifier combining name and unit type (format: name_unitTypeName)
    - **unitPath**: Hierarchical path array from current unit to root

    **Request Body (UnitEnhanceCreateSchema):**
    - `policeReferenceId` (required): Canonical reference code for the unit
    - `name` (required): Unit name (non-unique, uniqueness enforced via unitCd)
    - `email` (required): Official email address
    - `districtId` (required): Reference to district collection
    - `responsibleUserId` (required): Reference to personnel_master collection
    - `unitTypeId` (required): Reference to unit type (required for unitCd generation)
    - `departmentId` (optional): Reference to department collection
    - `parentUnitId` (optional): Reference to parent unit (for hierarchy)
    - `address1`, `address2`, `city`, `zip` (optional): Address fields
    - `phone` (optional): Array of phone numbers

    **Response (UnitEnhanceCreateResponseDTO):**
    - `success`: true on success
    - `code`: 201 (Created)
    - `message`: "Unit created successfully"
    - `data`: Created unit object with all fields including auto-generated unitCd and unitPath

    **Error Responses:**
    - 400: Validation error (invalid input data)
    - 409: Conflict (duplicate unitCd or policeReferenceId)
    - 500: Internal server error
    """
    try:
        result = await UnitEnhanceService.create_unit(
            unit_data.model_dump(exclude_unset=True),
            None
        )

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_ENHANCE_CREATED,
            json_values={
                "unitEnhanceId": result.get("_id", "") if isinstance(result, dict) else "",
                "name": result.get("name", "") if isinstance(result, dict) else "",
                "createdBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=201,
            content=api_success(
                data=result,
                message="Unit created successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"unitName": unit_data.name if hasattr(unit_data, 'name') else None, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error creating enhanced unit")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"unitName": unit_data.name if hasattr(unit_data, 'name') else None, "errorMessage": str(e)},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to create unit"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    response_model=UnitEnhanceListResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Get all enhanced units with pagination",
    description="Retrieves a paginated list of units with optional filtering and populated nested objects."
)
async def get_units(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed)"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Number of items per page (max 100)"),
    search: Optional[str] = Query(None, description="Search in name, unitCd, policeReferenceId, city"),
    department_id: Optional[str] = Query(None, alias="departmentId", description="Filter by department ObjectId"),
    parent_unit_id: Optional[str] = Query(None, alias="parentUnitId", description="Filter by parent unit ObjectId"),
    district_id: Optional[str] = Query(None, alias="districtId", description="Filter by district ObjectId"),
    unit_type_id: Optional[str] = Query(None, alias="unitTypeId", description="Filter by unit type ObjectId"),
    include_deleted: bool = Query(False, alias="includeDeleted", description="Include soft-deleted records"),
    is_active: Optional[bool] = Query(True, alias="isActive", description="Filter by active status (true/false/null)")
):
    """
    Get all enhanced units with optional pagination and filters.

    This endpoint retrieves a paginated list of units with support for searching and filtering.
    Each unit includes populated nested objects for related collections.

    **Query Parameters:**
    - `page` (optional): Page number (1-indexed), omit for all results
    - `pageSize` (optional): Items per page (1-100), omit for all results
    - `search` (optional): Search text across name, unitCd, policeReferenceId, city
    - `departmentId` (optional): Filter by department ObjectId
    - `parentUnitId` (optional): Filter by parent unit ObjectId
    - `districtId` (optional): Filter by district ObjectId
    - `unitTypeId` (optional): Filter by unit type ObjectId
    - `includeDeleted` (optional): Include soft-deleted records (default: false)
    - `isActive` (optional): Filter by active status (default: true)

    **Response (UnitEnhanceListResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Units fetched successfully"
    - `data`: Array of unit objects with populated nested fields
    - `pagination`: { page, pageSize, total, totalPages }

    **Populated Nested Objects:**
    - `department`: { _id, name }
    - `unitType`: { _id, name }
    - `parentUnit`: { _id, name, policeReferenceId, unitCd }
    - `district`: { _id, name, cctnsDistrictCd, stateName }
    - `responsibleUser`: { _id, name }

    **Error Responses:**
    - 400: Invalid query parameters
    - 500: Internal server error
    """
    try:
        result = await UnitEnhanceService.get_units(
            page=page,
            page_size=page_size,
            search=search,
            department_id=department_id,
            parent_unit_id=parent_unit_id,
            district_id=district_id,
            unit_type_id=unit_type_id,
            include_deleted=include_deleted,
            is_active=is_active
        )

        return JSONResponse(
            status_code=200,
            content=api_paginated(
                data=result["data"],
                total=result["total"],
                page=result["page"],
                page_size=result["page_size"],
                message="Units fetched successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={"search": search, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error listing enhanced units")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={"search": search, "errorMessage": str(e)},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to list units"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED
            )
        )


@router.get(
    "/list-minimal",
    response_model=UnitEnhanceMinimalListResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Get minimal unit list for dropdowns",
    description="Retrieves a minimal list of units with only _id, name, and unitCd fields."
)
async def get_units_minimal(
    request: Request,
    search: Optional[str] = Query(None, description="Search in name, unitCd, policeReferenceId"),
    department_id: Optional[str] = Query(None, alias="departmentId", description="Filter by department ObjectId"),
    unit_type_id: Optional[str] = Query(None, alias="unitTypeId", description="Filter by unit type ObjectId"),
    include_deleted: bool = Query(False, alias="includeDeleted", description="Include soft-deleted records")
):
    """
    Get all enhanced units with minimal fields for dropdowns and selection lists.

    This is a lightweight endpoint optimized for dropdown menus and selection components.
    Returns only essential fields: _id, name, and unitCd.

    **Query Parameters:**
    - `search` (optional): Search text across name, unitCd, policeReferenceId
    - `departmentId` (optional): Filter by department ObjectId
    - `unitTypeId` (optional): Filter by unit type ObjectId
    - `includeDeleted` (optional): Include soft-deleted records (default: false)

    **Response (UnitEnhanceMinimalListResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Units fetched successfully"
    - `data`: Array of { _id, name, unitCd }

    **Error Responses:**
    - 400: Invalid query parameters
    - 500: Internal server error
    """
    try:
        result = await UnitEnhanceService.get_units_minimal(
            search=search,
            department_id=department_id,
            unit_type_id=unit_type_id,
            include_deleted=include_deleted
        )

        return JSONResponse(
            status_code=200,
            content=api_success(
                data=result,
                message="Units fetched successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={"search": search, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error listing minimal enhanced units")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={"search": search, "errorMessage": str(e)},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to list units"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED
            )
        )


@router.get(
    "/get/{unit_id}",
    response_model=UnitEnhanceGetResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Get a single unit by ID",
    description="Retrieves a single unit with all fields and populated nested objects."
)
async def get_unit(
    unit_id: str,
    request: Request
):
    """
    Get a single enhanced unit by ID.

    Retrieves a unit by its ObjectId with all fields and populated nested objects.

    **Path Parameters:**
    - `unit_id` (required): The ObjectId of the unit to retrieve

    **Response (UnitEnhanceGetResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit fetched successfully"
    - `data`: Unit object with:
      - `unitCd`: Auto-generated unique code (name_unitTypeName)
      - `unitPath`: Hierarchical path array from current unit to root
      - All other fields with populated nested objects

    **Populated Nested Objects:**
    - `department`: { _id, name }
    - `unitType`: { _id, name }
    - `parentUnit`: { _id, name, policeReferenceId, unitCd }
    - `district`: { _id, name, cctnsDistrictCd, stateName }
    - `responsibleUser`: { _id, name }

    **Error Responses:**
    - 404: Unit not found
    - 500: Internal server error
    """
    try:
        result = await UnitEnhanceService.get_unit_by_id(unit_id)

        return JSONResponse(
            status_code=200,
            content=api_success(
                data=result,
                message="Unit fetched successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
            parameters={"unitId": unit_id, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error fetching enhanced unit")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to fetch unit"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_GET_NOT_FOUND
            )
        )


@router.patch(
    "/update/{unit_id}",
    response_model=UnitEnhanceUpdateResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Update an enhanced unit",
    description="Updates a unit. Regenerates unitCd if name/unitTypeId changes, recalculates unitPath if hierarchy changes."
)
async def update_unit(
    unit_id: str,
    unit_data: UnitEnhanceUpdateSchema,
    request: Request
):
    """
    Update an enhanced unit.

    Updates a unit with partial data. Only provided fields are updated.

    **Path Parameters:**
    - `unit_id` (required): The ObjectId of the unit to update

    **Request Body (UnitEnhanceUpdateSchema):**
    All fields are optional. Only provided fields are updated:
    - `policeReferenceId`: Canonical reference code
    - `name`: Unit name (triggers unitCd and unitPath regeneration)
    - `email`: Official email address
    - `districtId`: Reference to district collection
    - `responsibleUserId`: Reference to personnel_master
    - `unitTypeId`: Reference to unit type (triggers unitCd regeneration)
    - `parentUnitId`: Reference to parent unit (triggers unitPath regeneration)
    - Other optional fields: address1, address2, city, zip, phone, etc.

    **Automatic Updates:**
    - If `name` or `unitTypeId` changes:
      - `unitCd` is regenerated
      - Uniqueness is re-validated
    - If `name` or `parentUnitId` changes:
      - `unitPath` is recalculated for this unit
      - All descendant units' `unitPath` are also updated

    **Response (UnitEnhanceUpdateResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit updated successfully"
    - `data`: Updated unit object

    **Error Responses:**
    - 400: Validation error
    - 404: Unit not found
    - 409: Conflict (duplicate unitCd after regeneration)
    - 500: Internal server error
    """
    try:
        result = await UnitEnhanceService.update_unit(
            unit_id,
            unit_data.model_dump(exclude_unset=True),
            None
        )

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_ENHANCE_UPDATED,
            json_values={
                "unitEnhanceId": unit_id,
                "updatedBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=200,
            content=api_success(
                data=result,
                message="Unit updated successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_UPDATE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error updating enhanced unit")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_UPDATE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to update unit"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{unit_id}",
    response_model=UnitEnhanceDeleteResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Soft delete an enhanced unit",
    description="Marks a unit as deleted (isDelete=true). Cannot delete units with child units."
)
async def delete_unit(
    unit_id: str,
    request: Request
):
    """
    Soft delete an enhanced unit.

    Performs a soft delete by setting `isDelete=true` and recording deletion metadata.
    The unit is not physically removed from the database.

    **Path Parameters:**
    - `unit_id` (required): The ObjectId of the unit to delete

    **Validation:**
    - Cannot delete if unit has child units (units with parentUnitId pointing to this unit)

    **Response (UnitEnhanceDeleteResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit deleted successfully"
    - `data`: Deleted unit object with isDelete=true

    **Recorded Metadata:**
    - `isDelete`: Set to true
    - `updatedBy`: User who performed deletion
    - `updatedAt`: Deletion timestamp
    - `updatedIp`: IP address of the deletion request

    **Error Responses:**
    - 400: Cannot delete unit with child units
    - 404: Unit not found
    - 500: Internal server error
    """
    try:
        # Get client IP using centralized helper
        client_ip = get_client_ip(request)
        result = await UnitEnhanceService.delete_unit(
            unit_id,
            None,
            deleted_ip=client_ip
        )

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_ENHANCE_DELETED,
            json_values={
                "unitEnhanceId": unit_id,
                "deletedBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=200,
            content=api_success(
                data=result,
                message="Unit deleted successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_DELETE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_DELETE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error deleting enhanced unit")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_DELETE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to delete unit"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_DELETE_FAILED
            )
        )


@router.post(
    "/restore/{unit_id}",
    response_model=UnitEnhanceRestoreResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Restore a soft-deleted unit",
    description="Restores a deleted unit (isDelete=false). Validates unitCd uniqueness before restore."
)
async def restore_unit(
    unit_id: str,
    request: Request
):
    """
    Restore a soft-deleted enhanced unit.

    Restores a previously deleted unit by setting `isDelete=false`.
    Validates uniqueness constraints before restoration.

    **Path Parameters:**
    - `unit_id` (required): The ObjectId of the unit to restore

    **Validation:**
    - Validates `unitCd` uniqueness before restore to prevent conflicts with active units

    **Response (UnitEnhanceRestoreResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit restored successfully"
    - `data`: Restored unit object with isDelete=false

    **Recorded Metadata:**
    - `isDelete`: Set to false
    - `updatedBy`: User who performed restoration
    - `updatedAt`: Restoration timestamp
    - `updatedIp`: IP address of the restoration request

    **Error Responses:**
    - 404: Unit not found or not deleted
    - 409: Conflict (unitCd already exists in active units)
    - 500: Internal server error
    """
    try:
        # Get client IP using centralized helper
        client_ip = get_client_ip(request)
        result = await UnitEnhanceService.restore_unit(
            unit_id,
            None,
            restored_ip=client_ip
        )

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_ENHANCE_RESTORED,
            json_values={
                "unitEnhanceId": unit_id,
                "restoredBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=200,
            content=api_success(
                data=result,
                message="Unit restored successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_RESTORE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_RESTORE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error restoring enhanced unit")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_RESTORE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to restore unit"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_RESTORE_FAILED
            )
        )
