"""
Personnel Master Router
Provides API endpoints for Personnel Master management
Routes: /api/v1/personnel-master
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, Header
from fastapi.responses import JSONResponse
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

from app.api.v1.schemas.personnel_schema import (
    PersonnelCreateSchema,
    PersonnelUpdateSchema,
    PersonnelResponseSchema,
    PersonnelCreateResponseSchema,
    PersonnelBulkCreateSchema,
    PersonnelBulkCreateResponseSchema,
    PersonnelByUnitsAndRoleRequestSchema,
    PersonnelByUnitsAndRoleResponseSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.utils.error_messages import get_validation_error, get_success_message
from app.api.v1.utils.standard_response import (
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
from app.api.v1.services.personnel_master_service import (
    create_personnel,
    update_personnel,
    delete_personnel,
    restore_personnel,
    get_personnel,
    list_personnel,
    list_personnel_minimal,
    get_personnel_by_unit,
    get_personnel_by_units_and_role,
    get_unit_hierarchy_with_personnel,
    get_unit_hierarchy_by_rank,
    get_subordinate_personnel_by_rank
)
from app.api.v1.services.hierarchy_access_service import HierarchyAccessService
from app.constants.jobs import Jobs
from app.constants.error_codes import ErrorCodes as ErrorCodeConstants
from app.constants.log_codes import LogCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.services.notification_logger import (
    emit_notification,
    NotificationTypes,
    build_personnel_created_payload,
    build_personnel_updated_payload
)
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/personnel-master", tags=["personnel-master"])

# Job name for RBAC permission checks (from centralized constants)
JOB_NAME = Jobs.PERSONNEL_MASTER
MODULE_PREFIX = ModulePrefixes.PERSONNEL_MASTER
ENTITY_NAME = "Personnel"
ENTITY_NAME_PLURAL = "Personnel"


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)


def _handle_http_exception(e: HTTPException, error_type: str = ErrorCodes.VALIDATION) -> JSONResponse:
    """Handle HTTPException and return standardized response"""
    return JSONResponse(
        status_code=e.status_code,
        content=ResponseBuilder.error(
            message=e.detail if isinstance(e.detail, str) else str(e.detail),
            error_code=_error_code(error_type),
            code=e.status_code
        )
    )


def _handle_value_error(e: ValueError, error_type: str = ErrorCodes.VALIDATION) -> JSONResponse:
    """Handle ValueError and return standardized response"""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ResponseBuilder.bad_request(
            message=str(e),
            error_code=_error_code(error_type)
        )
    )


def _handle_server_error(error_type: str = ErrorCodes.INTERNAL) -> JSONResponse:
    """Handle unexpected errors and return standardized response"""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ResponseBuilder.server_error(
            message=ErrorMessages.UNEXPECTED_ERROR,
            error_code=_error_code(error_type)
        )
    )


def _permission_denied_response(permission_type: str) -> JSONResponse:
    """Return permission denied response"""
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content=ResponseBuilder.forbidden(
            message=PermissionMessages.format(permission_type, ENTITY_NAME.lower()),
            error_code=_error_code(ErrorCodes.PERMISSION_DENIED)
        )
    )


def _invalid_id_response(entity: str = None) -> JSONResponse:
    """Return invalid ID response"""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ResponseBuilder.bad_request(
            message=ErrorMessages.format(ErrorMessages.INVALID_ID, entity or ENTITY_NAME.lower()),
            error_code=_error_code(ErrorCodes.VALIDATION)
        )
    )


def _not_found_response() -> JSONResponse:
    """Return not found response"""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content=ResponseBuilder.not_found(
            message=ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME),
            error_code=_error_code(ErrorCodes.NOT_FOUND)
        )
    )


class PaginatedPersonnelResponse(BaseModel):
    """Paginated response model for personnel list"""
    data: List[PersonnelResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get(
    "/list-minimal",
    status_code=status.HTTP_200_OK,
    summary="Get minimal personnel list",
    description="Returns a lightweight list of all active, non-deleted personnel with only _id and name. Optimized for dropdowns and select components."
)
async def get_all_personnel_minimal(
    request: Request,
    search: Optional[str] = Query(None, description="Search by name (case-insensitive partial match)"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all active, non-deleted personnel with only _id and name (lightweight endpoint).

    This endpoint is optimized for low latency by returning only essential fields.
    Ideal for populating dropdown menus, autocomplete fields, and select components.
    Returns ALL personnel regardless of unit or district - only filters by active
    and non-deleted status.

    **Query Parameters:**
    - `search` (optional): Search by name (case-insensitive partial match)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel list fetched successfully"
    - `data`: Array of objects with `_id` and `name` only, sorted alphabetically by name

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        

        personnel_list = await list_personnel_minimal(search=search)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=personnel_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.LIST),
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching minimal {ENTITY_NAME_PLURAL.lower()} list")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


@router.post(
    "/create",
    response_model=PersonnelCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new personnel record",
    description="Creates a new personnel record with the provided details including unit assignments."
)
async def create_personnel_endpoint(
    personnel: PersonnelCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For")
):
    """
    Create a new personnel record.

    This endpoint creates a new personnel with all required fields including:
    - User credentials (email, password, userId)
    - Personal information (name, title, mobile, etc.)
    - Unit assignments with designations
    - Department and rank associations

    **Request Body (PersonnelCreateSchema):**
    - `email` (required): Unique email address (lowercase, RFC 5322)
    - `password` (required): Password (min 8 chars, will be hashed)
    - `userId` (required): Police User Identifier (exactly 8 digits)
    - `name` (required): Full name
    - `units` (required): Array of unit assignments with designationId
    - `departmentId` (required): Department reference
    - `rankId` (required): Rank reference
    - Other optional fields: title, firstName, lastName, mobile, badgeNo, etc.

    **Response (PersonnelCreateResponseSchema):**
    - `success`: true on success
    - `code`: 201
    - `message`: "Personnel created successfully"
    - `data`: Created personnel object

    **Error Responses:**
    - 400: Validation error (duplicate email/userId, invalid format)
    - 403: Permission denied (CREATE permission required)
    - 500: Internal server error

    **Side Effects:**
    - Adds personnel to unitPersonnelList in assigned units
    - Emits PERSONNEL_CREATED notification
    - Logs transaction with PERSONNEL_CREATED code
    """
    try:

        client_ip = get_client_ip(request)
        result = await create_personnel(personnel, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_CREATED,
            json_values={
                "personnelId": result.get("_id", ""),
                "name": result.get("name", ""),
                "email": result.get("email", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        # Emit notification for personnel creation
        # Notify both the creator and the created personnel
        recipient_ids = [current_user.id]
        created_personnel_id = result.get("_id")
        if created_personnel_id and created_personnel_id != current_user.id:
            recipient_ids.append(created_personnel_id)

        await emit_notification(
            request=request,
            notification_type=NotificationTypes.PERSONNEL_CREATED,
            contact_ids=recipient_ids,
            payload=build_personnel_created_payload(
                personnel_data=result,
                created_by_name=current_user.fullName or "System",
                created_by_id=current_user.id
            ),
            actor_user_id=current_user.id
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
            error_code=ErrorCodeConstants.PERSONNEL_CREATE_FAILED,
            parameters={"email": personnel.email, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.CREATE),
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_CREATE_FAILED,
            parameters={"email": personnel.email, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_CREATE_FAILED,
            parameters={"email": personnel.email, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.CREATE)
            )
        )


@router.post(
    "/bulk-create",
    response_model=PersonnelBulkCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create personnel records",
    description="Creates multiple personnel records in a single request with individual success/failure tracking."
)
async def bulk_create_personnel_endpoint(
    payload: PersonnelBulkCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For")
):
    """
    Bulk create personnel records.

    This endpoint processes multiple personnel creation requests in a single call.
    Each item is processed individually, allowing partial success.

    **Request Body (PersonnelBulkCreateSchema):**
    - `items` (required): Array of PersonnelCreateSchema objects (min 1 item)

    **Response (PersonnelBulkCreateResponseSchema):**
    - `success`: Array of successfully created personnel objects
    - `failed`: Array of failed items with error details (index, userId, email, errors)
    - `totalSuccess`: Count of successfully created records
    - `totalFailed`: Count of failed records

    **Error Responses:**
    - 403: Permission denied (CREATE permission required)

    **Behavior:**
    - Continues processing even if some items fail
    - Each item's success/failure is tracked independently
    - Failed items include index, userId, email, and error message
    - Logs errors for each failed item individually
    """

    client_ip = get_client_ip(request)
    success_list = []
    failed_list = []

    for index, item in enumerate(payload.items):
        try:
            created = await create_personnel(item, current_user.id, client_ip)
            success_list.append(created)
        except HTTPException as he:
            await log_error(
                request=request,
                error_code=ErrorCodeConstants.PERSONNEL_CREATE_FAILED,
                parameters={"email": item.email, "userId": item.userId, "errorMessage": str(he.detail)},
                actor_user_id=current_user.id
            )
            failed_list.append({
                "index": index,
                "userId": item.userId,
                "email": item.email,
                "errors": str(he.detail) if isinstance(he.detail, str) else str(he.detail)
            })
        except ValueError as ve:
            await log_error(
                request=request,
                error_code=ErrorCodeConstants.PERSONNEL_CREATE_FAILED,
                parameters={"email": item.email, "userId": item.userId, "errorMessage": str(ve)},
                actor_user_id=current_user.id
            )
            failed_list.append({
                "index": index,
                "userId": item.userId,
                "email": item.email,
                "errors": str(ve)
            })
        except Exception as e:
            logger.exception(f"bulk_create_personnel failed for item {index}")
            await log_error_with_exception(
                request=request,
                error_code=ErrorCodeConstants.PERSONNEL_CREATE_FAILED,
                parameters={"email": item.email, "userId": item.userId, "errorMessage": str(e)},
                exception=e,
                actor_user_id=current_user.id
            )
            failed_list.append({
                "index": index,
                "userId": item.userId,
                "email": item.email,
                "errors": "Internal server error"
            })

    return PersonnelBulkCreateResponseSchema(
        success=success_list,
        failed=failed_list,
        totalSuccess=len(success_list),
        totalFailed=len(failed_list)
    )


@router.get(
    "/list",
    status_code=status.HTTP_200_OK,
    summary="List all personnel",
    description="Retrieves a paginated list of personnel with optional filters and search. Results are filtered based on user's unit hierarchy."
)
async def get_all_personnel_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    search: Optional[str] = Query(None, description="Search in name, email, userId, badgeNo"),
    unitId: Optional[str] = Query(None, description="Filter by unit ID"),
    departmentId: Optional[str] = Query(None, description="Filter by department ID"),
    rankId: Optional[str] = Query(None, description="Filter by rank ID"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all personnel with optional pagination, filters, and hierarchy-based access control.

    Results are automatically filtered based on the user's assigned unit hierarchy:
    - Users can only see personnel in their own unit and descendant units
    - Personnel in parent and sibling units are not visible
    - Top-level users (no parent unit) can see all personnel in their district

    This endpoint retrieves personnel records with support for:
    - Full-text search across multiple fields
    - Filtering by unit, department, or rank
    - Pagination with configurable page size
    - Inclusion of soft-deleted records

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `search` (optional): Search in name, firstName, lastName, email, userId, badgeNo
    - `unitId` (optional): Filter by unit ID (must be valid ObjectId)
    - `departmentId` (optional): Filter by department ID (must be valid ObjectId)
    - `rankId` (optional): Filter by rank ID (must be valid ObjectId)
    - `page` (optional): Page number (starts at 1)
    - `page_size` (optional): Records per page (1-1000)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel list fetched successfully"
    - `data`: Array of personnel objects with populated relations (filtered by hierarchy)
    - `pagination`: Pagination metadata (totalItems, page, pageSize, totalPages)

    **Error Responses:**
    - 400: Invalid ID format for filter parameters
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        # Validate ObjectId format for filter fields (commented out to allow flexible filtering)
        if unitId and not ObjectId.is_valid(unitId):
            return _invalid_id_response("unit")
        if departmentId and not ObjectId.is_valid(departmentId):
            return _invalid_id_response("department")
        if rankId and not ObjectId.is_valid(rankId):
            return _invalid_id_response("rank")

        # Get accessible unit IDs based on user's hierarchy
        accessible_unit_ids = await HierarchyAccessService.get_accessible_unit_ids(
            user_unit_id=current_user.unitId,
            district_id=current_user.districtId,
            include_deleted=include_deleted
        )

        personnel_list, total = await list_personnel(
            include_deleted=include_deleted,
            search=search,
            unit_id=unitId,
            department_id=departmentId,
            rank_id=rankId,
            page=page,
            page_size=page_size,
            accessible_unit_ids=accessible_unit_ids
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=personnel_list,
                total=total,
                page=page,
                page_size=page_size,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


@router.get(
    "/by-unit/{unit_id}",
    status_code=status.HTTP_200_OK,
    summary="Get personnel by unit",
    description="Retrieves all personnel assigned to a specific unit with optional filters."
)
async def get_personnel_by_unit_endpoint(
    unit_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    isActive: Optional[bool] = Query(None, description="Filter by active status (true/false). If not provided, returns all."),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all personnel assigned to a specific unit.

    This endpoint queries the personnel collection where the units array
    contains the given unitId. It also returns the unit's responsible user ID.

    **Path Parameters:**
    - `unit_id` (required): Unit ID to filter by (must be valid ObjectId)

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `isActive` (optional): Filter by active status (true/false, null for all)
    - `page` (optional): Page number (starts at 1)
    - `page_size` (optional): Records per page (1-1000)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel fetched successfully for unit"
    - `data`: Array of personnel objects with populated relations
    - `total`: Total count of matching records
    - `totalPersonnelCount`: Same as total (for compatibility)
    - `responsibleUserId`: Unit's responsible user ID (unit head)
    - `page`: Current page number
    - `page_size`: Records per page
    - `total_pages`: Total number of pages

    **Error Responses:**
    - 400: Invalid unit ID format
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        if not ObjectId.is_valid(unit_id):
            return _invalid_id_response("unit")

        personnel_list, total, responsible_user_id = await get_personnel_by_unit(
            unit_id=unit_id,
            include_deleted=include_deleted,
            is_active=isActive,
            page=page,
            page_size=page_size
        )

        # Build response with totalPersonnelCount and responsibleUserId
        response_content = api_paginated(
            data=personnel_list,
            total=total,
            page=page,
            page_size=page_size,
            message=f"{ENTITY_NAME} fetched successfully for unit"
        )
        # Add totalPersonnelCount - total count regardless of pagination
        response_content["totalPersonnelCount"] = total
        # Add responsibleUserId from unit - to identify the unit head
        response_content["responsibleUserId"] = responsible_user_id

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response_content
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME_PLURAL.lower()} by unit")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"unitId": unit_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


@router.get(
    "/{personnel_id}",
    response_model=PersonnelResponseSchema,
    status_code=status.HTTP_200_OK,
    summary="Get personnel by ID",
    description="Retrieves a single personnel record by ID with populated relations."
)
async def get_personnel_endpoint(
    personnel_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a personnel record by ID.

    This endpoint retrieves a single personnel record with all populated
    relations (units, designations, department, rank). Includes soft-deleted
    records to allow viewing of archived data.

    **Path Parameters:**
    - `personnel_id` (required): Personnel ID (must be valid ObjectId)

    **Response (PersonnelResponseSchema):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel fetched successfully"
    - `data`: Personnel object with populated relations:
      - `_id`: Personnel MongoDB _id
      - `email`: Login identifier
      - `name`: Full name
      - `userId`: Police User Identifier (8 digits)
      - `units`: Array of unit assignments with populated unit/designation data
      - `department`: Populated department object
      - `rank`: Populated rank object
      - Other fields as per schema

    **Error Responses:**
    - 400: Invalid personnel ID format
    - 403: Permission denied (READ permission required)
    - 404: Personnel not found
    - 500: Internal server error
    """
    try:
    

        if not ObjectId.is_valid(personnel_id):
            return _invalid_id_response()

        personnel = await get_personnel(personnel_id)

        if not personnel:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodeConstants.PERSONNEL_GET_NOT_FOUND,
                parameters={"personnelId": personnel_id, "errorMessage": "Personnel not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=personnel,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_GET_NOT_FOUND,
            parameters={"personnelId": personnel_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.READ),
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_GET_NOT_FOUND,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.READ)
            )
        )


