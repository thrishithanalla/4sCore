"""
Error Master Router.

This module provides FastAPI endpoints for managing error master records in the system.
Error masters define standardized error codes, types, severities, and localized messages
used throughout the application for consistent error handling and reporting.

An error master is a template that defines:
    - Unique error code (namespaced format: ERR.<MODULE>.<COMPONENT>.<ACTION>)
    - Error type classification (Business, Technical, etc.)
    - Severity level (Info, Warning, Error, Fatal)
    - Localized message templates with placeholder support
    - Optional metadata (business area, technical area, help links)

Key Features:
    - Full CRUD operations for error masters
    - Bulk create for importing multiple error codes
    - RBAC permission checking for all operations
    - Soft delete and restore functionality
    - Search and filtering with pagination
    - Value-set validation for errorType and errorSeverity
    - Foreign key validation for moduleId
    - Transaction logging and error logging
    - IP tracking for audit trail

Endpoints:
    POST /create - Create a new error master
    POST /bulk-create - Bulk create multiple error masters
    GET /list - List error masters with pagination and filters
    GET /get/{id} - Get error master by MongoDB ObjectId
    GET /get/by-code/{error_code} - Get error master by errorCode string
    PATCH /update/{id} - Update an error master
    DELETE /delete/{id} - Soft delete an error master
    PATCH /restore/{id} - Restore a deleted error master

Collections Used:
    - error_master: Primary collection
    - value_sets: For errorType and errorSeverity validation
    - modules: For moduleId foreign key validation

Error Code Format:
    ERR.<MODULE>.<COMPONENT>.<ACTION>
    Examples:
    - ERR.AUTH.LOGIN.FAILED
    - ERR.CORE.UNIT.CREATE.DUPLICATE
    - ERR.PERSONNEL.UPDATE.NOT_FOUND

Usage:
    from app.api.v1.routers.error_master_router import router

    app.include_router(router)

See Also:
    - ErrorMasterService: Business logic layer
    - ErrorMasterSchema: Request/response schemas
    - ErrorLogger: For logging errors using these masters
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.error_master_schema import (
    ErrorMasterCreateSchema,
    ErrorMasterResponseSchema,
    ErrorMasterSearchOutSchema,
    ErrorMasterUpdateSchema,
    ErrorMasterBulkCreateSchema,
    ErrorMasterBulkCreateResponseSchema,
    ErrorMasterCreateResponseDTO,
    ErrorMasterListResponseDTO,
    ErrorMasterGetResponseDTO,
    ErrorMasterUpdateResponseDTO,
    ErrorMasterDeleteResponseDTO,
    ErrorMasterRestoreResponseDTO,
    PageOut
)
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.api.v1.services.error_master_service import (
    _search_impl,
    create_error_master,
    delete_error_master,
    restore_error_master,
    get_error_master_by_code,
    get_error_master_by_id,
    list_error_masters_all,
    search_error_masters,
    update_error_master
)
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorCodes, ErrorMessages, SuccessMessages, PermissionMessages, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CoreErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/error-master", tags=["error-master"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.ERROR_MASTER

# Module configuration
MODULE_PREFIX = ModulePrefixes.ERROR_MASTER
ENTITY_NAME = "Error Master"
ENTITY_NAME_PLURAL = "Error Masters"


def _error_code(code: str) -> str:
    """Generate full error code with module prefix."""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)


@router.post(
    "/create",
    response_model=ErrorMasterCreateResponseDTO,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new error master",
    description="Creates a new error master record with validation against value-sets."
)
async def create_error_master_endpoint(
    payload: ErrorMasterCreateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Create a new error master record.

    Creates a new error code definition with localized messages and metadata.
    The errorCode must follow the namespaced format: ERR.<MODULE>.<COMPONENT>.<ACTION>.

    **Request Body (ErrorMasterCreateSchema):**
    - `errorCode` (required): Unique error code (format: ERR.<MODULE>.<COMPONENT>.<ACTION>)
    - `errorType` (required): Must exist in 'errorType' value-set (e.g., Business, Technical)
    - `errorSeverity` (required): Must exist in 'errorSeverity' value-set (e.g., Info, Warning, Error, Fatal)
    - `log` (optional): Whether to log this error (default: true)
    - `moduleId` (optional): Reference to modules collection
    - `businessArea` (optional): Business domain context
    - `technicalArea` (optional): Technical domain context
    - `messages` (required): Array of localized messages with {placeholders}
    - `devMessage` (optional): Developer-facing message
    - `helpLink` (optional): URL to help documentation
    - `videoLink` (optional): URL to video tutorial

    **Response (ErrorMasterCreateResponseDTO):**
    - `success`: true on success
    - `code`: 201 (Created)
    - `message`: "Error Master created successfully"
    - `data`: Created error master object with audit fields

    **Error Responses:**
    - 400: Validation error (invalid errorCode format, missing required fields)
    - 403: Permission denied (CREATE permission required)
    - 409: Conflict (duplicate errorCode)
    - 500: Internal server error
    """
    try:
        

        # Get client IP using centralized helper
        created_ip = get_client_ip(request)

        created = await create_error_master(
            db, payload,
            created_by=None,
            created_ip=created_ip
        )

        # Log successful created
        await log_transaction(
            request=request,
            log_code=LogCodes.ERROR_MASTER_CREATED,
            json_values={
                "errorMasterId": created.id,
                "errorCode": created.errorCode,
                "createdBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=created.model_dump(mode="json"),
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME),
                code=201
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else e.detail.get("message", str(e.detail))},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or (str(e.detail) if isinstance(e.detail, str) else e.detail.get("message", str(e.detail)))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("create_error_master_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_CREATE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_CREATE_FAILED
            )
        )


