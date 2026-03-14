"""
Module Job Mapping Router
Provides API endpoints for module job mapping management
Routes: /api/v1/module-job-mapping
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.module_job_mapping_schema import (
    ModuleJobMappingCreateSchema,
    ModuleJobMappingUpdateSchema,
    ModuleJobMappingResponseSchema
)
from app.api.v1.services.module_job_mapping_service import (
    create_module_job_mapping,
    bulk_create_module_job_mappings,
    update_module_job_mapping,
    delete_module_job_mapping,
    restore_module_job_mapping,
    get_module_job_mapping,
    list_module_job_mappings,
    list_jobs_by_module,
    list_modules_by_job,
    count_module_job_mappings
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

router = APIRouter(prefix="/api/v1/module-job-mapping", tags=["module-job-mapping"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.MODULE_JOB_MAPPINGS

# Entity name for messages
ENTITY_NAME = "Module Job Mapping"
ENTITY_NAME_PLURAL = "Module Job Mappings"


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new module job mapping",
    description="Creates a new module job mapping linking a module and job."
)
async def create_module_job_mapping_endpoint(
    mapping_data: ModuleJobMappingCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new module job mapping to link module and job.

    This endpoint creates a new configuration entry that defines
    which jobs are available within a module.

    **Request Body (ModuleJobMappingCreateSchema):**
    - `moduleId` (required): FK to modules collection
    - `jobId` (required): FK to jobs collection

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Module Job Mapping created successfully"
    - `data`: Created module job mapping object

    **Error Responses:**
    - 400: Validation error (invalid IDs)
    - 403: Permission denied (CREATE permission required)
    - 409: Duplicate mapping already exists
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with MODULE_JOB_MAPPING_CREATED code
    - Records createdIp from request
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        created = await create_module_job_mapping(mapping_data, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.MODULE_JOB_MAPPING_CREATED,
            json_values={
                "moduleJobMappingId": created.get("_id", ""),
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
                error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_DUPLICATE,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_DUPLICATE
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_FAILED
            )
        )


@router.post(
    "/bulk-create",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create module job mappings",
    description="Creates multiple module job mappings in a single operation."
)
async def bulk_create_module_job_mappings_endpoint(
    mappings_data: List[ModuleJobMappingCreateSchema],
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create multiple module job mappings in a single operation.

    This endpoint allows batch creation of configuration entries,
    useful when setting up jobs for a new module.

    **Request Body:**
    - Array of ModuleJobMappingCreateSchema objects, each containing:
      - `moduleId` (required): FK to modules collection
      - `jobId` (required): FK to jobs collection

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

        result = await bulk_create_module_job_mappings(mappings_data, current_user.id, client_ip)
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
            error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_CREATE_FAILED
            )
        )


@router.put(
    "/update/{mapping_id}",
    summary="Update a module job mapping",
    description="Updates an existing module job mapping with new module or job associations."
)
async def update_module_job_mapping_endpoint(
    mapping_id: str,
    mapping_data: ModuleJobMappingUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing module job mapping.

    This endpoint updates a configuration entry, allowing changes
    to the module or job associations.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the module job mapping

    **Request Body (ModuleJobMappingUpdateSchema):**
    All fields are optional:
    - `moduleId`: New FK to modules collection
    - `jobId`: New FK to jobs collection
    - `isActive`: Active status flag

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Module Job Mapping updated successfully"
    - `data`: Updated module job mapping object

    **Error Responses:**
    - 400: Validation error or no fields to update
    - 403: Permission denied (UPDATE permission required)
    - 404: Module job mapping not found
    - 409: Update would create duplicate mapping
    - 500: Internal server error

    **Side Effects:**
    - Updates updatedAt, updatedBy, and updatedIp automatically
    - Logs transaction with MODULE_JOB_MAPPING_UPDATED code
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        updated = await update_module_job_mapping(
            mapping_id,
            mapping_data.model_dump(exclude_unset=True),
            current_user.id,
            client_ip
        )

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.MODULE_JOB_MAPPING_UPDATED,
            json_values={
                "moduleJobMappingId": mapping_id,
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
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_409_CONFLICT:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{mapping_id}",
    summary="Soft delete a module job mapping",
    description="Performs a soft delete on a module job mapping by setting isDelete=True."
)
async def delete_module_job_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a module job mapping.

    This endpoint performs a soft delete on a configuration entry.
    The record remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the module job mapping

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Module Job Mapping deleted successfully"

    **Error Responses:**
    - 400: Invalid mapping ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Module job mapping not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=True
    - Logs transaction with MODULE_JOB_MAPPING_DELETED code
    - Records updatedIp from request
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        await delete_module_job_mapping(mapping_id, current_user.id, client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.MODULE_JOB_MAPPING_DELETED,
            json_values={
                "moduleJobMappingId": mapping_id,
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
                error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{mapping_id}",
    summary="Restore a soft-deleted module job mapping",
    description="Restores a soft-deleted module job mapping by setting isDelete=False."
)
async def restore_module_job_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted module job mapping.

    This endpoint restores a previously soft-deleted configuration entry,
    making it active and visible in normal queries again.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the module job mapping

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Module Job Mapping restored successfully"

    **Error Responses:**
    - 400: Invalid mapping ID format or mapping not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Module job mapping not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=False
    - Logs transaction with MODULE_JOB_MAPPING_RESTORED code
    - Records updatedIp from request
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        await restore_module_job_mapping(mapping_id, current_user.id, client_ip)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.MODULE_JOB_MAPPING_RESTORED,
            json_values={
                "moduleJobMappingId": mapping_id,
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
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_UPDATE_FAILED
            )
        )


@router.get(
    "/get/{mapping_id}",
    summary="Get module job mapping by ID",
    description="Retrieves a single module job mapping by its MongoDB ObjectId."
)
async def get_module_job_mapping_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single module job mapping by ID.

    This endpoint retrieves a specific configuration entry
    with its associated module and job information.

    **Path Parameters:**
    - `mapping_id` (required): MongoDB ObjectId of the module job mapping

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Module Job Mapping fetched successfully"
    - `data`: Module job mapping object with populated fields

    **Error Responses:**
    - 400: Invalid mapping ID format
    - 403: Permission denied (READ permission required)
    - 404: Module job mapping not found
    - 500: Internal server error
    """
    try:
        

        mapping = await get_module_job_mapping(mapping_id)

        if not mapping:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MOD_JOB_MAPPING_GET_NOT_FOUND,
                parameters={"errorMessage": "Module job mapping not found", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"{ENTITY_NAME} not found"

            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_GET_NOT_FOUND
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
                error_code=ErrorCodes.MOD_JOB_MAPPING_GET_NOT_FOUND,
                parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)

            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.MOD_JOB_MAPPING_GET_NOT_FOUND
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_GET_NOT_FOUND,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    summary="List all module job mappings",
    description="Retrieves all module job mappings with optional pagination and filters."
)
async def list_module_job_mappings_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    moduleId: Optional[str] = Query(None, description="Filter by module ID"),
    jobId: Optional[str] = Query(None, description="Filter by job ID"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Number of records per page. Required when page is provided."),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all module job mappings with optional pagination and filters.

    This endpoint retrieves configuration entries with support for
    filtering by module or job.

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `moduleId` (optional): Filter by module ID
    - `jobId` (optional): Filter by job ID
    - `page` (optional): Page number starting from 1
    - `page_size` (optional): Items per page (1-100, default: 10)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Module Job Mapping list fetched successfully"
    - `data`: Array of module job mapping objects
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        

        # Default page_size to 10 when pagination is requested
        effective_page_size = page_size if page_size is not None else 10

        mappings_list, total = await list_module_job_mappings(
            include_deleted=include_deleted,
            moduleId=moduleId,
            jobId=jobId,
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
            error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED
            )
        )