@router.patch(
    "/update/{personnel_id}",
    response_model=PersonnelResponseSchema,
    status_code=status.HTTP_200_OK,
    summary="Update a personnel record",
    description="Updates an existing personnel record with the provided fields."
)
async def update_personnel_endpoint(
    personnel_id: str,
    personnel_update: PersonnelUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For")
):
    """
    Update a personnel record.

    This endpoint updates an existing personnel record. Only provided fields
    are updated (PATCH semantics). Note: userId cannot be updated once created.

    **Path Parameters:**
    - `personnel_id` (required): Personnel ID to update (must be valid ObjectId)

    **Request Body (PersonnelUpdateSchema):**
    - `email` (optional): New email address
    - `name` (optional): New full name
    - `units` (optional): New unit assignments array
    - `departmentId` (optional): New department reference
    - `rankId` (optional): New rank reference
    - `password` (optional): New password (will be hashed)
    - Other optional fields as per schema
    - Note: `userId` is NOT updatable

    **Response (PersonnelResponseSchema):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel updated successfully"
    - `data`: Updated personnel object

    **Error Responses:**
    - 400: Validation error (duplicate email, invalid format, no fields to update)
    - 403: Permission denied (UPDATE permission required)
    - 404: Personnel not found
    - 500: Internal server error

    **Side Effects:**
    - Syncs unitPersonnelList in units if units array is modified
    - Emits PERSONNEL_UPDATED notification
    - Logs transaction with PERSONNEL_UPDATED code
    """
    try:
        

        if not ObjectId.is_valid(personnel_id):
            return _invalid_id_response()

        client_ip = get_client_ip(request)

        # Get the list of updated fields from the update schema
        updated_fields = list(personnel_update.model_dump(exclude_unset=True).keys())

        result = await update_personnel(personnel_id, personnel_update, current_user.id, client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_UPDATED,
            json_values={
                "personnelId": personnel_id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        # Emit notification for personnel update
        # Notify both the updater and the updated personnel
        recipient_ids = [current_user.id]
        updated_personnel_id = result.get("_id")
        if updated_personnel_id and updated_personnel_id != current_user.id:
            recipient_ids.append(updated_personnel_id)

        # Extract changes from result (contains old → new values)
        changes = result.pop("_changes", {})

        await emit_notification(
            request=request,
            notification_type=NotificationTypes.PERSONNEL_UPDATED,
            contact_ids=recipient_ids,
            payload=build_personnel_updated_payload(
                personnel_data=result,
                changes=changes,
                updated_by_name=current_user.fullName or "System",
                updated_by_id=current_user.id
            ),
            actor_user_id=current_user.id
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
            error_code=ErrorCodeConstants.PERSONNEL_UPDATE_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.UPDATE),
                code=e.status_code
            )
        )
    except ValueError as e:
        # ValueError is already logged by the service with the correct error code
        # Just use the error message directly from the ValueError
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_UPDATE_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.UPDATE)
            )
        )


