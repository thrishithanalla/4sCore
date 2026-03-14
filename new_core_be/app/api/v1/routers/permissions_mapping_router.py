"""
Permissions Mapping Router
Provides API endpoints for permissions mapping management
Routes: /api/v1/permissions-mapping
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.permissions_mapping_schema import (
    PermissionsMappingCreateSchema,
    PermissionsMappingUpdateSchema,
    PermissionsMappingResponseSchema
)
from app.api.v1.services.permissions_mapping_service import (
    create_permissions_mapping,
    bulk_create_permissions_mappings,
    update_permissions_mapping,
    delete_permissions_mapping,
    restore_permissions_mapping,
    get_permissions_mapping,
    list_permissions_mappings,
    count_permissions_mappings
)
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/permissions-mapping", tags=["permissions-mapping"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.PERMISSION_MAPPINGS

# Entity name for messages
ENTITY_NAME = "Permission Mapping"
ENTITY_NAME_PLURAL = "Permission Mappings"


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new permissions mapping",
    description="Creates a new permissions mapping linking a module, job, and permission for RBAC configuration."
)
async def create_permissions_mapping_endpoint(
    mapping_data: PermissionsMappingCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new permissions mapping to link module, job, and permission.

    This endpoint creates a new RBAC configuration entry that defines
    which permissions are available for a specific job within a module.

    **Request Body (PermissionsMappingCreateSchema):**
    - `moduleId` (required): FK to modules collection
    - `jobId` (required): FK to jobs collection
    - `permissionId` (required): FK to permissions collection

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Permission Mapping created successfully"
    - `data`: Created permissions mapping object

    **Error Responses:**
    - 400: Validation error (invalid IDs)
    - 403: Permission denied (CREATE permission required)
    - 409: Duplicate mapping already exists
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with PERMISSION_MAPPING_CREATED code
    - Records createdIp from request
    """
    try:
        # RBAC: Check CREATE permission
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        created = await create_permissions_mapping(mapping_data, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.PERMISSION_MAPPING_CREATED,
            json_values={
                "permissionMappingId": created.get("_id", ""),
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
        if e.status_code == status.HTTP_409_CONFLICT:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_CREATE_DUPLICATE,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_CREATE_DUPLICATE
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_CREATE_FAILED
            )
        )


@router.post(
    "/bulk-create",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create permissions mappings",
    description="Creates multiple permissions mappings in a single operation for efficient RBAC configuration."
)
async def bulk_create_permissions_mappings_endpoint(
    mappings_data: List[PermissionsMappingCreateSchema],
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create multiple permissions mappings in a single operation.

    This endpoint allows batch creation of RBAC configuration entries,
    useful when setting up permissions for a new module or job.

    **Request Body:**
    - Array of PermissionsMappingCreateSchema objects, each containing:
      - `moduleId` (required): FK to modules collection
      - `jobId` (required): FK to jobs collection
      - `permissionId` (required): FK to permissions collection

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Bulk created successfully"
    - `data`: Result object with created mappings

    **Error Responses:**
    - 400: Validation error (invalid IDs in any mapping)
    - 403: Permission denied (CREATE permission required)
    - 409: Duplicate mapping detected
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction for each created mapping
    - Records createdIp from request
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        result = await bulk_create_permissions_mappings(mappings_data, current_user.id, client_ip)
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=result,
                message=SuccessMessages.BULK_CREATED
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error bulk creating {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_CREATE_FAILED
            )
        )


