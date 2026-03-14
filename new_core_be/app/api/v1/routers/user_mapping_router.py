"""
UserMapping Router
Provides API endpoints for UserMapping management
Routes: /api/v1/user-role-permissions
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.user_mapping_schema import (
    UserMappingCreateSchema,
    UserMappingResponseSchema,
    UserMappingUpdateSchema
)
from app.api.v1.services.user_mapping_service import (
    create_user_mapping,
    update_user_mapping,
    delete_user_mapping,
    restore_user_mapping,
    get_user_mapping,
    search_user_mappings,
    count_user_mappings
)
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
    ModulePrefixes,
    JobNames
)
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/user-role-permissions",
    tags=["user-role-permissions"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication token"},
        403: {"description": "Forbidden - Insufficient permissions for this operation"},
        500: {"description": "Internal Server Error - Unexpected error occurred"}
    }
)

# Module configuration
MODULE_PREFIX = ModulePrefixes.USER_ROLE_PERMISSIONS
ENTITY_NAME = "User Role Permission"
ENTITY_NAME_PLURAL = "User Role Permissions"
JOB_NAME = JobNames.USER_ROLE_PERMISSIONS




# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user-role-permission mapping",
    description="Creates a new mapping between a user, role, and unit with optional additional/exclusion permissions."
)
async def create_user_mapping_endpoint(
    mapping: UserMappingCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new user-role-permission mapping.

    This endpoint creates a new mapping that associates a user with a role and unit,
    allowing for customized permissions through additional and exclusion permission lists.
    The effective permissions are calculated as: role.permissions + additionalPermissions - exclusionPermissions.

    Request Body Parameters:
    -------------------------
    - **roleId** (str, required): Role ID - must exist in the roles collection.
    - **userId** (str, required): User ID - must exist in the personnel collection.
    - **unitId** (str, required): Unit ID - must exist in the unit collection.
    - **additionalPermissions** (List[ModulePermissionItem], optional): Array of additional permissions
      in module hierarchy format. Each item contains:
        - moduleId (str): Module ID
        - moduleName (str): Module name for display
        - jobs (List): Array of jobs with permissions, each containing:
            - jobName (str): Job name
            - permissions (List): Array of permission names or objects with isSelf flag
    - **exclusionPermissions** (List[ModulePermissionItem], optional): Array of excluded permissions
      in the same module hierarchy format as additionalPermissions.

    Response Structure:
    -------------------
    Success (201 Created):
    ```json
    {
        "success": true,
        "message": "User Role Permission created successfully",
        "data": {
            "_id": "string",
            "roleId": "string",
            "userId": "string",
            "unitId": "string",
            "additionalPermissions": [...],
            "exclusionPermissions": [...],
            "permissions": [...],
            "isActive": true,
            "isDelete": false,
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string"
        }
    }
    ```

    Error Responses:
    ----------------
    - **400 Bad Request**: Invalid input data, empty required fields, or user ID not found in token.
        - Error Code: USER_MAPPING_CREATE_FAILED
    - **403 Forbidden**: User lacks CREATE permission for user-role-permissions.
        - Error Code: USER_MAPPING_CREATE_FAILED
    - **409 Conflict**: Duplicate mapping exists (same userId, roleId, unitId combination).
        - Error Code: USER_MAPPING_CREATE_DUPLICATE
    - **500 Internal Server Error**: Unexpected server error.
        - Error Code: USER_MAPPING_CREATE_FAILED

    Side Effects:
    -------------
    - Records client IP address in createdIp field.
    - Logs successful creation via log_transaction with LOG_CODE: USER_MAPPING_CREATED.
    - Logs errors via log_error or log_error_with_exception.

    Permissions Required:
    ---------------------
    - CREATE permission on user-role-permissions job.
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.USER_MAPPING_CREATE_FAILED,
                parameters={"errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_CREATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        created = await create_user_mapping(mapping, current_user.id, created_ip=client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.USER_MAPPING_CREATED,
            json_values={
                "userMappingId": created.get("_id", ""),
                "userId": created.get("userId", ""),
                "roleId": created.get("roleId", ""),
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
        if e.status_code == status.HTTP_409_CONFLICT:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.USER_MAPPING_CREATE_DUPLICATE,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_CREATE_DUPLICATE
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_CREATE_FAILED
            )
        )


@router.put(
    "/update/{mapping_id}",
    summary="Update an existing user-role-permission mapping",
    description="Updates an existing user-role-permission mapping by ID. Only provided fields will be updated."
)
async def update_user_mapping_endpoint(
    mapping_id: str,
    mapping_update: UserMappingUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing user-role-permission mapping.

    This endpoint allows partial updates to an existing user mapping. Only the fields
    provided in the request body will be updated; other fields remain unchanged.
    The updatedAt and updatedBy fields are automatically set.

    Path Parameters:
    ----------------
    - **mapping_id** (str, required): The unique identifier of the user mapping to update.

    Request Body Parameters:
    -------------------------
    All fields are optional - only provide fields that need to be updated:
    - **roleId** (str, optional): New Role ID - must exist in the roles collection.
    - **userId** (str, optional): New User ID - must exist in the personnel collection.
    - **unitId** (str, optional): New Unit ID - must exist in the unit collection.
    - **additionalPermissions** (List[ModulePermissionItem], optional): Updated array of additional
      permissions in module hierarchy format.
    - **exclusionPermissions** (List[ModulePermissionItem], optional): Updated array of excluded
      permissions in module hierarchy format.

    Response Structure:
    -------------------
    Success (200 OK):
    ```json
    {
        "success": true,
        "message": "User Role Permission updated successfully",
        "data": {
            "_id": "string",
            "roleId": "string",
            "userId": "string",
            "unitId": "string",
            "additionalPermissions": [...],
            "exclusionPermissions": [...],
            "permissions": [...],
            "isActive": true,
            "isDelete": false,
            "updatedBy": "string",
            "updatedAt": "datetime",
            "updatedIp": "string"
        }
    }
    ```

    Error Responses:
    ----------------
    - **400 Bad Request**: Invalid input data, empty fields, or user ID not found in token.
        - Error Code: USER_MAPPING_UPDATE_FAILED
    - **403 Forbidden**: User lacks UPDATE permission for user-role-permissions.
        - Error Code: USER_MAPPING_UPDATE_FAILED
    - **404 Not Found**: User mapping with the specified ID does not exist or is deleted.
        - Error Code: USER_MAPPING_UPDATE_NOT_FOUND
    - **500 Internal Server Error**: Unexpected server error.
        - Error Code: USER_MAPPING_UPDATE_FAILED

    Side Effects:
    -------------
    - Records client IP address in updatedIp field.
    - Automatically sets updatedAt to current timestamp.
    - Automatically sets updatedBy to current user ID.
    - Logs successful update via log_transaction with LOG_CODE: USER_MAPPING_UPDATED.
    - Logs errors via log_error or log_error_with_exception.

    Permissions Required:
    ---------------------
    - UPDATE permission on user-role-permissions job.
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await update_user_mapping(mapping_id, mapping_update, current_user.id, updated_ip=client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.USER_MAPPING_UPDATED,
            json_values={
                "userMappingId": mapping_id,
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
                error_code=ErrorCodes.USER_MAPPING_UPDATE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_UPDATE_NOT_FOUND
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{mapping_id}",
    summary="Soft delete a user-role-permission mapping",
    description="Performs a soft delete on a user-role-permission mapping by setting isDelete=true."
)
async def delete_user_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a user-role-permission mapping.

    This endpoint performs a soft delete on the specified user mapping by setting
    the isDelete flag to true. The record remains in the database but is excluded
    from normal queries. Soft-deleted records can be restored using the restore endpoint.

    Path Parameters:
    ----------------
    - **mapping_id** (str, required): The unique identifier of the user mapping to delete.

    Response Structure:
    -------------------
    Success (200 OK):
    ```json
    {
        "success": true,
        "message": "User Role Permission deleted successfully",
        "data": null
    }
    ```

    Error Responses:
    ----------------
    - **400 Bad Request**: Invalid mapping ID format or user ID not found in token.
        - Error Code: USER_MAPPING_DELETE_FAILED
    - **403 Forbidden**: User lacks DELETE permission for user-role-permissions.
        - Error Code: USER_MAPPING_DELETE_FAILED
    - **404 Not Found**: User mapping with the specified ID does not exist or is already deleted.
        - Error Code: USER_MAPPING_DELETE_NOT_FOUND
    - **500 Internal Server Error**: Unexpected server error.
        - Error Code: USER_MAPPING_DELETE_FAILED

    Side Effects:
    -------------
    - Sets isDelete=true on the record.
    - Records client IP address in deletedIp field.
    - Records deletedAt timestamp and deletedBy user ID.
    - Logs successful deletion via log_transaction with LOG_CODE: USER_MAPPING_DELETED.
    - Logs errors via log_error or log_error_with_exception.

    Permissions Required:
    ---------------------
    - DELETE permission on user-role-permissions job.

    Notes:
    ------
    - This is a soft delete operation; the record is not permanently removed.
    - Use the restore endpoint to recover soft-deleted records.
    - The user's effective permissions may be affected immediately after deletion.
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.USER_MAPPING_DELETE_FAILED,
                parameters={"errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_DELETE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        success = await delete_user_mapping(mapping_id, current_user.id, deleted_ip=client_ip)
        if success:
            # Log successful deletion
            await log_transaction(
                request=request,
                log_code=LogCodes.USER_MAPPING_DELETED,
                json_values={
                    "userMappingId": mapping_id,
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
                error_code=ErrorCodes.USER_MAPPING_DELETE_NOT_FOUND,
                parameters={"errorMessage": "User mapping not found or already deleted", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_DELETE_NOT_FOUND
                )
            )
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_DELETE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_DELETE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_DELETE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{mapping_id}",
    summary="Restore a soft-deleted user-role-permission mapping",
    description="Restores a previously soft-deleted user-role-permission mapping by setting isDelete=false and isActive=true."
)
async def restore_user_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted user-role-permission mapping.

    This endpoint restores a previously soft-deleted user mapping by setting
    isDelete=false and isActive=true. The restored record will be included
    in normal queries again and the user's permissions will be reactivated.

    Path Parameters:
    ----------------
    - **mapping_id** (str, required): The unique identifier of the user mapping to restore.

    Response Structure:
    -------------------
    Success (200 OK):
    ```json
    {
        "success": true,
        "message": "User Role Permission restored successfully",
        "data": null
    }
    ```

    Error Responses:
    ----------------
    - **400 Bad Request**: Invalid mapping ID format or user ID not found in token.
        - Error Code: USER_MAPPING_UPDATE_FAILED
    - **403 Forbidden**: User lacks UPDATE permission for user-role-permissions.
        - Error Code: USER_MAPPING_UPDATE_FAILED
    - **404 Not Found**: User mapping with the specified ID does not exist or is not deleted.
        - Error Code: USER_MAPPING_UPDATE_NOT_FOUND
    - **500 Internal Server Error**: Unexpected server error.
        - Error Code: USER_MAPPING_UPDATE_FAILED

    Side Effects:
    -------------
    - Sets isDelete=false and isActive=true on the record.
    - Records client IP address in restoredIp field.
    - Records restoredAt timestamp and restoredBy user ID.
    - Logs successful restoration via log_transaction with LOG_CODE: USER_MAPPING_RESTORED.
    - Logs errors via log_error or log_error_with_exception.

    Permissions Required:
    ---------------------
    - UPDATE permission on user-role-permissions job.

    Notes:
    ------
    - Only soft-deleted records (isDelete=true) can be restored.
    - The user's effective permissions will be reactivated upon successful restoration.
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": "User ID not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        success = await restore_user_mapping(mapping_id, current_user.id, restored_ip=client_ip)
        if success:
            # Log successful restore
            await log_transaction(
                request=request,
                log_code=LogCodes.USER_MAPPING_RESTORED,
                json_values={
                    "userMappingId": mapping_id,
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
        else:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.USER_MAPPING_UPDATE_NOT_FOUND,
                parameters={"errorMessage": "User mapping not found or not deleted", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_UPDATE_NOT_FOUND
                )
            )
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_UPDATE_FAILED
            )
        )


@router.get(
    "/get/{mapping_id}",
    summary="Get a single user-role-permission mapping by ID",
    description="Retrieves a specific user-role-permission mapping by its unique identifier."
)
async def get_user_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single user-role-permission mapping by ID.

    This endpoint retrieves the complete details of a specific user mapping,
    including the consolidated permissions (role.permissions + additionalPermissions - exclusionPermissions).

    Path Parameters:
    ----------------
    - **mapping_id** (str, required): The unique identifier of the user mapping to retrieve.

    Response Structure:
    -------------------
    Success (200 OK):
    ```json
    {
        "success": true,
        "message": "User Role Permission fetched successfully",
        "data": {
            "_id": "string",
            "roleId": "string",
            "userId": "string",
            "unitId": "string",
            "rankId": "string",
            "additionalPermissions": [...],
            "exclusionPermissions": [...],
            "permissions": [...],
            "isActive": true,
            "isDelete": false,
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string",
            "updatedBy": "string",
            "updatedAt": "datetime",
            "updatedIp": "string"
        }
    }
    ```

    Error Responses:
    ----------------
    - **400 Bad Request**: Invalid mapping ID format.
        - Error Code: USER_MAPPING_GET_NOT_FOUND
    - **403 Forbidden**: User lacks READ permission for user-role-permissions.
        - Error Code: USER_MAPPING_GET_NOT_FOUND
    - **404 Not Found**: User mapping with the specified ID does not exist or is deleted.
        - Error Code: USER_MAPPING_GET_NOT_FOUND
    - **500 Internal Server Error**: Unexpected server error.
        - Error Code: USER_MAPPING_GET_NOT_FOUND

    Side Effects:
    -------------
    - Logs errors via log_error or log_error_with_exception.

    Permissions Required:
    ---------------------
    - READ permission on user-role-permissions job.

    Notes:
    ------
    - Only non-deleted (isDelete=false) records are returned.
    - The 'permissions' field contains the consolidated effective permissions.
    """
    try:

        mapping = await get_user_mapping(mapping_id)

        if not mapping:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.USER_MAPPING_GET_NOT_FOUND,
                parameters={"errorMessage": "User mapping not found", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.USER_MAPPING_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=mapping,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_GET_NOT_FOUND,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_GET_NOT_FOUND
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_GET_NOT_FOUND,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    summary="List all user-role-permission mappings",
    description="Retrieves a paginated list of user-role-permission mappings with optional filtering by role or user."
)
async def list_user_mappings_endpoint(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    roleId: Optional[str] = Query(None, description="Filter by Role ID"),
    userId: Optional[str] = Query(None, description="Filter by User ID"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all user-role-permission mappings with optional pagination and filters.

    This endpoint retrieves a list of user mappings with support for pagination
    and filtering. If pagination parameters are not provided, all records are returned
    (up to 10,000 records).

    Query Parameters:
    -----------------
    - **page** (int, optional): Page number starting from 1. If not provided, returns all records.
        - Minimum: 1
    - **page_size** (int, optional): Number of items per page. Only used if page is provided.
        - Minimum: 1
        - Maximum: 1000
    - **roleId** (str, optional): Filter results by Role ID. Only mappings with this role are returned.
    - **userId** (str, optional): Filter results by User ID. Only mappings for this user are returned.

    Response Structure:
    -------------------
    Success (200 OK):
    ```json
    {
        "success": true,
        "message": "User Role Permission list fetched successfully",
        "data": [
            {
                "_id": "string",
                "roleId": "string",
                "userId": "string",
                "unitId": "string",
                "additionalPermissions": [...],
                "exclusionPermissions": [...],
                "permissions": [...],
                "isActive": true,
                "isDelete": false,
                "createdBy": "string",
                "createdAt": "datetime"
            }
        ],
        "pagination": {
            "total": 100,
            "page": 1,
            "pageSize": 10,
            "totalPages": 10
        }
    }
    ```

    Error Responses:
    ----------------
    - **403 Forbidden**: User lacks READ permission for user-role-permissions.
        - Error Code: USER_MAPPING_LIST_FAILED
    - **500 Internal Server Error**: Unexpected server error.
        - Error Code: USER_MAPPING_LIST_FAILED

    Side Effects:
    -------------
    - Logs errors via log_error_with_exception.

    Permissions Required:
    ---------------------
    - READ permission on user-role-permissions job.

    Notes:
    ------
    - Only non-deleted (isDelete=false) records are returned.
    - When page is not provided, up to 10,000 records are returned.
    - The pagination object is included in the response regardless of whether
      pagination parameters are provided.
    - Filters can be combined (e.g., filter by both roleId and userId).
    """
    try:

        # Calculate skip and limit based on pagination
        if page is not None and page_size is not None:
            skip = (page - 1) * page_size
            limit = page_size
        else:
            skip = 0
            limit = 10000  # Large limit to get all records

        # Get user mappings from service
        mappings = await search_user_mappings(
            roleId=roleId,
            userId=userId,
            skip=skip,
            limit=limit
        )

        # Get total count for pagination
        total = await count_user_mappings(roleId=roleId, userId=userId)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=mappings,
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
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.USER_MAPPING_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.USER_MAPPING_LIST_FAILED
            )
        )
