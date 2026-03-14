"""
ValueSets (Enums) Router
Provides API endpoints for enum/value set management
Routes: /api/v1/value-sets
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from bson import ObjectId

from app.api.v1.schemas.auth_schema import TokenDataSchema
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
    ModulePrefixes
)
from app.constants.error_codes import ErrorCodes
from app.constants.jobs import Jobs
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip
from app.api.v1.schemas.value_sets_schema import (
    ValueSetCreateSchema,
    ValueSetResponseSchema,
    ValueSetUpdateSchema
)
from app.api.v1.services.value_sets_service import (
    create_value_set,
    update_value_set_by_key,
    delete_value_set_by_key,
    restore_value_set_by_key,
    get_value_set_by_key,
    list_value_sets,
    bootstrap_value_sets,
    validate_enum,
    get_enum_items,
    get_label,
    preload_enums,
    refresh_enum_cache,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/value-sets", tags=["value-sets"])

# Job name for RBAC permission checks (from centralized constants)
JOB_NAME = Jobs.VALUE_SETS
MODULE_PREFIX = ModulePrefixes.VALUE_SETS
ENTITY_NAME = "Value Set"
ENTITY_NAME_PLURAL = "Value Sets"


class PaginatedValueSetResponse(BaseModel):
    """Paginated response model for value sets list"""
    data: List[ValueSetResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


class EnumItemResponse(BaseModel):
    """Response model for enum items"""
    code: str
    label: str


class ValidateEnumRequest(BaseModel):
    """Request model for enum validation"""
    key: str
    code: str


class ValidateEnumResponse(BaseModel):
    """Response model for enum validation"""
    valid: bool
    key: str
    code: str


class DeleteRestoreSchema(BaseModel):
    """Schema for delete/restore operations with IP tracking"""
    updatedIp: Optional[str] = None


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new value set",
    description="Creates a new value set (enum) record for managing dropdown options and code lists."
)
async def create_value_set_endpoint(
    value_set: ValueSetCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new value set record.

    This endpoint creates a value set (enum) that can be used for
    dropdowns, code lists, and validation throughout the application.

    **Request Body (ValueSetCreateSchema):**
    - `key` (required): Unique identifier for the value set (e.g., "errorSeverity")
    - `description` (optional): Description of the value set
    - `module` (optional): Module this value set belongs to
    - `items` (required): Array of items with code and labels

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Value Set created successfully"
    - `data`: Created value set object

    **Error Responses:**
    - 400: Validation error or duplicate key
    - 403: Permission denied (CREATE permission required)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with VALUE_SET_CREATED code
    """
    try:
        
        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        result = await create_value_set(value_set, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.VALUE_SET_CREATED,
            json_values={
                "valueSetId": result.get("_id", ""),
                "key": result.get("key", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(
                data=result,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.VALUESET_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_CREATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.VALUESET_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.VALUESET_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all value sets",
    description="Retrieves all value set records with optional pagination, search, and filters."
)
async def get_all_value_sets_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    search: Optional[str] = Query(None, description="Search in key or description"),
    module: Optional[str] = Query(None, description="Filter by module"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all value sets with optional pagination and filters.

    This endpoint retrieves value set records with support for
    search by key/description and filtering by module.

    **Query Parameters:**
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `search` (optional): Search in key or description
    - `module` (optional): Filter by module name
    - `page` (optional): Page number starting from 1
    - `page_size` (optional): Items per page (1-100)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Value Set list fetched successfully"
    - `data`: Array of value set objects
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        

        value_sets_list, total = await list_value_sets(
            include_deleted=include_deleted,
            search=search,
            module=module,
            page=page,
            page_size=page_size
        )

        # Use paginated response only when pagination is requested
        if page is not None:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_paginated(
                    data=value_sets_list,
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
                data=value_sets_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_LIST_FAILED
            )
        )


@router.get(
    "/get/{key}",
    summary="Get value set by key",
    description="Retrieves a single value set by its unique key with localized labels."
)
async def get_value_set_by_key_endpoint(
    key: str,
    request: Request,
    lang: str = Query("en", description="Language code for labels"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a value set by key with localized labels.

    This is the recommended way to fetch value sets for application use.
    The key is globally unique and provides a stable reference.

    **Path Parameters:**
    - `key` (required): Value set key (e.g., "errorSeverity")

    **Query Parameters:**
    - `lang` (optional): Language code for labels (default: "en", falls back to "en" if not found)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Value Set fetched successfully"
    - `data`: Value set object with items
      - When `lang` is provided: items are `[{"code": "...", "label": "..."}]`
      - Without `lang`: items include full labels `[{"code": "...", "labels": {"en": "...", "hi": "..."}}]`

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 404: Value set not found
    - 500: Internal server error
    """
    try:
        

        value_set = await get_value_set_by_key(key, lang)

        if not value_set:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.VALUESET_GET_NOT_FOUND,
                parameters={"errorMessage": f"Value set with key '{key}' not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.VALUESET_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=value_set,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()} by key")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_GET_NOT_FOUND,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_GET_NOT_FOUND
            )
        )


@router.put(
    "/update/{key}",
    summary="Update a value set",
    description="Updates an existing value set record by its unique key."
)
async def update_value_set_endpoint(
    key: str,
    value_set_update: ValueSetUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing value set record by key.

    This endpoint updates a value set, allowing changes to items,
    description, and other properties.

    **Path Parameters:**
    - `key` (required): Value set key (e.g., "errorSeverity")

    **Request Body (ValueSetUpdateSchema):**
    All fields are optional:
    - `description`: New description
    - `module`: New module association
    - `items`: Updated array of items with code and labels

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Value Set updated successfully"
    - `data`: Updated value set object

    **Error Responses:**
    - 400: Validation error
    - 403: Permission denied (UPDATE permission required)
    - 404: Value set not found
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with VALUE_SET_UPDATED code
    - Refreshes enum cache automatically
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        result = await update_value_set_by_key(key, value_set_update.model_dump(exclude_unset=True), current_user.id, client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.VALUE_SET_UPDATED,
            json_values={
                "key": key,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=result,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_code = ErrorCodes.VALUESET_UPDATE_NOT_FOUND if "not found" in str(e).lower() else ErrorCodes.VALUESET_UPDATE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=error_code
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{key}",
    summary="Soft delete a value set",
    description="Performs a soft delete on a value set record by setting isDelete=True."
)
async def delete_value_set_endpoint(
    key: str,
    request: Request,
    delete_data: Optional[DeleteRestoreSchema] = None,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a value set record by key.

    This endpoint performs a soft delete on a value set.
    The record remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `key` (required): Value set key (e.g., "errorSeverity")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Value Set deleted successfully"

    **Error Responses:**
    - 403: Permission denied (DELETE permission required)
    - 404: Value set not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=True, isActive=False
    - Logs transaction with VALUE_SET_DELETED code
    - Refreshes enum cache
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)
        await delete_value_set_by_key(key, current_user.id, client_ip)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.VALUE_SET_DELETED,
            json_values={
                "key": key,
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
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_code = ErrorCodes.VALUESET_UPDATE_NOT_FOUND if "not found" in str(e).lower() else ErrorCodes.VALUESET_UPDATE_FAILED
        error_log = await log_error(
            request=request,
            error_code=error_code,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=error_message,
                error_code=error_code
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_UPDATE_FAILED
            )
        )


@router.patch(
    "/restore/{key}",
    summary="Restore a soft-deleted value set",
    description="Restores a soft-deleted value set record by setting isDelete=False and isActive=True."
)
async def restore_value_set_endpoint(
    key: str,
    request: Request,
    restore_data: Optional[DeleteRestoreSchema] = None,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted value set record by key.

    This endpoint restores a previously soft-deleted value set,
    making it active and visible in normal queries again.

    **Path Parameters:**
    - `key` (required): Value set key (e.g., "errorSeverity")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Value Set restored successfully"

    **Error Responses:**
    - 400: Value set not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Value set not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=False, isActive=True
    - Logs transaction with VALUE_SET_RESTORED code
    - Refreshes enum cache
    """
    try:
        

        # Get client IP using centralized helper
        client_ip = get_client_ip(request)
        await restore_value_set_by_key(key, current_user.id, client_ip)

        # Log successful restore
        await log_transaction(
            request=request,
            log_code=LogCodes.VALUE_SET_RESTORED,
            json_values={
                "key": key,
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
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.VALUESET_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_UPDATE_FAILED
            )
        )


# ============================================================================
# Integration Helpers
# ============================================================================

@router.get(
    "/get/{key}/items",
    response_model=List[EnumItemResponse],
    summary="Get all items for a value set",
    description="Retrieves all items for a value set with localized labels for dropdown population."
)
async def get_enum_items_endpoint(
    key: str,
    request: Request,
    lang: str = Query("en", description="Language code for labels"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all items for a value set with localized labels.

    This endpoint is optimized for dropdown/select population,
    returning just the code and resolved label for each item.

    **Path Parameters:**
    - `key` (required): Value set key (e.g., "errorSeverity")

    **Query Parameters:**
    - `lang` (optional): Language code for labels (default: "en")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Value Set items fetched successfully"
    - `data`: Array of items `[{"code": "...", "label": "..."}]`

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 404: Value set not found
    - 500: Internal server error
    """
    try:
        # RBAC: Check READ permission
        

        items = await get_enum_items(key, lang)

        if not items:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.VALUESET_GET_NOT_FOUND,
                parameters={"errorMessage": f"Value set items with key '{key}' not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.VALUESET_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=items,
                message=SuccessMessages.format(SuccessMessages.FETCHED, f"{ENTITY_NAME} items")
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()} items")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_GET_NOT_FOUND,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_GET_NOT_FOUND
            )
        )


@router.post(
    "/validate",
    response_model=ValidateEnumResponse,
    summary="Validate if a code exists in a value set",
    description="Validates whether a specific code exists in a value set for data validation purposes."
)
async def validate_enum_endpoint(
    validate_request: ValidateEnumRequest,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Validate if a code exists in a value set.

    This endpoint is useful for server-side validation of enum values
    before saving data.

    **Request Body (ValidateEnumRequest):**
    - `key` (required): Value set key (e.g., "errorSeverity")
    - `code` (required): Code to validate (e.g., "CRITICAL")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Validation completed"
    - `data`: `{"valid": true/false, "key": "...", "code": "..."}`

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        # RBAC: Check READ permission
        

        is_valid = await validate_enum(validate_request.key, validate_request.code)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "valid": is_valid,
                    "key": validate_request.key,
                    "code": validate_request.code
                },
                message="Validation completed"
            )
        )
    except Exception as e:
        logger.exception("Error validating enum")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.VALUESET_VALIDATE_NOT_FOUND,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.VALUESET_VALIDATE_NOT_FOUND
            )
        )


@router.get(
    "/get/{key}/label/{code}",
    summary="Get label for a specific code",
    description="Retrieves the localized label for a specific code within a value set."
)
async def get_label_endpoint(
    key: str,
    code: str,
    request: Request,
    lang: str = Query("en", description="Language code for label"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get the localized label for a specific code in a value set.

    This endpoint is useful for displaying human-readable labels
    for stored code values.

    **Path Parameters:**
    - `key` (required): Value set key (e.g., "errorSeverity")
    - `code` (required): Item code (e.g., "CRITICAL")

    **Query Parameters:**
    - `lang` (optional): Language code for label (default: "en")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Label fetched successfully"
    - `data`: `{"key": "...", "code": "...", "label": "...", "lang": "..."}`

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:
        # RBAC: Check READ permission
        
        label = await get_label(key, code, lang)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "key": key,
                    "code": code,
                    "label": label,
                    "lang": lang
                },
                message="Label fetched successfully"
            )
        )
    except Exception as e:
        logger.exception("Error fetching label")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=ErrorCodes.VALUESET_GET_NOT_FOUND
            )
        )


# ============================================================================
# Bootstrap (Front-end Preload)
# ============================================================================

@router.get(
    "/bootstrap",
    summary="Bootstrap all value sets for front-end",
    description="Retrieves all active value sets with resolved labels for front-end preload/caching."
)
async def bootstrap_enums_endpoint(
    lang: str = Query("en", description="Language code for labels"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get all active value sets for front-end bootstrap.

    This endpoint returns all active value sets with resolved labels
    in a format optimized for front-end caching and preloading.

    **Query Parameters:**
    - `lang` (optional): Language code for labels (default: "en")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Bootstrap data fetched successfully"
    - `data`: Object keyed by value set key with items arrays

    **Error Responses:**
    - 500: Internal server error

    **Notes:**
    - Returns only active, non-deleted value sets
    - Suitable for loading into front-end state management
    """
    try:
        bootstrap_data = await bootstrap_value_sets(lang)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=bootstrap_data,
                message="Bootstrap data fetched successfully"
            )
        )
    except Exception as e:
        logger.exception("Error fetching bootstrap data")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=ErrorCodes.VALUESET_GET_NOT_FOUND
            )
        )


# ============================================================================
# Cache Management
# ============================================================================

@router.post(
    "/cache/refresh",
    summary="Refresh cache for all value sets",
    description="Refreshes the in-memory cache for all active value sets."
)
async def refresh_all_cache_endpoint(
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Refresh cache for all active value sets.

    This endpoint clears and rebuilds the in-memory cache for all
    active value sets. Use after bulk updates or database changes.

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Cache refreshed successfully"
    - `data`: `{"refreshedCount": number}`

    **Error Responses:**
    - 500: Internal server error

    **Notes:**
    - This is an admin operation
    - May take a few seconds for large datasets
    """
    try:
        count = await refresh_enum_cache(key=None)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "refreshedCount": count
                },
                message="Cache refreshed successfully"
            )
        )
    except Exception as e:
        logger.exception("Error refreshing cache")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=ErrorCodes.VALUESET_CACHE_REFRESH_FAILED
            )
        )


@router.post(
    "/get/{key}/cache/refresh",
    summary="Refresh cache for a specific value set",
    description="Refreshes the in-memory cache for a specific value set by its key."
)
async def refresh_key_cache_endpoint(
    key: str,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Refresh cache for a specific value set.

    This endpoint clears and rebuilds the in-memory cache for a single
    value set. Use after updating a specific value set.

    **Path Parameters:**
    - `key` (required): Value set key (e.g., "errorSeverity")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Cache refreshed successfully"
    - `data`: `{"refreshedCount": number}`

    **Error Responses:**
    - 404: Value set not found
    - 500: Internal server error
    """
    try:
        count = await refresh_enum_cache(key=key)

        if count == 0:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME),
                    error_code=ErrorCodes.VALUESET_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "refreshedCount": count
                },
                message="Cache refreshed successfully"
            )
        )
    except Exception as e:
        logger.exception("Error refreshing cache")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=ErrorCodes.VALUESET_CACHE_REFRESH_FAILED
            )
        )


@router.post(
    "/preload",
    summary="Preload specific value sets into cache",
    description="Preloads specified value sets into cache for improved performance."
)
async def preload_enums_endpoint(
    keys: Optional[List[str]] = None,
    lang: str = Query("en", description="Language code for labels"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Preload specific value sets into cache (batch operation).

    This endpoint loads specified value sets into the in-memory cache,
    useful for warming up the cache on application startup.

    **Request Body:**
    - `keys` (optional): Array of value set keys to preload. If not provided, preloads all.

    **Query Parameters:**
    - `lang` (optional): Language code for labels (default: "en")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Value sets preloaded successfully"
    - `data`: `{"loadedCount": number, "keys": [...]}`

    **Error Responses:**
    - 500: Internal server error

    **Notes:**
    - Can be called on application startup
    - Improves response times for subsequent requests
    """
    try:
        result = await preload_enums(keys=keys, lang=lang)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "loadedCount": len(result),
                    "keys": list(result.keys())
                },
                message="Value sets preloaded successfully"
            )
        )
    except Exception as e:
        logger.exception("Error preloading enums")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=ErrorCodes.VALUESET_CACHE_REFRESH_FAILED
            )
        )