@router.post(
    "/bulk-create",
    response_model=ErrorMasterBulkCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create error masters",
    description="Creates multiple error master records in a single request with individual error handling."
)
async def bulk_create_error_master_endpoint(
    payload: ErrorMasterBulkCreateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ErrorMasterBulkCreateResponseSchema:
    """
    Bulk create multiple error master records.

    Processes each item individually and continues even if some items fail.
    Returns separate lists for successful and failed items.

    **Request Body (ErrorMasterBulkCreateSchema):**
    - `items` (required): Array of ErrorMasterCreateSchema objects

    **Response (ErrorMasterBulkCreateResponseSchema):**
    - `success`: Array of successfully created error masters
    - `failed`: Array of failed items with index, errorCode, and error details
    - `totalSuccess`: Count of successfully created items
    - `totalFailed`: Count of failed items

    **Processing Behavior:**
    - Each item is processed independently
    - Failures do not stop processing of remaining items
    - Individual item errors are captured and returned in failed list

    **Error Responses:**
    - 403: Permission denied (CREATE permission required)
    - 400: No authenticated user ID
    """
    

    success_list = []
    failed_list = []

    # Get client IP using centralized helper
    created_ip = get_client_ip(request)

    for index, item in enumerate(payload.items):
        try:
            created = await create_error_master(
                db, item,
                created_by=None,
                created_ip=created_ip
            )
            success_list.append(created)
        except HTTPException as he:
            await log_error(
                request=request,
                error_code=CoreErrorCodes.ERROR_MASTER_CREATE_FAILED,
                parameters={"errorCode": item.errorCode, "index": index, "errorMessage": str(he.detail)},
                actor_user_id=None
            )
            failed_list.append({
                "index": index,
                "errorCode": item.errorCode,
                "errors": he.detail
            })
        except ValueError as ve:
            await log_error(
                request=request,
                error_code=CoreErrorCodes.ERROR_MASTER_CREATE_FAILED,
                parameters={"errorCode": item.errorCode, "index": index, "errorMessage": str(ve)},
                actor_user_id=None
            )
            failed_list.append({
                "index": index,
                "errorCode": item.errorCode,
                "errors": str(ve)
            })
        except Exception as exc:
            logger.exception(f"bulk_create_error_master failed for item {index}")
            await log_error_with_exception(
                request=request,
                error_code=CoreErrorCodes.ERROR_MASTER_CREATE_FAILED,
                parameters={"errorCode": item.errorCode, "index": index, "errorMessage": str(exc)},
                exception=exc,
                actor_user_id=None
            )
            failed_list.append({
                "index": index,
                "errorCode": item.errorCode,
                "errors": "Internal server error"
            })

    bulk_response = ErrorMasterBulkCreateResponseSchema(
        success=success_list,
        failed=failed_list,
        totalSuccess=len(success_list),
        totalFailed=len(failed_list)
    )

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=api_success(
            data=bulk_response.model_dump(mode="json"),
            message=f"Bulk create completed: {len(success_list)} succeeded, {len(failed_list)} failed",
            code=201
        )
    )