@router.delete(
    "/delete/{personnel_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a personnel record",
    description="Soft deletes a personnel record by setting isDelete=true."
)
async def delete_personnel_endpoint(
    personnel_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For")
):
    """
    Soft delete a personnel record.

    This endpoint performs a soft delete by setting isDelete=true. The record
    remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `personnel_id` (required): Personnel ID to delete (must be valid ObjectId)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid personnel ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Personnel not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Removes personnel from unitPersonnelList in all assigned units
    - Logs transaction with PERSONNEL_DELETED code
    """
    try:

        if not ObjectId.is_valid(personnel_id):
            return _invalid_id_response()

        client_ip = get_client_ip(request)
        await delete_personnel(personnel_id, current_user.id, client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_DELETED,
            json_values={
                "personnelId": personnel_id,
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
            error_code=ErrorCodeConstants.PERSONNEL_DELETE_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.DELETE),
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_DELETE_NOT_FOUND,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=error_message,
                error_code=_error_code(ErrorCodes.NOT_FOUND)
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_DELETE_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.DELETE)
            )
        )


@router.patch(
    "/restore/{personnel_id}",
    status_code=status.HTTP_200_OK,
    summary="Restore a deleted personnel record",
    description="Restores a soft-deleted personnel record by setting isDelete=false."
)
async def restore_personnel_endpoint(
    personnel_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For")
):
    """
    Restore a soft-deleted personnel record.

    This endpoint restores a previously soft-deleted personnel record by
    setting isDelete=false. The record becomes visible in normal queries again.

    **Path Parameters:**
    - `personnel_id` (required): Personnel ID to restore (must be valid ObjectId)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel restored successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid personnel ID format or personnel not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Personnel not found
    - 500: Internal server error

    **Side Effects:**
    - Re-adds personnel to unitPersonnelList in all assigned units
    - Logs transaction with PERSONNEL_RESTORED code
    """
    try:
        if not ObjectId.is_valid(personnel_id):
            return _invalid_id_response()

        client_ip = get_client_ip(request)
        await restore_personnel(personnel_id, current_user.id, restored_ip=client_ip)

        # Log successful restore
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_RESTORED,
            json_values={
                "personnelId": personnel_id,
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
            error_code=ErrorCodeConstants.PERSONNEL_UPDATE_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.RESTORE),
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_UPDATE_NOT_FOUND,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_UPDATE_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.RESTORE)
            )
        )


