"""
Role Router
Provides API endpoints for Role management
Routes: /api/v1/roles
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.role_schema import (
    RoleCreateSchema,
    RoleResponseSchema,
    RoleUpdateSchema,
    RoleBulkCreateSchema,
    RoleBulkCreateResponseSchema
)
from app.api.v1.services.role_service import (
    create_role,
    update_role,
    delete_role,
    restore_role,
    get_role,
    list_roles,
    count_roles
)
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages
from app.constants.error_codes import ErrorCodes
from app.constants.log_codes import LogCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/roles", tags=["roles"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.ROLES

# Entity name for messages
ENTITY_NAME = "Role"
ENTITY_NAME_PLURAL = "Roles"


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new role",
    description="Creates a new role with permissions hierarchy for RBAC."
)
async def create_role_endpoint(
    role: RoleCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new role.

    This endpoint creates a new role with a permissions hierarchy that defines
    what actions users with this role can perform on various modules and jobs.

    **Request Body (RoleCreateSchema):**
    - `name` (required): Role name (must contain alphabets)
    - `shortCode` (required): Unique short code for the role
    - `description` (optional): Role description
    - `permissions` (required): Array of module permissions with structure:
      - `moduleId`: Reference to modules_master
      - `jobs`: Array of job permissions containing:
        - `jobId`: Reference to jobs_master
        - `permissions`: Array of permission IDs (CREATE, READ, UPDATE, DELETE)

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Role created successfully"
    - `data`: Created role object with all fields

    **Error Responses:**
    - 400: Validation error (invalid name format, missing fields)
    - 403: Permission denied (CREATE permission required)
    - 409: Conflict (duplicate name or shortCode)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with ROLE_CREATED code
    """
    try:
 
        # Get client IP
        client_ip = get_client_ip(request)

        created = await create_role(role, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.ROLE_CREATED,
            json_values={
                "roleId": created.get("_id", ""),
                "name": created.get("name", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=created,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_CREATE_FAILED,
            parameters={"name": role.name, "shortCode": role.shortCode, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        if e.status_code == status.HTTP_409_CONFLICT:
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_CREATE_FAILED
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_CREATE_FAILED,
            parameters={"name": role.name, "shortCode": role.shortCode, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.ROLE_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.ROLE_CREATE_FAILED,
            parameters={"name": role.name, "shortCode": role.shortCode, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.ROLE_CREATE_FAILED
            )
        )


@router.post(
    "/bulk-create",
    response_model=RoleBulkCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create roles",
    description="Creates multiple role records in a single request with individual error handling."
)
async def bulk_create_role_endpoint(
    payload: RoleBulkCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Bulk create role records.

    This endpoint processes multiple role creation requests in a single call.
    Each item is processed individually, allowing partial success.

    **Request Body (RoleBulkCreateSchema):**
    - `items` (required): Array of RoleCreateSchema objects

    **Response (RoleBulkCreateResponseSchema):**
    - `success`: Array of successfully created role objects
    - `failed`: Array of failed items with index, name, shortCode, and error details
    - `totalSuccess`: Count of successfully created records
    - `totalFailed`: Count of failed records

    **Processing Behavior:**
    - Each item is processed independently
    - Failures do not stop processing of remaining items
    - Individual item errors are captured and returned in failed list

    **Error Responses:**
    - 403: Permission denied (CREATE permission required)
    """

    success_list = []
    failed_list = []

    # Get client IP
    client_ip = get_client_ip(request)

    for index, item in enumerate(payload.items):
        try:
            created = await create_role(item, current_user.id, client_ip)
            success_list.append(created)
        except HTTPException as he:
            failed_list.append({
                "index": index,
                "name": item.name,
                "shortCode": item.shortCode,
                "errors": str(he.detail) if isinstance(he.detail, str) else str(he.detail)
            })
        except ValueError as ve:
            failed_list.append({
                "index": index,
                "name": item.name,
                "shortCode": item.shortCode,
                "errors": str(ve)
            })
        except Exception as exc:
            logger.exception(f"bulk_create_role failed for item {index}")
            failed_list.append({
                "index": index,
                "name": item.name,
                "shortCode": item.shortCode,
                "errors": "Internal server error"
            })

    return RoleBulkCreateResponseSchema(
        success=success_list,
        failed=failed_list,
        totalSuccess=len(success_list),
        totalFailed=len(failed_list)
    )


@router.put(
    "/update/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Update a role",
    description="Updates an existing role record with the provided fields."
)
async def update_role_endpoint(
    role_id: str,
    role_update: RoleUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing role.

    This endpoint updates a role with partial data. Only provided fields
    are updated. Permission IDs are validated if permissions array is modified.

    **Path Parameters:**
    - `role_id` (required): Role ObjectId to update

    **Request Body (RoleUpdateSchema):**
    - `name` (optional): New role name
    - `shortCode` (optional): New short code
    - `description` (optional): New description
    - `permissions` (optional): New permissions hierarchy

    **Automatic Updates:**
    - `updatedAt`: Current timestamp
    - `updatedBy`: Current user ID
    - `updatedIp`: Client IP address

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Role updated successfully"
    - `data`: Updated role object

    **Error Responses:**
    - 400: Validation error or invalid ID format
    - 403: Permission denied (UPDATE permission required)
    - 404: Role not found
    - 409: Conflict (duplicate name or shortCode)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with ROLE_UPDATED code
    """
    try:

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await update_role(role_id, role_update.model_dump(exclude_unset=True), current_user.id, client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.ROLE_UPDATED,
            json_values={
                "roleId": role_id,
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
        error_code = ErrorCodes.ROLE_UPDATE_NOT_FOUND if e.status_code == status.HTTP_404_NOT_FOUND else ErrorCodes.ROLE_UPDATE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"id": role_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        if e.status_code == status.HTTP_404_NOT_FOUND:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_409_CONFLICT:
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_UPDATE_FAILED
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_UPDATE_FAILED
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_UPDATE_FAILED,
            parameters={"id": role_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.ROLE_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.ROLE_UPDATE_FAILED,
            parameters={"id": role_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.ROLE_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a role",
    description="Soft deletes a role record by setting isDelete=true."
)
async def delete_role_endpoint(
    role_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a role.

    This endpoint performs a soft delete by setting isActive=false and
    isDelete=true. The record remains in the database but is excluded
    from normal queries.

    **Path Parameters:**
    - `role_id` (required): Role ObjectId to delete

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Role deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid role ID format or role in use
    - 403: Permission denied (DELETE permission required)
    - 404: Role not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with ROLE_DELETED code
    """
    try:


        # Get client IP
        client_ip = get_client_ip(request)

        await delete_role(role_id, current_user.id, client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.ROLE_DELETED,
            json_values={
                "roleId": role_id,
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
        error_code = ErrorCodes.ROLE_DELETE_NOT_FOUND if e.status_code == status.HTTP_404_NOT_FOUND else ErrorCodes.ROLE_DELETE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"id": role_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        if e.status_code == status.HTTP_404_NOT_FOUND:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_DELETE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_DELETE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.ROLE_DELETE_FAILED,
            parameters={"id": role_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.ROLE_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Restore a deleted role",
    description="Restores a soft-deleted role record by setting isDelete=false."
)
async def restore_role_endpoint(
    role_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted role.

    This endpoint restores a previously soft-deleted role by setting
    isActive=true and isDelete=false.

    **Path Parameters:**
    - `role_id` (required): Role ObjectId to restore

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Role restored successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid role ID format or role not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Role not found
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with ROLE_RESTORED code
    """
    try:


        # Get client IP
        client_ip = get_client_ip(request)

        await restore_role(role_id, current_user.id, client_ip)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.ROLE_RESTORED,
            json_values={
                "roleId": role_id,
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
        error_code = ErrorCodes.ROLE_UPDATE_NOT_FOUND if e.status_code == status.HTTP_404_NOT_FOUND else ErrorCodes.ROLE_UPDATE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"id": role_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        if e.status_code == status.HTTP_404_NOT_FOUND:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_UPDATE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.ROLE_UPDATE_FAILED,
            parameters={"id": role_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.ROLE_UPDATE_FAILED
            )
        )


@router.get(
    "/get/{role_id}",
    status_code=status.HTTP_200_OK,
    summary="Get role by ID",
    description="Retrieves a single role record by its ObjectId."
)
async def get_role_endpoint(
    role_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a role record by ID.

    This endpoint retrieves a single role record with its full permissions
    hierarchy structure.

    **Path Parameters:**
    - `role_id` (required): Role ObjectId

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Role fetched successfully"
    - `data`: Role object with permissions hierarchy

    **Error Responses:**
    - 400: Invalid role ID format
    - 403: Permission denied (READ permission required)
    - 404: Role not found
    - 500: Internal server error
    """
    try:


        role = await get_role(role_id)

        if not role:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.ROLE_GET_NOT_FOUND,
                parameters={"id": role_id, "errorMessage": "Role not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"{ENTITY_NAME} not found"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=role,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.ROLE_GET_NOT_FOUND,
            parameters={"id": role_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.ROLE_GET_NOT_FOUND
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.ROLE_GET_NOT_FOUND,
            parameters={"id": role_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.ROLE_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    status_code=status.HTTP_200_OK,
    summary="List all roles",
    description="Retrieves a paginated list of roles with optional filters."
)
async def list_roles_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    search: Optional[str] = Query(None, description="Search by name, shortCode, or description"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Number of records per page. Required when page is provided."),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all roles with optional pagination and filters.

    This endpoint retrieves role records with support for searching,
    filtering, and pagination.

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `search` (optional): Search in name, shortCode, or description (case-insensitive)
    - `page` (optional): Page number (1-indexed), omit for all records
    - `page_size` (optional): Records per page (1-100)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Role list fetched successfully"
    - `data`: Array of role objects with permissions
    - `total`: Total count of matching records
    - `page`: Current page number
    - `page_size`: Records per page
    - `total_pages`: Total number of pages

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        roles_list, total = await list_roles(
            include_deleted=include_deleted,
            search=search,
            page=page,
            page_size=page_size
        )

        # Use paginated response only when pagination is requested
        if page is not None and page_size is not None:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_paginated(
                    data=roles_list,
                    total=total,
                    page=page,
                    page_size=page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )

        # Return simple list response without pagination
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=roles_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.ROLE_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.ROLE_LIST_FAILED
            )
        )
