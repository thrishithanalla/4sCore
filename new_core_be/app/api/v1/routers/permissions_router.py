"""
Permissions Router
Provides API endpoints for Permissions management
Routes: /api/v1/permissions
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.permissions_schema import (
    PermissionsCreateSchema,
    PermissionsResponseSchema,
    PermissionsUpdateSchema,
    PermissionsActiveToggleSchema
)
from app.api.v1.services.permissions_service import (
    create_permission,
    update_permission,
    delete_permission,
    restore_permission,
    toggle_active_permission,
    get_permission,
    list_permissions,
    bulk_create_permissions
)
from app.api.v1.dependencies.auth import get_current_user 
from app.api.v1.utils.standard_response import (
    ResponseBuilder,
    api_success,
    api_created,
    api_paginated,
    api_bulk
)
from app.constants.api_constants import (
    ErrorCodes,
    SuccessMessages,
    ErrorMessages,
    PermissionMessages,
    ModulePrefixes
)
from app.constants.jobs import Jobs
from app.constants.error_codes import ErrorCodes as ErrorCodeConstants
from app.constants.log_codes import LogCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/permissions",
    tags=["permissions"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication token"},
        403: {"description": "Forbidden - Insufficient permissions for this operation"},
        500: {"description": "Internal Server Error - Unexpected server error"}
    }
)

# Module configuration
MODULE_PREFIX = ModulePrefixes.PERMISSION
ENTITY_NAME = "Permission"
ENTITY_NAME_PLURAL = "Permissions"
JOB_NAME = Jobs.PERMISSIONS


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)





# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new permission",
    description="Creates a new permission record in the system with the provided details."
)
async def create_permission_endpoint(
    permission: PermissionsCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new permission.

    This endpoint creates a new permission record in the system. The permission name
    must contain at least one alphabetic character and the short code is required
    for quick reference.

    Request Body Parameters:
        - name (str, required): Permission name (1-120 characters, must contain at least one alphabet).
        - shortCode (str, required): Short code for the permission (1-20 characters).
        - description (str, optional): Description of the permission (max 500 characters).

    Response Structure:
        - code (int): HTTP status code (201 on success)
        - status (str): "success" or "error"
        - message (str): Success or error message
        - data (object): Created permission object containing:
            - _id (str): Unique permission identifier
            - name (str): Permission name
            - shortCode (str): Permission short code
            - description (str): Permission description
            - isActive (bool): Active status (default: true)
            - isDelete (bool): Soft delete status (default: false)
            - createdBy (str): User ID who created the record
            - createdAt (datetime): Creation timestamp
            - createdIp (str): IP address of creator

    Error Responses:
        - 400 Bad Request: Invalid input data or user ID not found
            - Validation errors (name format, missing required fields)
            - User ID not found in token
        - 403 Forbidden: User lacks CREATE permission for permissions
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs transaction on successful creation (LogCodes.PERMISSION_CREATED)
        - Logs error on failure (ErrorCodeConstants.PERMISSION_CREATE_FAILED)
        - Records client IP address from request

    Raises:
        HTTPException: On permission denial or validation errors
    """
    try:
        await (request, "CREATE", "create", current_user.id)

        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        created = await create_permission(permission, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.PERMISSION_CREATED,
            json_values={
                "permissionId": created.get("_id", ""),
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
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_CREATE_FAILED,
            parameters={"name": permission.name, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_CREATE_FAILED,
            parameters={"name": permission.name, "errorMessage": str(e)},
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
            error_code=ErrorCodeConstants.PERMISSION_CREATE_FAILED,
            parameters={"name": permission.name, "errorMessage": str(e)},
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


@router.put(
    "/update/{permission_id}",
    summary="Update an existing permission",
    description="Updates an existing permission record with the provided details."
)
async def update_permission_endpoint(
    permission_id: str,
    permission_update: PermissionsUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing permission.

    This endpoint updates an existing permission record. Only the fields provided
    in the request body will be updated. The updatedAt and updatedBy fields are
    automatically set.

    Path Parameters:
        - permission_id (str, required): The unique identifier of the permission to update.

    Request Body Parameters:
        - name (str, optional): New permission name (1-120 characters, must contain at least one alphabet).
        - shortCode (str, optional): New short code for the permission (1-20 characters).
        - description (str, optional): New description of the permission (max 500 characters).

    Response Structure:
        - code (int): HTTP status code (200 on success)
        - status (str): "success" or "error"
        - message (str): Success or error message
        - data (object): Updated permission object containing:
            - _id (str): Unique permission identifier
            - name (str): Permission name
            - shortCode (str): Permission short code
            - description (str): Permission description
            - isActive (bool): Active status
            - isDelete (bool): Soft delete status
            - createdBy (str): User ID who created the record
            - createdAt (datetime): Creation timestamp
            - createdIp (str): IP address of creator
            - updatedBy (str): User ID who last updated the record
            - updatedAt (datetime): Last update timestamp
            - updatedIp (str): IP address of updater

    Error Responses:
        - 400 Bad Request: Invalid input data or user ID not found
            - Validation errors (name format, invalid fields)
            - Permission not found
        - 403 Forbidden: User lacks UPDATE permission for permissions
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs transaction on successful update (LogCodes.PERMISSION_UPDATED)
        - Logs error on failure (ErrorCodeConstants.PERMISSION_UPDATE_FAILED)
        - Records client IP address from request
        - Automatically sets updatedAt and updatedBy fields

    Raises:
        HTTPException: On permission denial or validation errors
    """
    try:

        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await update_permission(permission_id, permission_update, current_user.id, client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.PERMISSION_UPDATED,
            json_values={
                "permissionId": permission_id,
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
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_NOT_FOUND,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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
    "/delete/{permission_id}",
    summary="Soft delete a permission",
    description="Soft deletes a permission by setting isDelete flag to true."
)
async def delete_permission_endpoint(
    permission_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a permission.

    This endpoint performs a soft delete on a permission record by setting the
    isDelete flag to true. The record is not physically removed from the database
    and can be restored later using the restore endpoint.

    Path Parameters:
        - permission_id (str, required): The unique identifier of the permission to delete.

    Response Structure:
        - code (int): HTTP status code (200 on success)
        - status (str): "success" or "error"
        - message (str): Success or error message
        - data (null): No data returned on successful deletion

    Error Responses:
        - 400 Bad Request: Invalid permission ID or user ID not found
            - Permission is currently in use and cannot be deleted
        - 403 Forbidden: User lacks DELETE permission for permissions
        - 404 Not Found: Permission not found or already deleted
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs transaction on successful deletion (LogCodes.PERMISSION_DELETED)
        - Logs error on failure (ErrorCodeConstants.PERMISSION_DELETE_FAILED)
        - Records client IP address from request
        - Sets isDelete flag to true
        - Updates deletedBy and deletedAt fields

    Raises:
        HTTPException: On permission denial or validation errors
    """
    try:

        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        success = await delete_permission(permission_id, current_user.id, client_ip)
        if success:
            # Log successful deletion
            await log_transaction(
                request=request,
                log_code=LogCodes.PERMISSION_DELETED,
                json_values={
                    "permissionId": permission_id,
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
        else:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodeConstants.PERMISSION_DELETE_NOT_FOUND,
                parameters={"permissionId": permission_id, "errorMessage": "Permission not found or already deleted"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_DELETE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_DELETE_IN_USE,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_DELETE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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
    "/restore/{permission_id}",
    summary="Restore a soft-deleted permission",
    description="Restores a previously soft-deleted permission by setting isDelete flag to false."
)
async def restore_permission_endpoint(
    permission_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted permission.

    This endpoint restores a previously soft-deleted permission record by setting
    the isDelete flag back to false. Only permissions that have been soft-deleted
    can be restored.

    Path Parameters:
        - permission_id (str, required): The unique identifier of the permission to restore.

    Response Structure:
        - code (int): HTTP status code (200 on success)
        - status (str): "success" or "error"
        - message (str): Success or error message
        - data (object): Restored permission object containing:
            - _id (str): Unique permission identifier
            - name (str): Permission name
            - shortCode (str): Permission short code
            - description (str): Permission description
            - isActive (bool): Active status
            - isDelete (bool): Soft delete status (now false)
            - createdBy (str): User ID who created the record
            - createdAt (datetime): Creation timestamp
            - createdIp (str): IP address of creator
            - updatedBy (str): User ID who restored the record
            - updatedAt (datetime): Restoration timestamp
            - updatedIp (str): IP address of restorer

    Error Responses:
        - 400 Bad Request: Invalid permission ID or user ID not found
            - Permission is not deleted and cannot be restored
        - 403 Forbidden: User lacks UPDATE permission for permissions
        - 404 Not Found: Permission not found
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs transaction on successful restoration (LogCodes.PERMISSION_RESTORED)
        - Logs error on failure (ErrorCodeConstants.PERMISSION_UPDATE_FAILED)
        - Records client IP address from request
        - Sets isDelete flag to false
        - Updates updatedBy and updatedAt fields

    Raises:
        HTTPException: On permission denial or validation errors
    """
    try:

        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        restored = await restore_permission(permission_id, current_user.id, client_ip)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.PERMISSION_RESTORED,
            json_values={
                "permissionId": permission_id,
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
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_NOT_FOUND,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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


@router.patch(
    "/active/{permission_id}",
    summary="Toggle permission active status",
    description="Toggles the isActive status of a permission between true and false."
)
async def toggle_active_permission_endpoint(
    permission_id: str,
    toggle_data: PermissionsActiveToggleSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Toggle isActive status of a permission.

    This endpoint toggles the active status of a permission. When a permission is
    deactivated (isActive=false), it may affect functionality that depends on
    this permission.

    Path Parameters:
        - permission_id (str, required): The unique identifier of the permission to toggle.

    Request Body Parameters:
        - isActive (bool, required): New active status (true for active, false for inactive).

    Response Structure:
        - code (int): HTTP status code (200 on success)
        - status (str): "success" or "error"
        - message (str): Success message indicating activation or deactivation
        - data (object): Updated permission object containing:
            - _id (str): Unique permission identifier
            - name (str): Permission name
            - shortCode (str): Permission short code
            - description (str): Permission description
            - isActive (bool): New active status
            - isDelete (bool): Soft delete status
            - createdBy (str): User ID who created the record
            - createdAt (datetime): Creation timestamp
            - createdIp (str): IP address of creator
            - updatedBy (str): User ID who toggled the status
            - updatedAt (datetime): Toggle timestamp
            - updatedIp (str): IP address of updater

    Error Responses:
        - 400 Bad Request: Invalid permission ID or user ID not found
            - Permission not found
        - 403 Forbidden: User lacks UPDATE permission for permissions
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs error on failure (ErrorCodeConstants.PERMISSION_UPDATE_FAILED)
        - Records client IP address from request
        - Updates isActive, updatedBy, updatedAt, and updatedIp fields

    Raises:
        HTTPException: On permission denial or validation errors
    """
    try:

        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await toggle_active_permission(
            permission_id,
            toggle_data.isActive,
            current_user.id,
            client_ip
        )
        message = SuccessMessages.ACTIVATED if toggle_data.isActive else SuccessMessages.DEACTIVATED
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=updated,
                message=SuccessMessages.format(message, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_NOT_FOUND,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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
        logger.exception(f"Error toggling active status for {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_UPDATE_FAILED,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.ACTIVE)
            )
        )


@router.get(
    "/get/{permission_id}",
    summary="Get a single permission by ID",
    description="Retrieves a single permission record by its unique identifier."
)
async def get_permission_endpoint(
    permission_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single permission by ID.

    This endpoint retrieves a single permission record by its unique identifier.
    By default, soft-deleted records are excluded unless explicitly requested.

    Path Parameters:
        - permission_id (str, required): The unique identifier of the permission to retrieve.

    Query Parameters:
        - include_deleted (bool, optional): If true, includes soft-deleted records in the result.
            Default: false.

    Response Structure:
        - code (int): HTTP status code (200 on success)
        - status (str): "success" or "error"
        - message (str): Success or error message
        - data (object): Permission object containing:
            - _id (str): Unique permission identifier
            - name (str): Permission name
            - shortCode (str): Permission short code
            - description (str): Permission description
            - isActive (bool): Active status
            - isDelete (bool): Soft delete status
            - createdBy (str): User ID who created the record
            - createdAt (datetime): Creation timestamp
            - createdIp (str): IP address of creator
            - updatedBy (str): User ID who last updated the record (if any)
            - updatedAt (datetime): Last update timestamp (if any)
            - updatedIp (str): IP address of last updater (if any)

    Error Responses:
        - 400 Bad Request: Invalid permission ID format
        - 403 Forbidden: User lacks READ permission for permissions
        - 404 Not Found: Permission not found (or deleted if include_deleted=false)
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs error on failure (ErrorCodeConstants.PERMISSION_GET_NOT_FOUND)

    Raises:
        HTTPException: On permission denial or validation errors
    """
    try:

        permission = await get_permission(permission_id, include_deleted)

        if not permission:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodeConstants.PERMISSION_GET_NOT_FOUND,
                parameters={"permissionId": permission_id, "errorMessage": "Permission not found"},
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
                data=permission,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_GET_NOT_FOUND,
            parameters={"permissionId": permission_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_GET_NOT_FOUND,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_GET_NOT_FOUND,
            parameters={"permissionId": permission_id, "errorMessage": str(e)},
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


@router.get(
    "/list",
    summary="List all permissions with pagination and filters",
    description="Retrieves a paginated list of permissions with optional search and filtering."
)
async def list_permissions_endpoint(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    search: Optional[str] = Query(None, description="Search by name, shortCode, or description"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all permissions with optional pagination and filters.

    This endpoint retrieves a list of permissions with support for pagination,
    search, and filtering. When pagination parameters are not provided, all
    matching records are returned.

    Query Parameters:
        - page (int, optional): Page number starting from 1. If not provided, returns all records.
        - page_size (int, optional): Number of items per page (1-1000). Only used if page is provided.
        - search (str, optional): Search term to filter by name, shortCode, or description.
            Case-insensitive partial matching is performed.
        - include_deleted (bool, optional): If true, includes soft-deleted records.
            Default: false.

    Response Structure:
        - code (int): HTTP status code (200 on success)
        - status (str): "success" or "error"
        - message (str): Success or error message
        - data (array): Array of permission objects, each containing:
            - _id (str): Unique permission identifier
            - name (str): Permission name
            - shortCode (str): Permission short code
            - description (str): Permission description
            - isActive (bool): Active status
            - isDelete (bool): Soft delete status
            - createdBy (str): User ID who created the record
            - createdAt (datetime): Creation timestamp
            - createdIp (str): IP address of creator
            - updatedBy (str): User ID who last updated the record (if any)
            - updatedAt (datetime): Last update timestamp (if any)
            - updatedIp (str): IP address of last updater (if any)
        - meta (object): Pagination metadata containing:
            - total (int): Total number of matching records
            - page (int): Current page number (null if not paginated)
            - pageSize (int): Items per page (null if not paginated)
            - totalPages (int): Total number of pages (null if not paginated)

    Error Responses:
        - 403 Forbidden: User lacks READ permission for permissions
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs error on failure (ErrorCodeConstants.PERMISSION_LIST_FAILED)

    Raises:
        HTTPException: On permission denial
    """
    try:

        result = await list_permissions(
            search=search,
            include_deleted=include_deleted,
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
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_LIST_FAILED,
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
            error_code=ErrorCodeConstants.PERMISSION_LIST_FAILED,
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
    "/bulk-create",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create multiple permissions",
    description="Creates multiple permission records in a single request with detailed success/failure reporting."
)
async def bulk_create_permissions_endpoint(
    permissions_data: List[PermissionsCreateSchema],
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create multiple permissions at once.

    This endpoint creates multiple permission records in a single request.
    Each permission is processed individually, allowing partial success
    where some records may succeed while others fail.

    Request Body Parameters:
        Array of permission objects, each containing:
        - name (str, required): Permission name (1-120 characters, must contain at least one alphabet).
        - shortCode (str, required): Short code for the permission (1-20 characters).
        - description (str, optional): Description of the permission (max 500 characters).

    Response Structure:
        - code (int): HTTP status code
            - 201: All records created successfully
            - 207: Partial success (some records failed)
            - 400: All records failed
        - status (str): "success", "partial", or "error"
        - message (str): Summary message
        - data (object): Bulk operation result containing:
            - totalProcessed (int): Total number of records processed
            - successCount (int): Number of successfully created records
            - failedCount (int): Number of failed records
            - successful (array): Array of successfully created permission objects
            - failed (array): Array of failed records with error details, each containing:
                - index (int): Position in the input array
                - data (object): The input data that failed
                - error (str): Error message explaining the failure

    Error Responses:
        - 400 Bad Request: All records failed validation or user ID not found
        - 403 Forbidden: User lacks CREATE permission for permissions
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs error on failure (ErrorCodeConstants.PERMISSION_CREATE_FAILED)
        - Records client IP address from request for each created record
        - Each successful record triggers individual creation logging

    Raises:
        HTTPException: On permission denial

    Example Request Body:
        [
            {"name": "View Users", "shortCode": "VIEW_USERS", "description": "View user list"},
            {"name": "Edit Users", "shortCode": "EDIT_USERS", "description": "Edit user details"}
        ]
    """
    try:

        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        result = await bulk_create_permissions(
            data_list=permissions_data,
            created_by=current_user.id,
            created_ip=client_ip
        )

        response = api_bulk(
            total=result["totalProcessed"],
            success_count=result["successCount"],
            failed_count=result["failedCount"],
            successful=result["successful"],
            failed=result["failed"]
        )

        return JSONResponse(
            status_code=response["code"],
            content=response
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        raise HTTPException(
            status_code=e.status_code,
            detail=error_message
        )
    except Exception as e:
        logger.exception(f"Error in bulk create {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.PERMISSION_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.BULK_CREATE)
            )
        )
