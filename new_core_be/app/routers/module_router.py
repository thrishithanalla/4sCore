"""
Module Router
Provides API endpoints for Module management
Routes: /api/v1/modules
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.schemas.auth_schema import TokenDataSchema
from app.schemas.module_schema import (
    ModuleCreateSchema,
    ModuleResponseSchema,
    ModuleUpdateSchema,
    ModuleActiveToggleSchema
)
from app.services.module_service import (
    create_module,
    update_module,
    delete_module,
    restore_module,
    toggle_active_module,
    get_module,
    list_modules,
    bulk_create_modules
)
from app.utils.dependencies import get_current_user
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

router = APIRouter(prefix="/api/v1/modules", tags=["modules"])

# Module configuration
MODULE_PREFIX = ModulePrefixes.MODULE
ENTITY_NAME = "Module"
ENTITY_NAME_PLURAL = "Modules"
JOB_NAME = Jobs.MODULES


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)



# ============================================================================
# CRUD Operations
# ============================================================================

@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_module_endpoint(
    module: ModuleCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new module.

    - **name**: Module name (must contain alphabets)
    - **shortCode**: Short code for the module (required)
    - **description**: Optional description
    - **createdIp**: IP address of creator (optional)
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

        created = await create_module(module, current_user.id)
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


@router.put("/update/{module_id}")
async def update_module_endpoint(
    module_id: str,
    module_update: ModuleUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing module.

    - **module_id**: Module ID (path parameter)
    - Updates updatedAt and updatedBy automatically
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

        updated = await update_module(module_id, module_update, current_user.id)
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


@router.delete("/delete/{module_id}")
async def delete_module_endpoint(
    module_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a module.

    - **module_id**: Module ID (path parameter)
    - Sets isDelete=true for soft deletion
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

        success = await delete_module(module_id, current_user.id)
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


@router.patch("/restore/{module_id}")
async def restore_module_endpoint(
    module_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted module by setting isDelete=false
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

        restored = await restore_module(module_id, current_user.id)
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


@router.patch("/active/{module_id}")
async def toggle_active_module_endpoint(
    module_id: str,
    toggle_data: ModuleActiveToggleSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Toggle isActive status of a module.

    - **module_id**: Module ID (path parameter)
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

        updated = await toggle_active_module(
            module_id,
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


@router.get("/get/{module_id}")
async def get_module_endpoint(
    module_id: str,
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single module by ID.

    - **module_id**: Module ID (path parameter)
    - **include_deleted**: Include soft-deleted records (default: False)
    """
    try:

        module = await get_module(module_id, include_deleted)

        if not module:
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
                data=module,
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
async def list_modules_endpoint(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number (starting from 1). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Number of items per page (max: 1000). Ignored if page is not provided."),
    search: Optional[str] = Query(None, description="Search by name, shortCode, or description"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    exclude_audit: bool = Query(False, description="Exclude audit fields (returns only id, name, description) - useful for UI dropdowns"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all modules with optional pagination and filters.

    - **page**: Page number (optional). If not provided, returns all records
    - **page_size**: Items per page (optional, max: 1000). Only used if page is provided
    - **search**: Search in name, shortCode, or description
    - **include_deleted**: Include soft-deleted records (default: False)
    - **exclude_audit**: If true, returns only id, name, and description (useful for UI dropdowns)
    """
    try:

        result = await list_modules(
            search=search,
            include_deleted=include_deleted,
            page=page,
            page_size=page_size,
            exclude_audit=exclude_audit
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
async def bulk_create_modules_endpoint(
    modules_data: List[ModuleCreateSchema],
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create multiple modules at once.

    Args:
        modules_data: List of module creation data
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

        result = await bulk_create_modules(
            data_list=modules_data,
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
