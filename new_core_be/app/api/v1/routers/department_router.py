"""
Department Router
Provides API endpoints for Department management
Routes: /api/v1/departments

Uses the new middleware/decorator pattern:
- PermissionChecker dependency for RBAC
- @handle_errors decorator for exception handling
- @log_operation decorator for transaction logging
- request.state.client_ip from middleware
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

# Schemas
from app.api.v1.schemas.department_schema import (
    DepartmentCreateSchema,
    DepartmentUpdateSchema,
    DepartmentResponseSchema,
    DepartmentBulkCreateSchema,
    DepartmentBulkCreateResponseSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema

# Dependencies
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.dependencies.permission_checker import PermissionChecker

# Decorators
from app.api.v1.decorators.error_handler import handle_errors
from app.api.v1.decorators.transaction_logger import log_operation

# Standard response utilities
from app.api.v1.utils.standard_response import (
    ResponseBuilder,
    api_success,
    api_created,
    api_paginated
)

# Constants
from app.constants.api_constants import SuccessMessages, ErrorMessages
from app.constants.error_codes import ErrorCodes
from app.constants.jobs import Jobs
from app.constants.log_codes import LogCodes

# Services
from app.api.v1.services.department_service import (
    create_department,
    update_department,
    delete_department,
    restore_department,
    get_department,
    list_departments
)

# For bulk create error logging
from app.api.v1.services.error_logger import log_error, log_error_with_exception

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/departments", tags=["departments"])

# Job name for RBAC permission checks
JOB_NAME = Jobs.DEPARTMENTS
ENTITY_NAME = "Department"
ENTITY_NAME_PLURAL = "Departments"


class PaginatedDepartmentResponse(BaseModel):
    """Paginated response model for departments list"""
    data: List[DepartmentResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


# =============================================================================
# CREATE
# =============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new department",
    description="Creates a new department record with the provided details."
)
@handle_errors(ErrorCodes.DEPARTMENT_CREATE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.DEPARTMENT_CREATED, ["_id", "name"])
async def create_department_endpoint(
    department: DepartmentCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "CREATE", ErrorCodes.DEPARTMENT_CREATE_FAILED, ENTITY_NAME))
):
    """
    Create a new department record.

    **Request Body (DepartmentCreateSchema):**
    - `name` (required): Department name
    - `cctnsDepartmentCd` (required): Unique CCTNS department code
    - `description` (optional): Department description
    - `isActive` (optional): Active status (default: true)

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Department created successfully"
    - `data`: Created department object with _id and audit fields

    **Error Responses:**
    - 400: Validation error
    - 403: Permission denied (CREATE permission required)
    - 409: Conflict (duplicate name or cctnsDepartmentCd)
    - 500: Internal server error
    """
    # Get client IP from middleware
    client_ip = request.state.client_ip

    # Prepare data
    department_data = department.model_dump()
    department_data["createdIp"] = client_ip

    # Create department
    result = await create_department(department_data, current_user.id, request=request)

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=api_created(
            data=result,
            message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
        )
    )


# =============================================================================
# BULK CREATE
# =============================================================================

@router.post(
    "/bulk-create",
    response_model=DepartmentBulkCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create departments",
    description="Creates multiple department records in a single request with individual error handling."
)
@handle_errors(ErrorCodes.DEPARTMENT_CREATE_FAILED, ENTITY_NAME)
async def bulk_create_department_endpoint(
    payload: DepartmentBulkCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "CREATE", ErrorCodes.DEPARTMENT_CREATE_FAILED, ENTITY_NAME))
):
    """
    Bulk create department records.

    This endpoint processes multiple department creation requests in a single call.
    Each item is processed individually, allowing partial success.

    **Request Body (DepartmentBulkCreateSchema):**
    - `items` (required): Array of DepartmentCreateSchema objects

    **Response (DepartmentBulkCreateResponseSchema):**
    - `success`: Array of successfully created department objects
    - `failed`: Array of failed items with index, name, and error details
    - `totalSuccess`: Count of successfully created records
    - `totalFailed`: Count of failed records
    """
    client_ip = request.state.client_ip
    success_list = []
    failed_list = []

    for index, item in enumerate(payload.items):
        try:
            item_data = item.model_dump()
            item_data["createdIp"] = client_ip
            created = await create_department(item_data, current_user.id, request=request)
            success_list.append(created)
        except HTTPException as he:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.DEPARTMENT_CREATE_FAILED,
                parameters={"name": item.name, "errorMessage": str(he.detail)},
                actor_user_id=current_user.id
            )
            failed_list.append({
                "index": index,
                "name": item.name,
                "error": (error_log or {}).get("resolvedMessage") or str(he.detail)
            })
        except ValueError as ve:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.DEPARTMENT_CREATE_FAILED,
                parameters={"name": item.name, "errorMessage": str(ve)},
                actor_user_id=current_user.id
            )
            failed_list.append({
                "index": index,
                "name": item.name,
                "error": (error_log or {}).get("resolvedMessage") or str(ve)
            })
        except Exception as exc:
            logger.exception(f"bulk_create_department failed for item {index}")
            error_log = await log_error_with_exception(
                request=request,
                error_code=ErrorCodes.DEPARTMENT_CREATE_FAILED,
                parameters={"name": item.name},
                exception=exc,
                actor_user_id=current_user.id
            )
            failed_list.append({
                "index": index,
                "name": item.name,
                "error": (error_log or {}).get("resolvedMessage") or "Internal server error"
            })

    return DepartmentBulkCreateResponseSchema(
        success=success_list,
        failed=failed_list,
        totalSuccess=len(success_list),
        totalFailed=len(failed_list)
    )


# =============================================================================
# LIST
# =============================================================================

@router.get(
    "/list",
    status_code=status.HTTP_200_OK,
    summary="List all departments",
    description="Retrieves a paginated list of departments with optional filters."
)
@handle_errors(ErrorCodes.DEPARTMENT_LIST_FAILED, ENTITY_NAME)
async def get_all_departments_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    is_active: Optional[bool] = Query(True, description="Filter by active status (true=active only, false=inactive only, null=all)"),
    search: Optional[str] = Query(None, description="Search in name or cctnsDepartmentCd"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "READ", ErrorCodes.DEPARTMENT_LIST_FAILED, ENTITY_NAME))
):
    """
    List all departments with optional pagination and filters.

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `is_active` (optional): Filter by active status (default: true for active only)
    - `search` (optional): Search in name or cctnsDepartmentCd (case-insensitive)
    - `page` (optional): Page number (1-indexed), omit for all records
    - `page_size` (optional): Records per page (1-1000)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Department list fetched successfully"
    - `data`: Array of department objects
    - `pagination`: Pagination metadata (if page provided)
    """
    departments_list, total = await list_departments(
        include_deleted=include_deleted,
        is_active=is_active,
        search=search,
        page=page,
        page_size=page_size
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_paginated(
            data=departments_list,
            total=total,
            page=page,
            page_size=page_size,
            message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
        )
    )


# =============================================================================
# GET BY ID
# =============================================================================

@router.get(
    "/get/{department_id}",
    status_code=status.HTTP_200_OK,
    summary="Get department by ID",
    description="Retrieves a single department record by its ObjectId."
)
@handle_errors(ErrorCodes.DEPARTMENT_GET_NOT_FOUND, ENTITY_NAME)
async def get_department_endpoint(
    department_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "READ", ErrorCodes.DEPARTMENT_GET_NOT_FOUND, ENTITY_NAME))
):
    """
    Get a department record by ID.

    **Path Parameters:**
    - `department_id` (required): Department ObjectId

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Department fetched successfully"
    - `data`: Department object with all fields

    **Error Responses:**
    - 400: Invalid department ID format
    - 403: Permission denied (READ permission required)
    - 404: Department not found
    - 500: Internal server error
    """
    # Validate ObjectId
    if not ObjectId.is_valid(department_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
        )

    department = await get_department(department_id)

    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=department,
            message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
        )
    )


# =============================================================================
# UPDATE
# =============================================================================

@router.put(
    "/update/{department_id}",
    status_code=status.HTTP_200_OK,
    summary="Update a department",
    description="Updates an existing department record with the provided fields."
)
@handle_errors(ErrorCodes.DEPARTMENT_UPDATE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.DEPARTMENT_UPDATED, ["_id"])
async def update_department_endpoint(
    department_id: str,
    department_update: DepartmentUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "UPDATE", ErrorCodes.DEPARTMENT_UPDATE_FAILED, ENTITY_NAME))
):
    """
    Update a department record.

    **Path Parameters:**
    - `department_id` (required): Department ObjectId to update

    **Request Body (DepartmentUpdateSchema):**
    - `name` (optional): New department name
    - `cctnsDepartmentCd` (optional): New CCTNS department code
    - `description` (optional): New description
    - `isActive` (optional): New active status

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Department updated successfully"
    - `data`: Updated department object

    **Error Responses:**
    - 400: Validation error or invalid ID format
    - 403: Permission denied (UPDATE permission required)
    - 404: Department not found
    - 409: Conflict (duplicate name or cctnsDepartmentCd)
    - 500: Internal server error
    """
    # Validate ObjectId
    if not ObjectId.is_valid(department_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
        )

    # Get client IP from middleware
    client_ip = request.state.client_ip

    # Prepare update data
    update_data = department_update.model_dump(exclude_unset=True)
    update_data["updatedIp"] = client_ip

    # Update department
    result = await update_department(department_id, update_data, current_user.id, request=request)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=result,
            message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
        )
    )


# =============================================================================
# DELETE
# =============================================================================

@router.delete(
    "/delete/{department_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a department",
    description="Soft deletes a department record by setting isDelete=true."
)
@handle_errors(ErrorCodes.DEPARTMENT_DELETE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.DEPARTMENT_DELETED)
async def delete_department_endpoint(
    department_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "DELETE", ErrorCodes.DEPARTMENT_DELETE_FAILED, ENTITY_NAME))
):
    """
    Soft delete a department record.

    **Path Parameters:**
    - `department_id` (required): Department ObjectId to delete

    **Validation:**
    - Cannot delete if department has associated units

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Department deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid department ID format or department in use
    - 403: Permission denied (DELETE permission required)
    - 404: Department not found or already deleted
    - 500: Internal server error
    """
    # Validate ObjectId
    if not ObjectId.is_valid(department_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
        )

    # Get client IP from middleware
    client_ip = request.state.client_ip

    # Delete department
    await delete_department(department_id, current_user.id, deleted_ip=client_ip, request=request)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=None,
            message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
        )
    )


# =============================================================================
# RESTORE
# =============================================================================

@router.patch(
    "/restore/{department_id}",
    status_code=status.HTTP_200_OK,
    summary="Restore a deleted department",
    description="Restores a soft-deleted department record by setting isDelete=false."
)
@handle_errors(ErrorCodes.DEPARTMENT_UPDATE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.DEPARTMENT_RESTORED, ["_id"])
async def restore_department_endpoint(
    department_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "UPDATE", ErrorCodes.DEPARTMENT_UPDATE_FAILED, ENTITY_NAME))
):
    """
    Restore a soft-deleted department record.

    **Path Parameters:**
    - `department_id` (required): Department ObjectId to restore

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Department restored successfully"
    - `data`: Restored department object

    **Error Responses:**
    - 400: Invalid department ID format or department not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Department not found
    - 500: Internal server error
    """
    # Validate ObjectId
    if not ObjectId.is_valid(department_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
        )

    # Get client IP from middleware
    client_ip = request.state.client_ip

    # Restore department
    restored = await restore_department(department_id, current_user.id, restored_ip=client_ip, request=request)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=restored,
            message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
        )
    )