# @router.get("/all", response_model=ErrorMasterListOutSchema)
# async def list_error_masters_no_pagination(
#     q: Optional[str] = Query(None, description="Search in errorCode (regex, case-insensitive)"),
#     errorSeverity: Optional[Severity] = Query(None),
#     errorType: Optional[ErrorType] = Query(None),
#     createdFrom: Optional[datetime] = Query(None),
#     createdTo: Optional[datetime] = Query(None),
#     db: AsyncIOMotorDatabase = Depends(get_database),
# ) -> ErrorMasterListOutSchema:
#     try:
#         items, total = await list_error_masters_all(
#             db=db,
#             q=q,
#             severity=errorSeverity,
#             err_type=errorType,
#             created_from=createdFrom,
#             created_to=createdTo,
#             hard_cap=5000,  # safety cap
#         )
#         return ErrorMasterListOutSchema(data=items, total=total)
#     except Exception:
#         raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/list",
    response_model=ErrorMasterListResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="List error masters with pagination",
    description="Retrieves error masters with optional pagination, search, and filtering."
)
async def list_error_masters_endpoint(
    request: Request,
    q: Optional[str] = Query(None, description="Search in errorCode (regex, case-insensitive). Supports partial/prefix search like 'ERR.ICP' to find all codes starting with that prefix."),
    moduleId: Optional[str] = Query(None, description="Filter by module ID (FK: modules._id)"),
    errorSeverity: Optional[str] = Query(None, description="Filter by error severity (e.g., Info, Warning, Error, Fatal)"),
    errorType: Optional[str] = Query(None, description="Filter by error type (e.g., Business, Technical)"),
    sourceType: Optional[str] = Query(None, description="Filter by source type (e.g., API, UI, SCREEN, FUNCTION, THIRDPARTY)"),
    appCode: Optional[str] = Query(None, description="Filter by application code"),
    createdFrom: Optional[datetime] = Query(None, description="Filter by creation date (from)"),
    createdTo: Optional[datetime] = Query(None, description="Filter by creation date (to)"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    pageSize: Optional[int] = Query(None, ge=1, le=200, description="Number of records per page (default: 20, max: 200)."),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    List error masters with optional pagination and filters.

    Retrieves a list of error master records with support for searching, filtering,
    and pagination. When pagination parameters are omitted, returns all matching records.

    **Query Parameters:**
    - `q` (optional): Search text in errorCode (regex, case-insensitive).
      Supports partial/prefix search (e.g., 'ERR.ICP' finds all codes starting with that prefix)
    - `moduleId` (optional): Filter by module ID (FK: modules._id)
    - `errorSeverity` (optional): Filter by severity level
    - `errorType` (optional): Filter by error type
    - `createdFrom` (optional): Filter by creation date (ISO 8601 format)
    - `createdTo` (optional): Filter by creation date (ISO 8601 format)
    - `page` (optional): Page number (1-indexed). Omit for all records.
    - `pageSize` (optional): Items per page (1-200, default: 20)

    **Response (ErrorMasterListResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Error Master list fetched successfully"
    - `data`: Array of error master objects
    - `pagination`: { page, pageSize, total, totalPages } (when page provided)

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        # Default pageSize to 20 when pagination is requested
        effective_page_size = pageSize if pageSize is not None else 20

        if page is not None:
            offset = (page - 1) * effective_page_size
            data, total = await search_error_masters(
                db=db, q=q, module_id=moduleId, severity=errorSeverity, err_type=errorType,
                created_from=createdFrom, created_to=createdTo, limit=effective_page_size, offset=offset,
                source_type=sourceType, app_code=appCode
            )
        else:
            # No pagination - return all records
            data, total = await search_error_masters(
                db=db, q=q, module_id=moduleId, severity=errorSeverity, err_type=errorType,
                created_from=createdFrom, created_to=createdTo, limit=None, offset=0,
                source_type=sourceType, app_code=appCode
            )

        # Convert to dict for response
        data_list = [item.model_dump(mode="json") for item in data]

        # Use paginated response only when pagination is requested
        if page is not None:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_paginated(
                    data=data_list,
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
                data=data_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME),
                code=200
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("list_error_masters_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_LIST_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_LIST_FAILED
            )
        )

@router.get(
    "/get/{id}",
    response_model=ErrorMasterGetResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Get error master by ID",
    description="Retrieves a single error master record by its ObjectId."
)
async def get_error_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Get a single error master by ID.

    Retrieves an error master record using its MongoDB ObjectId.

    **Path Parameters:**
    - `id` (required): The ObjectId of the error master to retrieve

    **Response (ErrorMasterGetResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Error Master fetched successfully"
    - `data`: Error master object with all fields

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 404: Error master not found
    - 500: Internal server error
    """
    try:

        doc = await get_error_master_by_id(db, id)
        if not doc:
            error_log = await log_error(
                request=request,
                error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND,
                parameters={"errorMessage": f"Error master with ID '{id}' not found"},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=doc.model_dump(mode="json"),
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_error_master_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(exc)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND
            )
        )


@router.get(
    "/get/by-code/{error_code}",
    response_model=ErrorMasterGetResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Get error master by error code",
    description="Retrieves a single error master record by its errorCode."
)
async def get_error_master_by_code_endpoint(
    error_code: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Get a single error master by errorCode.

    Retrieves an error master record using its unique errorCode string.
    This is useful for looking up error definitions by their code.

    **Path Parameters:**
    - `error_code` (required): The errorCode string (e.g., ERR.AUTH.LOGIN.FAILED)

    **Response (ErrorMasterGetResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Error Master fetched successfully"
    - `data`: Error master object with all fields

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 404: Error master with given errorCode not found
    - 500: Internal server error
    """
    try:

        doc = await get_error_master_by_code(db, error_code)
        if not doc:
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
                data=doc.model_dump(mode="json"),
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND,
            parameters={"errorCode": error_code, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_error_master_by_code_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND,
            parameters={"errorCode": error_code, "errorMessage": str(exc)},
            exception=exc,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_GET_NOT_FOUND
            )
        )


@router.patch(
    "/update/{id}",
    response_model=ErrorMasterUpdateResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Update an error master",
    description="Updates an error master record. The errorCode field is immutable."
)
async def update_error_master_endpoint(
    id: str,
    patch: ErrorMasterUpdateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Update an error master record.

    Updates an existing error master with partial data. Only provided fields
    are updated. The errorCode field is immutable and cannot be changed.

    **Path Parameters:**
    - `id` (required): The ObjectId of the error master to update

    **Request Body (ErrorMasterUpdateSchema):**
    All fields are optional. Only provided fields are updated:
    - `errorType`: Error type (must exist in value-set)
    - `errorSeverity`: Error severity (must exist in value-set)
    - `log`: Whether to log this error
    - `businessArea`: Business domain context
    - `technicalArea`: Technical domain context
    - `tool`: Associated tool
    - `partnerSystem`: Partner system reference
    - `thirdParty`: Third party reference
    - `messages`: Array of localized messages
    - `devMessage`: Developer-facing message
    - `helpLink`: URL to help documentation
    - `videoLink`: URL to video tutorial

    **Note:** The `errorCode` field cannot be updated as it is the unique identifier.

    **Response (ErrorMasterUpdateResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Error Master updated successfully"
    - `data`: Updated error master object

    **Error Responses:**
    - 400: Validation error
    - 403: Permission denied (UPDATE permission required)
    - 404: Error master not found
    - 500: Internal server error
    """
    try:


        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        updated = await update_error_master(db, id, patch, updated_by=None, updated_ip=client_ip)
        if not updated:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.ERROR_MASTER_UPDATED,
            json_values={
                "errorMasterId": id,
                "updatedBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=updated.model_dump(mode="json"),
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED,
            parameters={"errorMasterId": id, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("update_error_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED,
            parameters={"errorMasterId": id, "errorMessage": str(exc)},
            exception=exc,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{id}",
    response_model=ErrorMasterDeleteResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Soft delete an error master",
    description="Marks an error master as deleted (isDelete=true, isActive=false)."
)
async def delete_error_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Soft delete an error master record.

    Performs a soft delete by setting `isDelete=true` and `isActive=false`.
    The record is not physically removed from the database and can be restored.

    **Path Parameters:**
    - `id` (required): The ObjectId of the error master to delete

    **Response (ErrorMasterDeleteResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Error Master deleted successfully"

    **Recorded Metadata:**
    - `isDelete`: Set to true
    - `isActive`: Set to false
    - `updatedBy`: User who performed deletion
    - `updatedAt`: Deletion timestamp
    - `updatedIp`: IP address of the deletion request

    **Error Responses:**
    - 403: Permission denied (DELETE permission required)
    - 404: Error master not found
    - 500: Internal server error
    """
    try:

        # Get client IP using centralized helper
        deleted_ip = get_client_ip(request)
        ok = await delete_error_master(db, id, deleted_by=None, deleted_ip=deleted_ip)

        if not ok:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.ERROR_MASTER_DELETED,
            json_values={
                "errorMasterId": id,
                "deletedBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME),
                code=200
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_DELETE_FAILED,
            parameters={"errorMasterId": id, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_DELETE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("delete_error_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_DELETE_FAILED,
            parameters={"errorMasterId": id, "errorMessage": str(exc)},
            exception=exc,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{id}",
    response_model=ErrorMasterRestoreResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Restore a soft-deleted error master",
    description="Restores a deleted error master (isDelete=false, isActive=true)."
)
async def restore_error_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Restore a soft-deleted error master record.

    Restores a previously deleted error master by setting `isDelete=false`
    and `isActive=true`. Only records that are currently deleted can be restored.

    **Path Parameters:**
    - `id` (required): The ObjectId of the error master to restore

    **Response (ErrorMasterRestoreResponseDTO):**
    - `success`: true on success
    - `code`: 200
    - `message`: "Error Master restored successfully"

    **Recorded Metadata:**
    - `isDelete`: Set to false
    - `isActive`: Set to true
    - `updatedBy`: User who performed restoration
    - `updatedAt`: Restoration timestamp
    - `updatedIp`: IP address of the restoration request

    **Error Responses:**
    - 403: Permission denied (UPDATE permission required)
    - 404: Error master not found or not deleted
    - 500: Internal server error
    """
    try:
        # Get client IP using centralized helper
        restored_ip = get_client_ip(request)
        ok = await restore_error_master(db, id, restored_by=None, restored_ip=restored_ip)

        if not ok:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.ERROR_MASTER_RESTORED,
            json_values={
                "errorMasterId": id,
                "restoredBy": None
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME),
                code=200
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED,
            parameters={"errorMasterId": id, "errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("restore_error_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED,
            parameters={"errorMasterId": id, "errorMessage": str(exc)},
            exception=exc,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_MASTER_UPDATE_FAILED
            )
        )
