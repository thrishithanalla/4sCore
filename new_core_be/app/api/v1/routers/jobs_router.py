"""
Jobs Router
Provides API endpoints for Jobs management
Routes: /api/v1/jobs
"""
import re
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.jobs_schema import (
    JobsCreateSchema,
    JobsResponseSchema,
    JobsUpdateSchema,
    JobsActiveToggleSchema
)
from app.api.v1.services.jobs_service import (
    create_job,
    update_job,
    delete_job,
    restore_job,
    toggle_active_job,
    get_job,
    list_jobs,
    bulk_create_jobs
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

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

# Module configuration
MODULE_PREFIX = ModulePrefixes.JOB
ENTITY_NAME = "Job"
ENTITY_NAME_PLURAL = "Jobs"
JOB_NAME = Jobs.JOBS





def _validate_job_name(name: str):
    """Validate job name format - ALL UPPERCASE with underscores allowed, only one space between words"""
    pattern = r"^[A-Z_]+( [A-Z_]+)*$"
    if not re.fullmatch(pattern, name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ResponseBuilder.bad_request(
                message="Job name must be ALL UPPERCASE (underscores allowed) with only one space between words.",
                error_code=ErrorCodes.JOB_UPDATE_FAILED
            )
        )


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new job",
    description="Creates a new job definition for RBAC permission management."
)
async def create_job_endpoint(
    job: JobsCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new job.

    This endpoint creates a new job definition that can be assigned permissions
    (CREATE, READ, UPDATE, DELETE) within the RBAC system.

    **Request Body (JobsCreateSchema):**
    - `name` (required): Job name (must be ALL UPPERCASE with only one space between words)
    - `shortCode` (required): Unique short code for the job
    - `description` (optional): Job description

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Job created successfully"
    - `data`: Created job object with all fields

    **Error Responses:**
    - 400: Validation error (invalid name format - must be ALL UPPERCASE)
    - 403: Permission denied (CREATE permission required)
    - 409: Conflict (duplicate name or shortCode)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with JOB_CREATED code
    """
    try:
        # Validate job name format
        _validate_job_name(job.name)


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.JOB_CREATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_CREATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        created = await create_job(job, current_user.id, client_ip)

        # Log successful created
        await log_transaction(
            request=request,
            log_code=LogCodes.JOB_CREATED,
            json_values={
                "jobId": created.get("_id", ""),
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
            error_code=ErrorCodes.JOB_CREATE_FAILED,
            parameters={"name": job.name, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_CREATE_FAILED,
            parameters={"name": job.name, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_CREATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_CREATE_FAILED,
            parameters={"name": job.name, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_CREATE_FAILED
            )
        )


@router.patch(
    "/update/{job_id}",
    status_code=status.HTTP_200_OK,
    summary="Update a job",
    description="Partially updates an existing job record with the provided fields."
)
async def update_job_endpoint(
    job_id: str,
    job_update: JobsUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Partially update an existing job.

    This endpoint performs a partial update (PATCH) on a job. Only provided fields
    are updated, unspecified fields remain unchanged. Job name must remain ALL UPPERCASE if modified.

    **Path Parameters:**
    - `job_id` (required): Job ObjectId to update

    **Request Body (JobsUpdateSchema):**
    - `name` (optional): New job name (must be ALL UPPERCASE)
    - `shortCode` (optional): New short code
    - `description` (optional): New description

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Job updated successfully"
    - `data`: Updated job object

    **Error Responses:**
    - 400: Validation error or invalid ID format
    - 403: Permission denied (UPDATE permission required)
    - 404: Job not found
    - 409: Conflict (duplicate name or shortCode)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with JOB_UPDATED code
    """
    try:

        # Validate job name format if name is being updated
        if job_update and job_update.name is not None:
            _validate_job_name(job_update.name)

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.JOB_UPDATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await update_job(job_id, job_update, current_user.id, client_ip)

        # Log successful updated
        await log_transaction(
            request=request,
            log_code=LogCodes.JOB_UPDATED,
            json_values={
                "jobId": job_id,
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
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{job_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a job",
    description="Soft deletes a job record by setting isDelete=true."
)
async def delete_job_endpoint(
    job_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a job.

    This endpoint performs a soft delete by setting isDelete=true.
    The record remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `job_id` (required): Job ObjectId to delete

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Job deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid job ID format or job in use by roles
    - 403: Permission denied (DELETE permission required)
    - 404: Job not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with JOB_DELETED code
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.JOB_DELETE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_DELETE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        success = await delete_job(job_id, current_user.id, client_ip)
        if success:
            # Log successful deletion
            await log_transaction(
                request=request,
                log_code=LogCodes.JOB_DELETED,
                json_values={
                    "jobId": job_id,
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
                error_code=ErrorCodes.JOB_DELETE_NOT_FOUND,
                parameters={"job_id": job_id, "errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_DELETE_NOT_FOUND
                )
            )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_DELETE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_DELETE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_DELETE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_DELETE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{job_id}",
    status_code=status.HTTP_200_OK,
    summary="Restore a deleted job",
    description="Restores a soft-deleted job record by setting isDelete=false."
)
async def restore_job_endpoint(
    job_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted job.

    This endpoint restores a previously soft-deleted job by setting
    isDelete=false.

    **Path Parameters:**
    - `job_id` (required): Job ObjectId to restore

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Job restored successfully"
    - `data`: Restored job object

    **Error Responses:**
    - 400: Invalid job ID format or job not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Job not found
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with JOB_RESTORED code
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.JOB_UPDATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        restored = await restore_job(job_id, current_user.id, client_ip)

        # Log successful restored
        await log_transaction(
            request=request,
            log_code=LogCodes.JOB_RESTORED,
            json_values={
                "jobId": job_id,
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
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
            )
        )


@router.patch(
    "/active/{job_id}",
    status_code=status.HTTP_200_OK,
    summary="Toggle job active status",
    description="Activates or deactivates a job without deleting it."
)
async def toggle_active_job_endpoint(
    job_id: str,
    toggle_data: JobsActiveToggleSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Toggle isActive status of a job.

    This endpoint allows activating or deactivating a job without performing
    a soft delete. Inactive jobs may still be referenced but won't appear
    in active listings.

    **Path Parameters:**
    - `job_id` (required): Job ObjectId

    **Request Body (JobsActiveToggleSchema):**
    - `isActive` (required): New active status (true or false)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Job activated/deactivated successfully"
    - `data`: Updated job object

    **Error Responses:**
    - 400: Invalid job ID format
    - 403: Permission denied (UPDATE permission required)
    - 404: Job not found
    - 500: Internal server error
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.JOB_UPDATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        updated = await toggle_active_job(
            job_id,
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
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_UPDATE_FAILED,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_UPDATE_FAILED
            )
        )


@router.get(
    "/get/{job_id}",
    status_code=status.HTTP_200_OK,
    summary="Get job by ID",
    description="Retrieves a single job record by its ObjectId."
)
async def get_job_endpoint(
    job_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a job record by ID.

    This endpoint retrieves a single job record with all its fields.

    **Path Parameters:**
    - `job_id` (required): Job ObjectId

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Job fetched successfully"
    - `data`: Job object with all fields

    **Error Responses:**
    - 400: Invalid job ID format
    - 403: Permission denied (READ permission required)
    - 404: Job not found
    - 500: Internal server error
    """
    try:

        job = await get_job(job_id, include_deleted)

        if not job:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.JOB_GET_NOT_FOUND,
                parameters={"job_id": job_id, "errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=job,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_GET_NOT_FOUND,
            parameters={"job_id": job_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.JOB_GET_NOT_FOUND,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_GET_NOT_FOUND
            )
        )
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_GET_NOT_FOUND,
            parameters={"job_id": job_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    status_code=status.HTTP_200_OK,
    summary="List all jobs",
    description="Retrieves a paginated list of jobs with optional filters."
)
async def list_jobs_endpoint(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    search: Optional[str] = Query(None, description="Search by name, shortCode, or description"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all jobs with optional pagination and filters.

    This endpoint retrieves job records with support for searching,
    filtering, and pagination.

    **Query Parameters:**
    - `page` (optional): Page number (1-indexed), omit for all records
    - `page_size` (optional): Records per page (1-1000)
    - `search` (optional): Search in name, shortCode, or description (case-insensitive)
    - `include_deleted` (optional): Include soft-deleted records (default: false)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Job list fetched successfully"
    - `data`: Array of job objects
    - `total`: Total count of matching records
    - `page`: Current page number
    - `page_size`: Records per page
    - `total_pages`: Total number of pages

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        result = await list_jobs(
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
            error_code=ErrorCodes.JOB_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_LIST_FAILED
            )
        )


@router.post(
    "/bulk-create",
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create jobs",
    description="Creates multiple job records in a single request with individual error handling."
)
async def bulk_create_jobs_endpoint(
    jobs_data: List[JobsCreateSchema],
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Bulk create job records.

    This endpoint processes multiple job creation requests in a single call.
    Each item is processed individually, allowing partial success.

    **Request Body:**
    - Array of JobsCreateSchema objects

    **Response:**
    - `totalProcessed`: Total number of items processed
    - `successCount`: Number of successfully created jobs
    - `failedCount`: Number of failed items
    - `successful`: Array of successfully created job objects
    - `failed`: Array of failed items with error details

    **Processing Behavior:**
    - Each item is processed independently
    - Failures do not stop processing of remaining items
    - Job names must be ALL UPPERCASE

    **Error Responses:**
    - 403: Permission denied (CREATE permission required)
    - 400: No authenticated user ID
    """
    try:

        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.JOB_CREATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_CREATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        result = await bulk_create_jobs(
            data_list=jobs_data,
            created_by=current_user.id,
            client_ip=client_ip
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
            error_code=ErrorCodes.JOB_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        raise
    except Exception as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.JOB_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=(error_log or {}).get("errorCode") or ErrorCodes.JOB_CREATE_FAILED
            )
        )