@router.put(
    "/update/{mapping_id}",
    summary="Update a permissions mapping",
    description="Updates an existing permissions mapping with new module, job, or permission associations."
)
async def update_permissions_mapping_endpoint(
    mapping_id: str,
    mapping_data: PermissionsMappingUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing permissions mapping.

    This endpoint updates an RBAC configuration entry, allowing changes
    to the module, job, or permission associations.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the permissions mapping

    **Request Body (PermissionsMappingUpdateSchema):**
    All fields are optional:
    - `moduleId`: New FK to modules collection
    - `jobId`: New FK to jobs collection
    - `permissionId`: New FK to permissions collection

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Permission Mapping updated successfully"
    - `data`: Updated permissions mapping object

    **Error Responses:**
    - 400: Validation error or no fields to update
    - 403: Permission denied (UPDATE permission required)
    - 404: Permissions mapping not found
    - 409: Update would create duplicate mapping
    - 500: Internal server error

    **Side Effects:**
    - Updates updatedAt, updatedBy, and updatedIp automatically
    - Logs transaction with PERMISSION_MAPPING_UPDATED code
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        updated = await update_permissions_mapping(
            mapping_id,
            mapping_data.model_dump(exclude_unset=True),
            current_user.id,
            client_ip
        )

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.PERMISSION_MAPPING_UPDATED,
            json_values={
                "permissionMappingId": mapping_id,
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
        if e.status_code == status.HTTP_404_NOT_FOUND:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_409_CONFLICT:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{mapping_id}",
    summary="Soft delete a permissions mapping",
    description="Performs a soft delete on a permissions mapping by setting isDelete=True and isActive=False."
)
async def delete_permissions_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a permissions mapping.

    This endpoint performs a soft delete on an RBAC configuration entry.
    The record remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the permissions mapping

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Permission Mapping deleted successfully"

    **Error Responses:**
    - 400: Invalid mapping ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Permissions mapping not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Sets isActive=False, isDelete=True
    - Logs transaction with PERMISSION_MAPPING_DELETED code
    - Records updatedIp from request
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        await delete_permissions_mapping(mapping_id, current_user.id, client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.PERMISSION_MAPPING_DELETED,
            json_values={
                "permissionMappingId": mapping_id,
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
        if e.status_code == status.HTTP_404_NOT_FOUND:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_DELETE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_DELETE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_DELETE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_DELETE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_DELETE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{mapping_id}",
    summary="Restore a soft-deleted permissions mapping",
    description="Restores a soft-deleted permissions mapping by setting isDelete=False and isActive=True."
)
async def restore_permissions_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted permissions mapping.

    This endpoint restores a previously soft-deleted RBAC configuration entry,
    making it active and visible in normal queries again.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the permissions mapping

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Permission Mapping restored successfully"

    **Error Responses:**
    - 400: Invalid mapping ID format or mapping not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Permissions mapping not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isActive=True, isDelete=False
    - Logs transaction with PERMISSION_MAPPING_RESTORED code
    - Records updatedIp from request
    """
    try:


        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        await restore_permissions_mapping(mapping_id, current_user.id, client_ip)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.PERMISSION_MAPPING_RESTORED,
            json_values={
                "permissionMappingId": mapping_id,
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
        if e.status_code == status.HTTP_404_NOT_FOUND:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_UPDATE_FAILED
            )
        )


@router.get(
    "/get/{mapping_id}",
    summary="Get permissions mapping by ID",
    description="Retrieves a single permissions mapping by its MongoDB ObjectId."
)
async def get_permissions_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single permissions mapping by ID.

    This endpoint retrieves a specific RBAC configuration entry
    with its associated module, job, and permission information.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the permissions mapping

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Permission Mapping fetched successfully"
    - `data`: Permissions mapping object with populated fields

    **Error Responses:**
    - 400: Invalid mapping ID format
    - 403: Permission denied (READ permission required)
    - 404: Permissions mapping not found
    - 500: Internal server error
    """
    try:


        mapping = await get_permissions_mapping(mapping_id)

        if not mapping:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_GET_NOT_FOUND,
                parameters={"errorMessage": "Permission mapping not found", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"{ENTITY_NAME} not found"

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=mapping,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.PERM_MAPPING_GET_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.PERM_MAPPING_GET_NOT_FOUND
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_GET_NOT_FOUND,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    summary="List all permissions mappings",
    description="Retrieves all permissions mappings with optional pagination and filters for RBAC configuration management."
)
async def list_permissions_mappings_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    moduleId: Optional[str] = Query(None, description="Filter by module ID"),
    jobId: Optional[str] = Query(None, description="Filter by job ID"),
    permissionId: Optional[str] = Query(None, description="Filter by permission ID"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Number of records per page. Required when page is provided."),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all permissions mappings with optional pagination and filters.

    This endpoint retrieves RBAC configuration entries with support for
    filtering by module, job, or permission.

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `moduleId` (optional): Filter by module ID
    - `jobId` (optional): Filter by job ID
    - `permissionId` (optional): Filter by permission ID
    - `page` (optional): Page number starting from 1
    - `page_size` (optional): Items per page (1-100, default: 10)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Permission Mapping list fetched successfully"
    - `data`: Array of permissions mapping objects
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:


        # Default page_size to 10 when pagination is requested
        effective_page_size = page_size if page_size is not None else 10

        mappings_list, total = await list_permissions_mappings(
            include_deleted=include_deleted,
            moduleId=moduleId,
            jobId=jobId,
            permissionId=permissionId,
            page=page,
            page_size=effective_page_size
        )

        # Use paginated response only when pagination is requested
        if page is not None:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_paginated(
                    data=mappings_list,
                    total=total,
                    page=page,
                    page_size=effective_page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )

        # Return simple list response without pagination
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=mappings_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.PERM_MAPPING_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.PERM_MAPPING_LIST_FAILED
            )
        )