@router.post(
    "/by-units-and-role",
    response_model=PersonnelByUnitsAndRoleResponseSchema,
    status_code=status.HTTP_200_OK,
    summary="Get personnel by multiple units and role",
    description="Retrieves personnel who have a role mapping in user_role_permissions for the specified units and role."
)
async def get_personnel_by_units_and_role_endpoint(
    payload: PersonnelByUnitsAndRoleRequestSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get personnel by multiple units and role.

    This endpoint queries user_role_permissions_master to find personnel who:
    1. Are assigned to any of the specified units (via unitId in user_role_permissions)
    2. Have the specified role mapping (via roleId in user_role_permissions)

    Uses an efficient MongoDB aggregation pipeline with $lookup joins to:
    - Filter user_role_permissions by roleId and unitIds
    - Join with personnel_master for user details
    - Join with unit_master for unit names
    - Join with rank_master for rank names

    **Request Body (PersonnelByUnitsAndRoleRequestSchema):**
    - `unitIds` (required): Array of unit IDs to filter by (at least one required)
    - `roleId` (required): Role ID to filter by
    - `includeDeleted` (optional): Include soft-deleted records (default: false)

    **Response (PersonnelByUnitsAndRoleResponseSchema):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Personnel fetched successfully"
    - `data`: Array of personnel objects with:
      - `_id`: Personnel MongoDB _id
      - `personnelId`: Personnel MongoDB _id (duplicate for convenience)
      - `userId`: Police User Identifier (8 digits)
      - `userName`: Full name
      - `email`: Personnel email
      - `unitId`: Unit ID from user_role_permissions
      - `unitObjectId`: Unit MongoDB _id
      - `unitName`: Unit name
      - `rankId`: Rank ID from personnel
      - `rankName`: Rank name
      - `roleId`: Role ID from user_role_permissions
      - `isActive`: Active status
    - `total`: Total count of matching personnel

    **Error Responses:**
    - 400: Validation error (invalid unitIds or roleId format)
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        # Call service function
        personnel_list, total = await get_personnel_by_units_and_role(
            unit_ids=payload.unitIds,
            role_id=payload.roleId,
            include_deleted=payload.includeDeleted
        )

        # Log successful fetch
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_LIST_VIEWED,
            json_values={
                "roleId": payload.roleId,
                "unitIds": payload.unitIds,
                "totalResults": total,
                "fetchedBy": current_user.id,
                "queryType": "by-units-and-role"
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "code": 200,
                "message": SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME),
                "data": personnel_list,
                "total": total
            }
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"roleId": payload.roleId, "unitIds": payload.unitIds, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME_PLURAL.lower()} by units and role")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"roleId": payload.roleId, "unitIds": payload.unitIds, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