@router.get(
    "/jobs-by-module/{module_id}",
    summary="Get all jobs mapped to a module",
    description="Retrieves all jobs that are mapped to a specific module."
)
async def list_jobs_by_module_endpoint(
    module_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Number of records per page."),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all jobs mapped to a specific module.

    This endpoint retrieves all job mappings for a given module,
    useful for displaying available jobs within a module context.

    **Path Parameters:**
    - `module_id` (required): MongoDB ObjectId of the module

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `page` (optional): Page number starting from 1
    - `page_size` (optional): Items per page (1-100, default: 10)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Jobs by module fetched successfully"
    - `data`: Array of module job mapping objects with job details

    **Error Responses:**
    - 400: Invalid module ID format
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        

        # Default page_size to 10 when pagination is requested
        effective_page_size = page_size if page_size is not None else 10

        mappings_list, total = await list_jobs_by_module(
            module_id=module_id,
            include_deleted=include_deleted,
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
                    message="Jobs by module fetched successfully"
                )
            )

        # Return simple list response without pagination
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=mappings_list,
                message="Jobs by module fetched successfully"
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED,
            parameters={"errorMessage": str(e), "moduleId": module_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error listing jobs by module")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED,
            parameters={"errorMessage": str(e), "moduleId": module_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED
            )
        )


@router.get(
    "/modules-by-job/{job_id}",
    summary="Get all modules mapped to a job",
    description="Retrieves all modules that are mapped to a specific job (reverse lookup)."
)
async def list_modules_by_job_endpoint(
    job_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Number of records per page."),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all modules mapped to a specific job (reverse lookup).

    This endpoint retrieves all module mappings for a given job,
    useful for understanding which modules use a particular job.

    **Path Parameters:**
    - `job_id` (required): MongoDB ObjectId of the job

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `page` (optional): Page number starting from 1
    - `page_size` (optional): Items per page (1-100, default: 10)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Modules by job fetched successfully"
    - `data`: Array of module job mapping objects with module details

    **Error Responses:**
    - 400: Invalid job ID format
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        

        # Default page_size to 10 when pagination is requested
        effective_page_size = page_size if page_size is not None else 10

        mappings_list, total = await list_modules_by_job(
            job_id=job_id,
            include_deleted=include_deleted,
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
                    message="Modules by job fetched successfully"
                )
            )

        # Return simple list response without pagination
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=mappings_list,
                message="Modules by job fetched successfully"
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED,
            parameters={"errorMessage": str(e), "jobId": job_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)

        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error listing modules by job")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED,
            parameters={"errorMessage": str(e), "jobId": job_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MOD_JOB_MAPPING_LIST_FAILED
            )
        )
