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

from app.schemas.auth_schema import TokenDataSchema
from app.schemas.jobs_schema import (
    JobsCreateSchema,
    JobsResponseSchema,
    JobsUpdateSchema,
    JobsActiveToggleSchema
)
from app.services.jobs_service import (
    create_job,
    update_job,
    delete_job,
    restore_job,
    toggle_active_job,
    get_job,
    list_jobs,
    bulk_create_jobs
)
from app.utils.dependencies import get_current_user
from app.utils.request_helpers import get_client_ip
from app.utils.standard_response import (
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])

# Module configuration
MODULE_PREFIX = ModulePrefixes.JOB
ENTITY_NAME = "Job"
ENTITY_NAME_PLURAL = "Jobs"
JOB_NAME = Jobs.JOBS


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)





def _validate_job_name(name: str):
    """Validate job name format - ALL UPPERCASE with only one space between words"""
    pattern = r"^[A-Z]+( [A-Z]+)*$"
    if not re.fullmatch(pattern, name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ResponseBuilder.bad_request(
                message="Job name must be ALL UPPERCASE with only one space between words and no special characters.",
                error_code=_error_code("NAME_INVALID")
            )
        )


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_job_endpoint(
    job: JobsCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new job.

    - **name**: Job name (must be ALL UPPERCASE with only one space between words)
    - **shortCode**: Short code for the job (required)
    - **description**: Optional description
    - **isMenu**: Whether this job should appear in menu (default: true)

    Note: IP address is captured automatically from request headers (Cloudflare + Azure)
    """
    try:
        # Validate job name format
        _validate_job_name(job.name)


        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP using utility (handles Cloudflare CF-Connecting-IP, X-Forwarded-For, etc.)
        client_ip = get_client_ip(request)

        created = await create_job(job, current_user.id, created_ip=client_ip)
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
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.CREATE)
            )
        )


@router.patch("/update/{job_id}")
async def update_job_endpoint(
    job_id: str,
    job_update: JobsUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing job.

    - **job_id**: Job ID (path parameter)
    - Updates updatedAt and updatedBy automatically
    - If job name is changed, it cascades to roles and user_role_permissions

    Note: IP address is captured automatically from request headers (Cloudflare + Azure)
    """
    try:

        # Validate job name format if name is being updated
        if job_update and job_update.name is not None:
            _validate_job_name(job_update.name)

        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=_error_code(ErrorCodes.AUTH)
                )
            )

        # Get client IP using utility (handles Cloudflare CF-Connecting-IP, X-Forwarded-For, etc.)
        client_ip = get_client_ip(request)

        updated = await update_job(job_id, job_update, current_user.id, updated_ip=client_ip)
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
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.UPDATE)
            )
        )


@router.delete("/delete/{job_id}")
async def delete_job_endpoint(
    job_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a job.

    - **job_id**: Job ID (path parameter)
    - Sets isDelete=true for soft deletion
    - Validates that job is not used in any roles before deletion

    Note: IP address is captured automatically from request headers (Cloudflare + Azure)
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

        # Get client IP using utility (handles Cloudflare CF-Connecting-IP, X-Forwarded-For, etc.)
        client_ip = get_client_ip(request)

        success = await delete_job(job_id, current_user.id, deleted_ip=client_ip)
        if success:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_success(
                    data=None,
                    message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
                )
            )
        else:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_DELETED, ENTITY_NAME),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )
    except HTTPException:
        raise
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.DELETE)
            )
        )


@router.patch("/restore/{job_id}")
async def restore_job_endpoint(
    job_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted job by setting isDelete=false
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

        restored = await restore_job(job_id, current_user.id)
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
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.RESTORE)
            )
        )


@router.patch("/active/{job_id}")
async def toggle_active_job_endpoint(
    job_id: str,
    toggle_data: JobsActiveToggleSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Toggle isActive status of a job.

    - **job_id**: Job ID (path parameter)
    - **isActive**: New active status (true or false)
    - **updatedIp**: IP address of updater (optional)
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

        updated = await toggle_active_job(
            job_id,
            toggle_data.isActive,
            current_user.id,
            toggle_data.updatedIp
        )
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
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error toggling active status for {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.ACTIVE)
            )
        )


@router.get("/get/{job_id}")
async def get_job_endpoint(
    job_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single job by ID.

    - **job_id**: Job ID (path parameter)
    - **include_deleted**: Include soft-deleted records (default: False)
    """
    try:

        job = await get_job(job_id, include_deleted)

        if not job:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=job,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.READ)
            )
        )


@router.get("/list")
async def list_jobs_endpoint(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    search: Optional[str] = Query(None, description="Search by name, shortCode, or description"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all jobs with optional pagination and filters.

    - **page**: Page number (optional). If not provided, returns all records
    - **page_size**: Items per page (optional, max: 1000). Only used if page is provided
    - **search**: Search in name, shortCode, or description
    - **include_deleted**: Include soft-deleted records (default: False)
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
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


@router.post("/bulk-create", status_code=status.HTTP_201_CREATED)
async def bulk_create_jobs_endpoint(
    jobs_data: List[JobsCreateSchema],
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create multiple jobs at once.

    Args:
        jobs_data: List of job creation data
        current_user: Currently authenticated user

    Returns:
        Summary of bulk creation with success and failure counts
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

        result = await bulk_create_jobs(
            data_list=jobs_data,
            created_by=current_user.id
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
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error in bulk create {ENTITY_NAME_PLURAL.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.BULK_CREATE)
            )
        )