@router.get(
    "/unit-hierarchy-with-personnel/{personnel_id}",
    summary="Get unit hierarchy with personnel by personnel ID",
    description="""
    Get the complete unit hierarchy with personnel for a given personnel ID.

    This endpoint:
    1. Finds the unit where the given personnel is the responsible user (responsibleUserId)
    2. Retrieves the complete hierarchy of that unit (all descendant units)
    3. For each unit in the hierarchy, fetches all active personnel with full details
    4. Returns a hierarchical structure with personnel at each level

    **Response Structure:**
    - `data`: Hierarchical unit structure with personnel
      - `unitId`: Unit ID
      - `unitName`: Unit name
      - `relativeLevel`: Level in hierarchy (0 = root, 1 = direct children, etc.)
      - `personnel`: Array of personnel in this unit (with rank, designation, etc.)
      - `personnelCount`: Number of personnel in this unit
      - `children`: Array of child units (same structure, recursive)
    - `totalUnits`: Total number of units in the hierarchy
    - `totalPersonnel`: Total number of personnel across all units

    **Note:** Returns 404 if the personnel is not a responsible user for any unit.
    """,
    response_description="Unit hierarchy with personnel data"
)
async def get_unit_hierarchy_with_personnel_endpoint(
    personnel_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get unit hierarchy with personnel for a given personnel ID.

    OPTIMIZED: Uses batch queries for efficient data retrieval.
    - 1 query to find the responsible unit
    - 1 query to fetch all units
    - 1 query to fetch all personnel for the hierarchy
    - Batch population of personnel relations

    Args:
        personnel_id: Personnel ID to find their responsible unit

    Returns:
        Hierarchical structure with unit info and personnel at each level
    """
    try:
        # Validate ObjectId format
        if not ObjectId.is_valid(personnel_id):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=get_validation_error("invalid_objectid", field_name="personnel_id"),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )

        # Call the optimized service function
        result = await get_unit_hierarchy_with_personnel(personnel_id)

        # Log successful transaction
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_LIST_VIEWED,
            json_values={"personnelId": personnel_id, "totalUnits": result.get("totalUnits"), "totalPersonnel": result.get("totalPersonnel")},
            actor_user_id=current_user.id
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=result
        )

    except ValueError as e:
        error_message = str(e)

        # Check if it's a "not responsible for any unit" error
        if "not responsible for any unit" in error_message.lower():
            await log_error(
                request=request,
                error_code=ErrorCodeConstants.PERSONNEL_GET_NOT_FOUND,
                parameters={"personnelId": personnel_id, "reason": error_message},
                actor_user_id=current_user.id
            )
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        # Other validation errors
        await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": error_message},
            actor_user_id=current_user.id
        )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )

    except Exception as e:
        logger.exception(f"Error fetching unit hierarchy with personnel for personnel_id: {personnel_id}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


@router.get(
    "/subordinates-by-rank/{personnel_id}",
    summary="Get subordinate personnel by rank for a given personnel",
    description="""
    Get all subordinate personnel (lower rank) for a given personnel across all their assigned units.

    This endpoint:
    1. Gets the given personnel's rank level and unit assignments
    2. For each unit the personnel is assigned to, fetches all personnel in that unit
    3. Filters to return only personnel with rank level GREATER than the given personnel
       (Higher level number = lower rank = subordinate)
    4. Returns results grouped by unit

    **Rank Level Logic:**
    - Higher number = Lower rank (subordinate)
    - Example: DGP=1, IGP=2, SP=3, DSP=4, Inspector=5, SI=6, ASI=7, Constable=10
    - If given personnel is Inspector (level 5), returns personnel with level > 5

    **Response Structure:**
    - `data.givenPersonnel`: Info about the given personnel (name, rank, units)
    - `data.unitWisePersonnel`: Array of units with subordinate personnel
      - `unitId`: Unit ID
      - `unitName`: Unit name
      - `personnel`: Array of subordinate personnel in this unit
      - `personnelCount`: Count of subordinates in this unit
    - `totalPersonnel`: Total unique subordinate personnel count
    - `filterCriteria`: Details about the filter applied

    **Note:**
    - Returns 404 if personnel not found
    - Returns 400 if personnel has no rank or no unit assignments
    - Same personnel appearing in multiple units is counted once in totalPersonnel
    """,
    response_description="Subordinate personnel grouped by unit"
)
async def get_subordinate_personnel_by_rank_endpoint(
    personnel_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get subordinate personnel by rank for a given personnel.

    Args:
        personnel_id: Personnel ID to find subordinates for

    Returns:
        Subordinate personnel grouped by unit with rank level > given personnel's rank level
    """
    try:
        # Validate ObjectId format
        if not ObjectId.is_valid(personnel_id):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=get_validation_error("invalid_objectid", field_name="personnel_id"),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )

        # Call the service function
        result = await get_subordinate_personnel_by_rank(personnel_id)

        # Log successful transaction
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_LIST_VIEWED,
            json_values={
                "personnelId": personnel_id,
                "totalPersonnel": result.get("totalPersonnel"),
                "filterCriteria": result.get("filterCriteria")
            },
            actor_user_id=current_user.id
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=result
        )

    except ValueError as e:
        error_message = str(e)

        # Check if it's a "not found" error
        if "not found" in error_message.lower():
            await log_error(
                request=request,
                error_code=ErrorCodeConstants.PERSONNEL_NOT_FOUND,
                parameters={"personnelId": personnel_id, "reason": error_message},
                actor_user_id=current_user.id
            )
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        # Other validation errors (no rank, no unit, etc.)
        await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": error_message},
            actor_user_id=current_user.id
        )
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )

    except Exception as e:
        logger.exception(f"Error fetching subordinate personnel for personnel_id: {personnel_id}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERSONNEL_LIST_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )
