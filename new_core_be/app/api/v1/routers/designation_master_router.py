"""
Designation Master Router
Provides API endpoints for Designation Master management
Routes: /api/v1/designation-master
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.designation_master_schema import (
    DesignationMasterCreateSchema,
    DesignationMasterUpdateSchema,
    DesignationMasterActiveToggleSchema,
    DesignationMasterBulkCreateSchema
)
from app.api.v1.services.designation_master_service import (
    create_designation_master,
    bulk_create_designation_masters,
    update_designation_master,
    delete_designation_master,
    restore_designation_master,
    toggle_active_designation_master,
    get_designation_master,
    list_designation_masters
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
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/designation-master",
    tags=["designation-master"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication token"},
        403: {"description": "Forbidden - User lacks required permissions"},
        500: {"description": "Internal Server Error - Unexpected server error"}
    }
)

# Module configuration
MODULE_PREFIX = ModulePrefixes.DESIGNATION_MASTER
ENTITY_NAME = "Designation master"
ENTITY_NAME_PLURAL = "Designation masters"
JOB_NAME = Jobs.DESIGNATION_MASTER



@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new designation master",
    description="Creates a new designation master record in the system. Requires CREATE permission on DESIGNATION_MASTER job."
)
async def create_designation_master_endpoint(
    designation: DesignationMasterCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new designation master record.

    This endpoint creates a new designation master entry in the database with the provided
    details. The client IP address is automatically captured for audit purposes.

    Request Body Parameters:
        - name (str, required): Designation name. Must contain at least 2 alphabets.
            Allowed characters: alphabets, hyphen (-), underscore (_), parentheses (()), dot (.).
            Length: 2-200 characters.
        - designationCd (str, required): Designation code. Must be alphanumeric only.
            Length: 1-200 characters.

    Response Structure:
        Success (201 Created):
        {
            "success": true,
            "code": 201,
            "message": "Designation master created successfully",
            "data": {
                "_id": "string",
                "name": "string",
                "designationCd": "string",
                "isActive": true,
                "isDelete": false,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string"
            }
        }

    Error Responses:
        - 400 Bad Request: Validation error (invalid name/code format, duplicate entry)
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks CREATE permission on DESIGNATION_MASTER
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs successful creation via log_transaction with LogCodes.DESIGNATION_CREATED
        - Logs errors via log_error or log_error_with_exception
        - Records client IP address in createdIp field

    Raises:
        HTTPException: If permission check fails (403)
    """
    try:
        

        # Get client IP
        client_ip = get_client_ip(request)

        created = await create_designation_master(designation, current_user.id, created_ip=client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.DESIGNATION_CREATED,
            json_values={
                "designationId": created.get("_id", ""),
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
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_CREATE_FAILED
            )
        )


@router.post(
    "/bulk-create",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create designation masters",
    description="Creates multiple designation master records in a single request. Requires CREATE permission on DESIGNATION_MASTER job."
)
async def bulk_create_designation_master_endpoint(
    bulk_data: DesignationMasterBulkCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Bulk create multiple designation master records.

    This endpoint allows creating multiple designation master entries in a single API call.
    Each item is processed individually, and the response includes details about successful
    and failed creations. The client IP address is automatically applied to all items.

    Request Body Parameters:
        - items (list, required): Array of designation master objects to create.
            Minimum: 1 item required.
            Each item contains:
                - name (str, required): Designation name. Must contain at least 2 alphabets.
                    Allowed characters: alphabets, hyphen (-), underscore (_), parentheses (()), dot (.).
                    Length: 2-200 characters.
                - designationCd (str, required): Designation code. Must be alphanumeric only.
                    Length: 1-200 characters.

    Response Structure:
        Success (201 Created) or Partial Success (207 Multi-Status):
        {
            "success": true,
            "code": 201 or 207,
            "message": "Bulk operation completed",
            "data": {
                "totalProcessed": number,
                "successCount": number,
                "failedCount": number,
                "successful": [
                    {
                        "_id": "string",
                        "name": "string",
                        "designationCd": "string",
                        ...
                    }
                ],
                "failed": [
                    {
                        "item": {...},
                        "error": "string"
                    }
                ]
            }
        }

    Error Responses:
        - 400 Bad Request: User ID not found in token
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks CREATE permission on DESIGNATION_MASTER
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs errors via log_error_with_exception for failed bulk operations
        - Records client IP address in createdIp field for all items

    Raises:
        HTTPException: If permission check fails (403)
    """
    try:
        
        # Get client IP for all items
        client_ip = get_client_ip(request)

        result = await bulk_create_designation_masters(bulk_data.items, current_user.id, created_ip=client_ip)

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
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in bulk create {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_CREATE_FAILED
            )
        )


@router.patch(
    "/update/{id}",
    summary="Update an existing designation master",
    description="Updates an existing designation master record by ID. Requires UPDATE permission on DESIGNATION_MASTER job."
)
async def update_designation_master_endpoint(
    id: str,
    designation_update: DesignationMasterUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing designation master record.

    This endpoint updates an existing designation master entry with the provided fields.
    Only the fields that are provided will be updated (partial update). The client IP
    address is automatically captured for audit purposes.

    Path Parameters:
        - id (str, required): The unique identifier of the designation master to update.

    Request Body Parameters:
        - name (str, optional): New designation name. Must contain at least 2 alphabets.
            Allowed characters: alphabets, hyphen (-), underscore (_), parentheses (()), dot (.).
            Length: 2-200 characters.
        - designationCd (str, optional): New designation code. Must be alphanumeric only.
            Length: 1-200 characters.

    Response Structure:
        Success (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Designation master updated successfully",
            "data": {
                "_id": "string",
                "name": "string",
                "designationCd": "string",
                "isActive": boolean,
                "isDelete": boolean,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string"
            }
        }

    Error Responses:
        - 400 Bad Request: Validation error (invalid name/code format, user ID not found)
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks UPDATE permission on DESIGNATION_MASTER
        - 404 Not Found: Designation master with given ID not found
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs successful update via log_transaction with LogCodes.DESIGNATION_UPDATED
        - Logs errors via log_error or log_error_with_exception
        - Records client IP address in updatedIp field
        - Updates updatedBy and updatedAt fields automatically

    Raises:
        HTTPException: If permission check fails (403)
    """
    try:
        

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await update_designation_master(id, designation_update, current_user.id, updated_ip=client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.DESIGNATION_UPDATED,
            json_values={
                "designationId": id,
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
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{id}",
    summary="Soft delete a designation master",
    description="Soft deletes a designation master by setting isDelete=True. Requires DELETE permission on DESIGNATION_MASTER job."
)
async def delete_designation_master_endpoint(
    id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a designation master record.

    This endpoint performs a soft delete on a designation master by setting the isDelete
    flag to True. The record is not physically removed from the database and can be
    restored later using the restore endpoint. The client IP address is captured for audit.

    Path Parameters:
        - id (str, required): The unique identifier of the designation master to delete.

    Response Structure:
        Success (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Designation master deleted successfully",
            "data": null
        }

    Error Responses:
        - 400 Bad Request: User ID not found in token or validation error
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks DELETE permission on DESIGNATION_MASTER
        - 404 Not Found: Designation master not found or already deleted
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Sets isDelete=True on the record
        - Records deletedBy user ID and deletedIp
        - Logs successful deletion via log_transaction with LogCodes.DESIGNATION_DELETED
        - Logs errors via log_error or log_error_with_exception

    Raises:
        HTTPException: If permission check fails (403)

    Note:
        This is a soft delete operation. The record can be restored using the
        PATCH /restore/{id} endpoint.
    """
    try:
        

        # Get client IP
        client_ip = get_client_ip(request)

        success = await delete_designation_master(id, current_user.id, deleted_ip=client_ip)

        if success:
            # Log successful deletion
            await log_transaction(
                request=request,
                log_code=LogCodes.DESIGNATION_DELETED,
                json_values={
                    "designationId": id,
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
                error_code=CentralizedErrorCodes.DESIGNATION_DELETE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME), "designationId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.DESIGNATION_DELETE_NOT_FOUND
                )
            )
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_DELETE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_DELETE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_DELETE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{id}",
    summary="Restore a soft-deleted designation master",
    description="Restores a previously soft-deleted designation master by setting isDelete=False. Requires UPDATE permission on DESIGNATION_MASTER job."
)
async def restore_designation_master_endpoint(
    id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted designation master record.

    This endpoint restores a previously soft-deleted designation master by setting
    the isDelete flag back to False. The client IP address is captured for audit purposes.

    Path Parameters:
        - id (str, required): The unique identifier of the designation master to restore.

    Response Structure:
        Success (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Designation master restored successfully",
            "data": {
                "_id": "string",
                "name": "string",
                "designationCd": "string",
                "isActive": boolean,
                "isDelete": false,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string"
            }
        }

    Error Responses:
        - 400 Bad Request: User ID not found in token or validation error
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks UPDATE permission on DESIGNATION_MASTER
        - 404 Not Found: Designation master not found or not in deleted state
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Sets isDelete=False on the record
        - Records restoredBy user ID and restoredIp (via updatedBy/updatedIp)
        - Logs successful restoration via log_transaction with LogCodes.DESIGNATION_RESTORED
        - Logs errors via log_error or log_error_with_exception

    Raises:
        HTTPException: If permission check fails (403)

    Note:
        This endpoint reverses a soft delete operation performed via DELETE /delete/{id}.
    """
    try:
        

        # Get client IP
        client_ip = get_client_ip(request)

        restored = await restore_designation_master(id, current_user.id, restored_ip=client_ip)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.DESIGNATION_RESTORED,
            json_values={
                "designationId": id,
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
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED
            )
        )


@router.patch(
    "/active/{id}",
    summary="Toggle active status of a designation master",
    description="Toggles the isActive status of a designation master. Requires UPDATE permission on DESIGNATION_MASTER job."
)
async def toggle_active_designation_master_endpoint(
    id: str,
    toggle_data: DesignationMasterActiveToggleSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Toggle the active status of a designation master record.

    This endpoint allows activating or deactivating a designation master by setting
    the isActive flag. Deactivated designation masters may be excluded from certain
    operations while still being retained in the system. The client IP is captured for audit.

    Path Parameters:
        - id (str, required): The unique identifier of the designation master to update.

    Request Body Parameters:
        - isActive (bool, required): The new active status.
            True = active, False = inactive.

    Response Structure:
        Success (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Designation master activated/deactivated successfully",
            "data": {
                "_id": "string",
                "name": "string",
                "designationCd": "string",
                "isActive": boolean,
                "isDelete": boolean,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string"
            }
        }

    Error Responses:
        - 400 Bad Request: User ID not found in token or validation error
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks UPDATE permission on DESIGNATION_MASTER
        - 404 Not Found: Designation master not found
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Updates isActive field to the specified value
        - Records updatedBy user ID and updatedIp
        - Updates updatedAt timestamp
        - Logs errors via log_error or log_error_with_exception

    Raises:
        HTTPException: If permission check fails (403)

    Note:
        The success message dynamically changes based on the action:
        - "activated successfully" when isActive=True
        - "deactivated successfully" when isActive=False
    """
    try:
        

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await toggle_active_designation_master(id, toggle_data, current_user.id, updated_ip=client_ip)
        message = SuccessMessages.ACTIVATED if toggle_data.isActive else SuccessMessages.DEACTIVATED
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=updated,
                message=SuccessMessages.format(message, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error toggling active status for {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "designationId": id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_UPDATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List designation masters with pagination",
    description="Retrieves a paginated list of designation masters with optional filtering. Requires READ permission on DESIGNATION_MASTER job."
)
async def list_designation_masters_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    search: Optional[str] = Query(None, description="Search by name or designationCd"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List designation masters with optional pagination and filtering.

    This endpoint retrieves a list of designation master records with support for
    pagination, search, and filtering. By default, only non-deleted records are returned.

    Query Parameters:
        - include_deleted (bool, optional): Whether to include soft-deleted records.
            Default: False. When True, returns records regardless of isDelete status.
        - search (str, optional): Search term to filter by name or designationCd.
            Performs case-insensitive partial matching.
        - page (int, optional): Page number for pagination. Minimum: 1.
            If not provided, all records are returned.
        - limit (int, optional): Number of records per page. Range: 1-1000.
            If not provided, all records are returned.

    Response Structure:
        Success (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Designation master list fetched successfully",
            "data": [
                {
                    "_id": "string",
                    "name": "string",
                    "designationCd": "string",
                    "isActive": boolean,
                    "isDelete": boolean,
                    "createdBy": "string",
                    "createdAt": "datetime",
                    "createdIp": "string",
                    "updatedBy": "string",
                    "updatedAt": "datetime",
                    "updatedIp": "string"
                }
            ],
            "pagination": {
                "total": number,
                "page": number,
                "pageSize": number,
                "totalPages": number
            }
        }

    Error Responses:
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks READ permission on DESIGNATION_MASTER
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs errors via log_error_with_exception

    Raises:
        HTTPException: If permission check fails (403)

    Note:
        - When page and limit are both omitted, all matching records are returned
        - The default filter excludes deleted records (isDelete=False)
        - Records are typically returned with isActive=True unless include_deleted=True
    """
    try:
        

        designations, total = await list_designation_masters(
            include_deleted=include_deleted,
            search=search,
            page=page,
            limit=limit
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=designations,
                total=total,
                page=page,
                page_size=limit,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_LIST_FAILED
            )
        )


@router.get(
    "/{id}",
    summary="Get a single designation master by ID",
    description="Retrieves a single designation master record by its unique identifier. Requires READ permission on DESIGNATION_MASTER job."
)
async def get_designation_master_endpoint(
    id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single designation master by ID.

    This endpoint retrieves a single designation master record using its unique identifier.
    Returns the complete record including all metadata fields.

    Path Parameters:
        - id (str, required): The unique identifier (MongoDB ObjectId) of the designation master.

    Response Structure:
        Success (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Designation master fetched successfully",
            "data": {
                "_id": "string",
                "name": "string",
                "designationCd": "string",
                "isActive": boolean,
                "isDelete": boolean,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string"
            }
        }

    Error Responses:
        - 401 Unauthorized: Invalid or missing authentication token
        - 403 Forbidden: User lacks READ permission on DESIGNATION_MASTER
        - 404 Not Found: Designation master with given ID not found
        - 500 Internal Server Error: Unexpected server error

    Side Effects:
        - Logs 404 errors via log_error
        - Logs unexpected errors via log_error_with_exception

    Raises:
        HTTPException: If permission check fails (403)

    Note:
        This endpoint returns the record regardless of its isActive or isDelete status.
        The caller should check these flags if they need to enforce soft-delete or
        active/inactive filtering.
    """
    try:
        
        designation = await get_designation_master(id)

        if not designation:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.DESIGNATION_GET_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME), "designationId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.DESIGNATION_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=designation,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.DESIGNATION_GET_NOT_FOUND,
            parameters={"errorMessage": str(e), "designationId": id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.DESIGNATION_GET_NOT_FOUND
            )
        )
