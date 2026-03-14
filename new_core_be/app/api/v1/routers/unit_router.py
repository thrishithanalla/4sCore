"""
Unit Router
Provides API endpoints for Unit management
Routes: /api/v1/units
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.unit_schema import (
    UnitCreateSchema,
    UnitResponseSchema,
    UnitUpdateSchema,
    UnitHierarchyResponseSchema,
    UnitBulkCreateSchema,
    UnitBulkCreateResponseSchema
)
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.services.unit_service import UnitService
from app.api.v1.services.hierarchy_access_service import HierarchyAccessService
from app.api.v1.utils.standard_response import (
    ResponseBuilder,
    api_success,
    api_created,
    api_paginated
)
from app.constants.api_constants import (
    SuccessMessages,
    ErrorMessages,
    PermissionMessages
)
from app.constants.error_codes import ErrorCodes
from app.constants.jobs import Jobs
from app.constants.log_codes import LogCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/units", tags=["units"])

# Module configuration
ENTITY_NAME = "Unit"
ENTITY_NAME_PLURAL = "Units"
JOB_NAME = Jobs.UNITS


class UnitMinimalResponse(BaseModel):
    """Minimal unit response with only _id and name"""
    id: str
    name: str

    class Config:
        populate_by_name = True


@router.get(
    "/list-minimal",
    summary="Get minimal unit list",
    description="Returns a lightweight list of units with only ID and name, optimized for dropdowns and select components."
)
async def get_all_units_minimal(
    request: Request,
    search: Optional[str] = Query(None, description="Search by name, policeReferenceId, or city"),
    departmentId: Optional[str] = Query(None, description="Filter by department ID"),
    parentUnitId: Optional[str] = Query(None, description="Filter by parent unit ID"),
    districtId: Optional[str] = Query(None, description="Filter by district ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all units with only _id and name (lightweight endpoint for dropdowns/selects).

    This endpoint is optimized for low latency by returning only essential fields.
    Ideal for populating dropdown menus, autocomplete fields, and select components.

    **Query Parameters:**
    - `search` (optional): Search by name, policeReferenceId, or city
    - `departmentId` (optional): Filter by department ID (FK: department._id)
    - `parentUnitId` (optional): Filter by parent unit ID (FK: unit._id)
    - `districtId` (optional): Filter by district ID (FK: district._id)
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit list fetched successfully"
    - `data`: Array of objects with `id` and `name` only

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        units = await UnitService.get_units_minimal(
            search=search,
            department_id=departmentId,
            parent_unit_id=parentUnitId,
            district_id=districtId,
            include_deleted=include_deleted
        )
        data = [{"id": u["_id"], "name": u["name"]} for u in units]
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching minimal {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={"search": search},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED
            )
        )


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new unit",
    description="Creates a new unit with automatic parentUnitPath calculation and foreign key validation."
)
async def create_unit(
    unit: UnitCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new unit with automatic parentUnitPath calculation.

    This endpoint creates a new unit in the organizational hierarchy with
    comprehensive validation and automatic path management.

    **Request Body (UnitCreateSchema):**
    - `name` (required): Unit name
    - `policeReferenceId` (required): Unique police reference ID
    - `departmentId` (required): FK reference to department collection
    - `unitTypeId` (required): FK reference to unitType collection
    - `parentUnitId` (optional): FK reference to parent unit
    - `districtId` (optional): FK reference to district collection
    - `responsibleUserId` (optional): FK reference to personnel_master
    - `city` (optional): City name
    - `address` (optional): Full address
    - `contactNumber` (optional): Contact phone number

    **Auto-calculated Fields:**
    - `parentUnitPath`: Auto-calculated from parent hierarchy
      Format: .newUnitName.parentName + parent's existing path

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Unit created successfully"
    - `data`: Created unit object with all fields

    **Error Responses:**
    - 400: Validation error (invalid ObjectId, missing required fields)
    - 403: Permission denied (CREATE permission required)
    - 409: Conflict (duplicate policeReferenceId)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with UNIT_CREATED code
    - Records createdIp from request
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_CREATE_FAILED,
                parameters={"errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_CREATE_FAILED
                )
            )

        client_ip = get_client_ip(request)

        unit_dict = unit.model_dump()
        unit_dict["createdIp"] = client_ip
        created = await UnitService.create_unit(unit_dict, current_user.id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_CREATED,
            json_values={
                "unitId": created.get("_id", ""),
                "name": created.get("name", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(
                data=created,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        # Determine specific error code based on error message
        error_code = ErrorCodes.UNIT_CREATE_FAILED
        if "duplicate" in str(e.detail).lower() or "already exists" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_CREATE_DUPLICATE_REFERENCE
        elif "parent" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_CREATE_INVALID_PARENT
        elif "department" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_CREATE_INVALID_DEPARTMENT
        elif "unit type" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_CREATE_INVALID_UNIT_TYPE
        elif "district" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_CREATE_INVALID_DISTRICT

        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"name": unit.name, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=error_code,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"name": unit.name, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"name": unit.name},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_CREATE_FAILED
            )
        )


@router.post(
    "/bulk-create",
    response_model=UnitBulkCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create units",
    description="Creates multiple units in a single request with individual error handling."
)
async def bulk_create_unit_endpoint(
    payload: UnitBulkCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Bulk create multiple units in a single request.

    This endpoint processes each unit individually, allowing partial success.
    Failed items are collected and returned separately without stopping
    the entire operation.

    **Request Body (UnitBulkCreateSchema):**
    - `items`: Array of UnitCreateSchema objects, each containing:
      - `name` (required): Unit name
      - `policeReferenceId` (required): Unique police reference ID
      - `departmentId` (required): FK reference to department
      - `unitTypeId` (required): FK reference to unitType
      - Other optional fields as in single create

    **Response (UnitBulkCreateResponseSchema):**
    - `success`: Array of successfully created unit objects
    - `failed`: Array of failed items with error details:
      - `index`: Original position in request array
      - `name`: Unit name that failed
      - `policeReferenceId`: Reference ID that failed
      - `error`: Error message
    - `totalSuccess`: Count of successfully created units
    - `totalFailed`: Count of failed units

    **Error Responses:**
    - 403: Permission denied (CREATE permission required)
    - 400: User ID not found
    - 500: Internal server error

    **Notes:**
    - Operation continues even if some items fail
    - Each item's createdIp is set from request
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_CREATE_FAILED,
                parameters={"errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_CREATE_FAILED
                )
            )

        success_list = []
        failed_list = []

        client_ip = get_client_ip(request)

        for index, item in enumerate(payload.items):
            try:
                unit_dict = item.model_dump()
                unit_dict["createdIp"] = client_ip
                created = await UnitService.create_unit(unit_dict, current_user.id)
                success_list.append(created)
            except HTTPException as he:
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.UNIT_CREATE_FAILED,
                    parameters={"index": index, "name": item.name, "errorMessage": str(he.detail)},
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or (str(he.detail) if isinstance(he.detail, str) else str(he.detail))
                failed_list.append({
                    "index": index,
                    "name": item.name,
                    "policeReferenceId": item.policeReferenceId,
                    "error": error_message
                })
            except ValueError as ve:
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.UNIT_CREATE_FAILED,
                    parameters={"index": index, "name": item.name, "errorMessage": str(ve)},
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or str(ve)
                failed_list.append({
                    "index": index,
                    "name": item.name,
                    "policeReferenceId": item.policeReferenceId,
                    "error": error_message
                })
            except Exception as exc:
                logger.exception(f"bulk_create_unit failed for item {index}")
                error_log = await log_error_with_exception(
                    request=request,
                    error_code=ErrorCodes.UNIT_CREATE_FAILED,
                    parameters={"index": index, "name": item.name},
                    exception=exc,
                    actor_user_id=current_user.id
                )
                error_message = (error_log or {}).get("resolvedMessage") or "Internal server error"
                failed_list.append({
                    "index": index,
                    "name": item.name,
                    "policeReferenceId": item.policeReferenceId,
                    "error": error_message
                })

        return UnitBulkCreateResponseSchema(
            success=success_list,
            failed=failed_list,
            totalSuccess=len(success_list),
            totalFailed=len(failed_list)
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error in bulk creating {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all units",
    description="Retrieves all units with optional pagination, search, and filters. Results are filtered based on user's unit hierarchy."
)
async def get_all_units(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    search: Optional[str] = Query(None, description="Search by name, policeReferenceId, or city"),
    departmentId: Optional[str] = Query(None, description="Filter by department ID"),
    parentUnitId: Optional[str] = Query(None, description="Filter by parent unit ID"),
    districtId: Optional[str] = Query(None, description="Filter by district ID (FK: district._id)"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all units with optional pagination, filters, and hierarchy-based access control.

    Results are automatically filtered based on the user's assigned unit hierarchy:
    - Users can only see their own unit and all descendant units
    - Parent and sibling units are not visible
    - Top-level users (no parent unit) can see all units in their district

    By default returns only non-deleted records. Supports flexible pagination
    where omitting page/page_size returns all matching records.

    **Query Parameters:**
    - `page` (optional): Page number starting from 1. If not provided, returns all records
    - `page_size` (optional): Items per page (1-1000). Only used when page is provided
    - `search` (optional): Search in name, policeReferenceId, or city fields
    - `departmentId` (optional): Filter by department ID (FK: department._id)
    - `parentUnitId` (optional): Filter by parent unit ID (FK: unit._id)
    - `districtId` (optional): Filter by district ID (FK: district._id)
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit list fetched successfully"
    - `data`: Array of unit objects with all fields (filtered by hierarchy)
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
        if accessible_unit_ids is None:
            print(f"[UNITS LIST] User {current_user.id} - Top-level unit (no parent) - No filtering applied")
        else:
            print(f"[UNITS LIST] User {current_user.id} - Accessible unit IDs count: {len(accessible_unit_ids)}")

        result = await UnitService.get_units(
            page=page,
            page_size=page_size,
            search=search,
            department_id=departmentId,
            parent_unit_id=parentUnitId,
            district_id=districtId,
            include_deleted=include_deleted,
            accessible_unit_ids=accessible_unit_ids
        )

        # Debug: Print result count
        print(f"[UNITS LIST] Total units returned: {result.get('total', 0)}, Data count: {len(result.get('data', []))}")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=result.get("data", []),
                total=result.get("total", 0),
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
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={"search": search},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED
            )
        )


@router.get(
    "/get/{unit_id}",
    summary="Get unit by ID",
    description="Retrieves a single unit by its ID, including soft-deleted records."
)
async def get_unit(
    unit_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a unit by ID (includes soft-deleted records).

    Retrieves complete unit details including all fields and metadata.
    This endpoint returns soft-deleted records to allow viewing
    historical data.

    **Path Parameters:**
    - `unit_id` (required): MongoDB ObjectId of the unit

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit fetched successfully"
    - `data`: Unit object with all fields including:
      - `_id`: Unit ID
      - `name`: Unit name
      - `policeReferenceId`: Police reference ID
      - `parentUnitPath`: Hierarchical path string
      - `departmentId`: FK to department
      - `unitTypeId`: FK to unitType
      - `parentUnitId`: FK to parent unit
      - `districtId`: FK to district
      - `responsibleUserId`: FK to personnel_master
      - `isActive`, `isDelete`: Status flags
      - Audit fields (createdBy, updatedBy, timestamps)

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 404: Unit not found
    - 500: Internal server error
    """
    try:


        unit = await UnitService.get_unit_by_id(unit_id)

        if not unit:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
                parameters={"unitId": unit_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=unit,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
            parameters={"unitId": unit_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
            parameters={"unitId": unit_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_GET_NOT_FOUND
            )
        )


@router.put(
    "/update/{unit_id}",
    summary="Update a unit",
    description="Updates an existing unit with automatic parentUnitPath recalculation and cascade updates."
)
async def update_unit(
    unit_id: str,
    unit_update: UnitUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update a unit with automatic parentUnitPath recalculation.

    This endpoint handles complex hierarchy updates including circular
    reference detection and cascading path updates to child units.

    **Path Parameters:**
    - `unit_id` (required): MongoDB ObjectId of the unit to update

    **Request Body (UnitUpdateSchema):**
    All fields are optional - only provided fields are updated:
    - `name`: Unit name
    - `policeReferenceId`: Police reference ID (must remain unique)
    - `departmentId`: FK to department
    - `unitTypeId`: FK to unitType
    - `parentUnitId`: FK to parent unit
    - `districtId`: FK to district
    - `responsibleUserId`: FK to personnel_master
    - `city`, `address`, `contactNumber`: Location details
    - `isActive`: Active status flag

    **Automatic Behaviors:**
    - Validates foreign keys if updated
    - Detects circular hierarchy when parentUnitId changes
    - Recalculates parentUnitPath if parentUnitId or name changes
    - Cascades path updates to all child units

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit updated successfully"
    - `data`: Updated unit object

    **Error Responses:**
    - 400: Validation error (invalid ObjectId, circular hierarchy)
    - 403: Permission denied (UPDATE permission required)
    - 404: Unit not found
    - 409: Conflict (duplicate policeReferenceId)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with UNIT_UPDATED code
    - Records updatedIp from request
    - May update child units' parentUnitPath
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_UPDATE_FAILED,
                parameters={"unitId": unit_id, "errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_UPDATE_FAILED
                )
            )

        client_ip = get_client_ip(request)

        update_data = unit_update.model_dump(exclude_unset=True)
        update_data["updatedIp"] = client_ip
        updated = await UnitService.update_unit(unit_id, update_data, current_user.id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_UPDATED,
            json_values={
                "unitId": unit_id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=updated,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        # Determine specific error code based on error
        error_code = ErrorCodes.UNIT_UPDATE_FAILED
        if e.status_code == 404:
            error_code = ErrorCodes.UNIT_UPDATE_NOT_FOUND
        elif "circular" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_UPDATE_CIRCULAR_HIERARCHY
        elif "duplicate" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_UPDATE_DUPLICATE_REFERENCE

        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"unitId": unit_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=error_code,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_UPDATE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_UPDATE_FAILED,
            parameters={"unitId": unit_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{unit_id}",
    summary="Soft delete a unit",
    description="Performs a soft delete on a unit if it has no child units or personnel dependencies."
)
async def delete_unit(
    unit_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a unit.

    This endpoint performs a soft delete by setting isDelete=true and
    isActive=false. It includes dependency checks to prevent orphaning
    child units or personnel.

    **Path Parameters:**
    - `unit_id` (required): MongoDB ObjectId of the unit to delete

    **Validation Checks:**
    - Validates that the unit exists
    - Checks if unit is a parent of other units (parentUnitId references)
    - Checks if unit name appears in any parentUnitPath
    - Checks for personnel assigned to this unit
    - Prevents deletion if unit has children or personnel

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Validation error (invalid ObjectId, user ID not found)
    - 403: Permission denied (DELETE permission required)
    - 404: Unit not found
    - 409: Conflict - unit has child units or personnel
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=true, isActive=false
    - Logs transaction with UNIT_DELETED code
    - Records deletedIp from request
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_DELETE_FAILED,
                parameters={"unitId": unit_id, "errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_DELETE_FAILED
                )
            )

        client_ip = get_client_ip(request)

        await UnitService.delete_unit(unit_id, current_user.id, client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_DELETED,
            json_values={
                "unitId": unit_id,
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
        # Determine specific error code based on error
        error_code = ErrorCodes.UNIT_DELETE_FAILED
        if e.status_code == 404:
            error_code = ErrorCodes.UNIT_DELETE_NOT_FOUND
        elif "children" in str(e.detail).lower() or "child" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_DELETE_HAS_CHILDREN
        elif "path" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_DELETE_HAS_CHILDREN_PATH
        elif "personnel" in str(e.detail).lower():
            error_code = ErrorCodes.UNIT_DELETE_HAS_PERSONNEL

        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"unitId": unit_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=error_code,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_DELETE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_DELETE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_DELETE_FAILED,
            parameters={"unitId": unit_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{unit_id}",
    summary="Restore a deleted unit",
    description="Restores a soft-deleted unit by setting isDelete=false and isActive=true."
)
async def restore_unit(
    unit_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted unit.

    This endpoint restores a previously soft-deleted unit, making it
    active and visible in normal queries again.

    **Path Parameters:**
    - `unit_id` (required): MongoDB ObjectId of the unit to restore

    **Validation Checks:**
    - Validates that the unit exists
    - Checks if unit is already active (not deleted)
    - Prevents restore if already active

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit restored successfully"
    - `data`: Restored unit object

    **Error Responses:**
    - 400: Validation error (invalid ObjectId, unit already active)
    - 403: Permission denied (UPDATE permission required)
    - 404: Unit not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=false, isActive=true
    - Logs transaction with UNIT_RESTORED code
    - Records restoredIp from request
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_RESTORE_FAILED,
                parameters={"unitId": unit_id, "errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_RESTORE_FAILED
                )
            )

        client_ip = get_client_ip(request)

        restored_unit = await UnitService.restore_unit(unit_id, current_user.id, client_ip)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_RESTORED,
            json_values={
                "unitId": unit_id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=restored_unit,
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_code = ErrorCodes.UNIT_RESTORE_NOT_FOUND if e.status_code == 404 else ErrorCodes.UNIT_RESTORE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"unitId": unit_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=error_code,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_RESTORE_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_RESTORE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_RESTORE_FAILED,
            parameters={"unitId": unit_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_RESTORE_FAILED
            )
        )


@router.get(
    "/unit-hierarchy/{unit_id}",
    summary="Get unit hierarchy",
    description="Returns the complete hierarchy chain from top-level parent down to the specified unit."
)
async def get_unit_hierarchy(
    unit_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get unit hierarchy from highest parent to the given unit.

    Returns an ordered list of units from the top-level parent
    (where parentUnitId is null) down to the specified unit. Useful
    for displaying breadcrumb navigation or organizational charts.

    **Path Parameters:**
    - `unit_id` (required): MongoDB ObjectId of the target unit

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit hierarchy fetched successfully"
    - `data`: Array of unit objects in hierarchical order, each containing:
      - `unitId`: Unit ID
      - `unitName`: Unit name
      - `parentUnitId`: Parent unit ID (null for top-level)
      - `responsibleUserId`: Responsible user ID
      - `rankId`: Rank ID from personnel collection
      - `rankShortCode`: Rank short code from rankMaster collection

    **Error Responses:**
    - 404: Unit not found
    - 500: Internal server error

    **Notes:**
    - This endpoint does NOT require RBAC permission check
    - Results are ordered from top-level parent to the target unit
    """
    try:
        result = await UnitService.get_unit_hierarchy(unit_id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=result.get("data", []),
                message=f"{ENTITY_NAME} hierarchy fetched successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
            parameters={"unitId": unit_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()} hierarchy")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_GET_NOT_FOUND,
            parameters={"unitId": unit_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_GET_NOT_FOUND
            )
        )


@router.get(
    "/personnel-by-rank/{unit_id}/{rank_id}",
    summary="Get personnel by unit and rank",
    description="Retrieves all personnel assigned to a specific unit with a specific rank."
)
async def get_personnel_by_unit_and_rank(
    unit_id: str,
    rank_id: str,
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all personnel working in a specific unit with a specific rank.

    This endpoint queries personnel_master to find personnel matching
    both unit assignment and rank criteria. Useful for finding specific
    officers or staff within a unit hierarchy.

    **Path Parameters:**
    - `unit_id` (required): MongoDB ObjectId of the unit
    - `rank_id` (required): MongoDB ObjectId of the rank

    **Query Parameters:**
    - `page` (optional): Page number starting from 1. If not provided, returns all
    - `page_size` (optional): Items per page (1-1000). Only used when page is provided

    **Query Logic:**
    - personnel_master.units array contains object with matching unitId
    - personnel_master.rankId matches the provided rank_id
    - personnel_master.isDelete is False

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel fetched successfully"
    - `data`: Array of personnel objects
    - `pagination`: Pagination metadata (total, page, pageSize, totalPages)

    **Error Responses:**
    - 400: Invalid ObjectId format
    - 403: Permission denied (READ permission required)
    - 500: Internal server error

    **Notes:**
    - MongoDB natively handles array element queries
    - Only non-deleted personnel are returned
    """
    try:

        result = await UnitService.get_personnel_by_unit_and_rank(
            unit_id=unit_id,
            rank_id=rank_id,
            page=page,
            page_size=page_size
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=result.get("data", []),
                total=result.get("total", 0),
                page=page,
                page_size=page_size,
                message="Personnel fetched successfully"
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error fetching personnel by unit and rank")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_LIST_FAILED,
            parameters={},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_LIST_FAILED
            )
        )
