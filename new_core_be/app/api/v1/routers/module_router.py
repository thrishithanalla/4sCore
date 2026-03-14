"""
Module Router
Provides API endpoints for Module management
Routes: /api/v1/modules
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.module_schema import (
    ModuleCreateSchema,
    ModuleResponseSchema,
    ModuleUpdateSchema,
    ModuleActiveToggleSchema
)
from app.api.v1.services.module_service import (
    create_module,
    update_module,
    delete_module,
    restore_module,
    toggle_active_module,
    get_module,
    list_modules,
    bulk_create_modules
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
    SuccessMessages,
    ErrorMessages,
    PermissionMessages,
    ModulePrefixes
)
from app.constants.error_codes import ErrorCodes
from app.constants.jobs import Jobs
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/modules",
    tags=["modules"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication token"},
        403: {"description": "Forbidden - Insufficient permissions"},
        500: {"description": "Internal Server Error"}
    }
)

# Module configuration
MODULE_PREFIX = ModulePrefixes.MODULE
ENTITY_NAME = "Module"
ENTITY_NAME_PLURAL = "Modules"
JOB_NAME = Jobs.MODULES





# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new module",
    description="Creates a new module in the system with the provided details. Requires CREATE permission on MODULES job."
)
async def create_module_endpoint(
    module: ModuleCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new module in the system.

    This endpoint creates a new module record with the provided information.
    The module will be active by default and not marked as deleted.

    **Request Body Parameters:**
    - **name** (str, required): Module name (1-120 characters, must contain at least one alphabet character)
    - **shortCode** (str, required): Short code identifier for the module (1-20 characters)
    - **description** (str, optional): Detailed description of the module (max 500 characters)

    **Response Structure:**
    ```json
    {
        "success": true,
        "code": 201,
        "message": "Module created successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "shortCode": "string",
            "description": "string",
            "isActive": true,
            "isDelete": false,
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string"
        }
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid input data, validation errors, or user ID not found
    - **403 Forbidden**: User lacks CREATE permission on MODULES job
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address from request headers (X-Forwarded-For or X-Real-IP)
    - Logs transaction on successful creation (LOG_CODE: MODULE_CREATED)
    - Logs error on failure with error code MODULE_CREATE_FAILED
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_CREATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_CREATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        created = await create_module(module, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.MODULE_CREATED,
            json_values={
                "moduleId": created.get("_id", ""),
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
            error_code=ErrorCodes.MODULE_CREATE_FAILED,
            parameters={"name": module.name, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_CREATE_FAILED,
            parameters={"name": module.name, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_CREATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_CREATE_FAILED,
            parameters={"name": module.name, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_CREATE_FAILED
            )
        )


@router.put(
    "/update/{module_id}",
    summary="Update an existing module",
    description="Updates an existing module with the provided details. Requires UPDATE permission on MODULES job."
)
async def update_module_endpoint(
    module_id: str,
    module_update: ModuleUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing module by ID.

    This endpoint updates the specified module with new values. Only provided fields
    will be updated; omitted fields remain unchanged. The updatedAt and updatedBy
    fields are automatically set.

    **Path Parameters:**
    - **module_id** (str, required): The unique identifier of the module to update

    **Request Body Parameters:**
    - **name** (str, optional): Updated module name (1-120 characters, must contain at least one alphabet character)
    - **shortCode** (str, optional): Updated short code (1-20 characters)
    - **description** (str, optional): Updated description (max 500 characters)

    **Response Structure:**
    ```json
    {
        "success": true,
        "code": 200,
        "message": "Module updated successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "shortCode": "string",
            "description": "string",
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

    **Error Responses:**
    - **400 Bad Request**: Invalid input data, validation errors, or user ID not found
    - **403 Forbidden**: User lacks UPDATE permission on MODULES job
    - **404 Not Found**: Module with the specified ID does not exist
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address from request headers (X-Forwarded-For or X-Real-IP)
    - Automatically sets updatedAt timestamp and updatedBy user ID
    - Logs transaction on successful update (LOG_CODE: MODULE_UPDATED)
    - Logs error on failure with error code MODULE_UPDATE_FAILED
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_UPDATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await update_module(module_id, module_update, current_user.id, client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.MODULE_UPDATED,
            json_values={
                "moduleId": module_id,
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
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{module_id}",
    summary="Soft delete a module",
    description="Performs a soft delete on a module by setting isDelete=true. Requires DELETE permission on MODULES job."
)
async def delete_module_endpoint(
    module_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a module by ID.

    This endpoint performs a soft delete on the specified module by setting
    the isDelete flag to true. The record is not physically removed from the
    database and can be restored later using the restore endpoint.

    **Path Parameters:**
    - **module_id** (str, required): The unique identifier of the module to delete

    **Response Structure:**
    ```json
    {
        "success": true,
        "code": 200,
        "message": "Module deleted successfully",
        "data": null
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: User ID not found or validation error
    - **403 Forbidden**: User lacks DELETE permission on MODULES job
    - **404 Not Found**: Module with the specified ID does not exist or is already deleted
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address from request headers (X-Forwarded-For or X-Real-IP)
    - Sets isDelete=true, updatedAt timestamp, and updatedBy user ID
    - Logs transaction on successful deletion (LOG_CODE: MODULE_DELETED)
    - Logs error on failure with error code MODULE_DELETE_FAILED or MODULE_DELETE_NOT_FOUND
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_DELETE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_DELETE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        success = await delete_module(module_id, current_user.id, client_ip)
        if success:
            # Log successful deletion
            await log_transaction(
                request=request,
                log_code=LogCodes.MODULE_DELETED,
                json_values={
                    "moduleId": module_id,
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
                error_code=ErrorCodes.MODULE_DELETE_NOT_FOUND,
                parameters={"module_id": module_id, "errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_DELETE_NOT_FOUND
                )
            )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_DELETE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_DELETE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{module_id}",
    summary="Restore a soft-deleted module",
    description="Restores a previously soft-deleted module by setting isDelete=false. Requires UPDATE permission on MODULES job."
)
async def restore_module_endpoint(
    module_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted module by ID.

    This endpoint restores a previously soft-deleted module by setting the
    isDelete flag back to false. The module will become visible in regular
    queries again.

    **Path Parameters:**
    - **module_id** (str, required): The unique identifier of the module to restore

    **Response Structure:**
    ```json
    {
        "success": true,
        "code": 200,
        "message": "Module restored successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "shortCode": "string",
            "description": "string",
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

    **Error Responses:**
    - **400 Bad Request**: User ID not found, module not in deleted state, or validation error
    - **403 Forbidden**: User lacks UPDATE permission on MODULES job
    - **404 Not Found**: Module with the specified ID does not exist
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address from request headers (X-Forwarded-For or X-Real-IP)
    - Sets isDelete=false, updatedAt timestamp, and updatedBy user ID
    - Logs transaction on successful restore (LOG_CODE: MODULE_RESTORED)
    - Logs error on failure with error code MODULE_UPDATE_FAILED
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_UPDATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        restored = await restore_module(module_id, current_user.id, client_ip)

        # Log successful restore
        await log_transaction(
            request=request,
            log_code=LogCodes.MODULE_RESTORED,
            json_values={
                "moduleId": module_id,
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
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
            )
        )


@router.patch(
    "/active/{module_id}",
    summary="Toggle module active status",
    description="Activates or deactivates a module by toggling its isActive flag. Requires UPDATE permission on MODULES job."
)
async def toggle_active_module_endpoint(
    module_id: str,
    toggle_data: ModuleActiveToggleSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Toggle the active status of a module.

    This endpoint allows activating or deactivating a module by changing its
    isActive flag. Deactivated modules may be excluded from certain operations
    depending on application logic.

    **Path Parameters:**
    - **module_id** (str, required): The unique identifier of the module to toggle

    **Request Body Parameters:**
    - **isActive** (bool, required): The new active status (true=active, false=inactive)

    **Response Structure:**
    ```json
    {
        "success": true,
        "code": 200,
        "message": "Module activated successfully" | "Module deactivated successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "shortCode": "string",
            "description": "string",
            "isActive": true | false,
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

    **Error Responses:**
    - **400 Bad Request**: User ID not found or validation error
    - **403 Forbidden**: User lacks UPDATE permission on MODULES job
    - **404 Not Found**: Module with the specified ID does not exist or is deleted
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address from request headers (X-Forwarded-For or X-Real-IP)
    - Updates isActive flag, updatedAt timestamp, and updatedBy user ID
    - Logs error on failure with error code MODULE_UPDATE_FAILED
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_UPDATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await toggle_active_module(
            module_id,
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
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_UPDATE_FAILED,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_UPDATE_FAILED
            )
        )


@router.get(
    "/get/{module_id}",
    summary="Get a module by ID",
    description="Retrieves a single module by its unique identifier. Requires READ permission on MODULES job."
)
async def get_module_endpoint(
    module_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Retrieve a single module by its ID.

    This endpoint fetches detailed information about a specific module.
    By default, soft-deleted modules are excluded unless explicitly requested.

    **Path Parameters:**
    - **module_id** (str, required): The unique identifier of the module to retrieve

    **Query Parameters:**
    - **include_deleted** (bool, optional, default=False): When true, includes soft-deleted modules in the search

    **Response Structure:**
    ```json
    {
        "success": true,
        "code": 200,
        "message": "Module fetched successfully",
        "data": {
            "_id": "string",
            "name": "string",
            "shortCode": "string",
            "description": "string",
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

    **Error Responses:**
    - **400 Bad Request**: Invalid module ID format or validation error
    - **403 Forbidden**: User lacks READ permission on MODULES job
    - **404 Not Found**: Module with the specified ID does not exist (or is deleted and include_deleted=false)
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Logs error on failure with error code MODULE_GET_NOT_FOUND
    """
    try:


        module = await get_module(module_id, include_deleted)

        if not module:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_GET_NOT_FOUND,
                parameters={"module_id": module_id, "errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=module,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_GET_NOT_FOUND,
            parameters={"module_id": module_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MODULE_GET_NOT_FOUND,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_GET_NOT_FOUND
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_GET_NOT_FOUND,
            parameters={"module_id": module_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    summary="List all modules",
    description="Retrieves a paginated list of modules with optional search and filtering. Requires READ permission on MODULES job."
)
async def list_modules_endpoint(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    search: Optional[str] = Query(None, description="Search by name, shortCode, or description"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Retrieve a list of all modules with optional pagination and filtering.

    This endpoint returns a list of modules, optionally paginated and filtered.
    When pagination parameters are not provided, all matching records are returned.

    **Query Parameters:**
    - **page** (int, optional, min=1): Page number for pagination. If not provided, returns all records
    - **page_size** (int, optional, min=1, max=1000): Number of items per page. Only used when page is provided
    - **search** (str, optional): Search term to filter modules by name, shortCode, or description (case-insensitive)
    - **include_deleted** (bool, optional, default=False): When true, includes soft-deleted modules in results

    **Response Structure (Paginated):**
    ```json
    {
        "success": true,
        "code": 200,
        "message": "Modules list fetched successfully",
        "data": [
            {
                "_id": "string",
                "name": "string",
                "shortCode": "string",
                "description": "string",
                "isActive": true,
                "isDelete": false,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string"
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

    **Response Structure (Non-Paginated):**
    ```json
    {
        "success": true,
        "code": 200,
        "message": "Modules list fetched successfully",
        "data": [...],
        "pagination": {
            "total": 100,
            "page": null,
            "pageSize": null,
            "totalPages": null
        }
    }
    ```

    **Error Responses:**
    - **403 Forbidden**: User lacks READ permission on MODULES job
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Logs error on failure with error code MODULE_LIST_FAILED
    """
    try:


        result = await list_modules(
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
            error_code=ErrorCodes.MODULE_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_LIST_FAILED
            )
        )


@router.post(
    "/bulk-create",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create modules",
    description="Creates multiple modules in a single request. Requires CREATE permission on MODULES job."
)
async def bulk_create_modules_endpoint(
    modules_data: List[ModuleCreateSchema],
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create multiple modules in a single bulk operation.

    This endpoint allows creating multiple modules at once. Each module in the
    list is processed individually, allowing partial success where some modules
    may be created successfully while others fail validation.

    **Request Body Parameters:**
    - **modules_data** (List[ModuleCreateSchema], required): Array of module objects to create
      - Each object contains:
        - **name** (str, required): Module name (1-120 characters, must contain at least one alphabet character)
        - **shortCode** (str, required): Short code identifier (1-20 characters)
        - **description** (str, optional): Module description (max 500 characters)

    **Response Structure:**
    ```json
    {
        "success": true,
        "code": 201 | 207,
        "message": "Bulk operation completed",
        "data": {
            "totalProcessed": 5,
            "successCount": 4,
            "failedCount": 1,
            "successful": [
                {
                    "_id": "string",
                    "name": "string",
                    "shortCode": "string",
                    ...
                }
            ],
            "failed": [
                {
                    "index": 2,
                    "data": {...},
                    "error": "Validation error message"
                }
            ]
        }
    }
    ```

    **Response Codes:**
    - **201 Created**: All modules created successfully
    - **207 Multi-Status**: Partial success (some modules created, some failed)

    **Error Responses:**
    - **400 Bad Request**: User ID not found or empty request body
    - **403 Forbidden**: User lacks CREATE permission on MODULES job
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address from request headers (X-Forwarded-For or X-Real-IP)
    - Each successfully created module triggers individual logging
    - Logs error on failure with error code MODULE_CREATE_FAILED
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MODULE_CREATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_CREATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        result = await bulk_create_modules(
            data_list=modules_data,
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
            error_code=ErrorCodes.MODULE_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MODULE_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.MODULE_CREATE_FAILED
            )
        )
