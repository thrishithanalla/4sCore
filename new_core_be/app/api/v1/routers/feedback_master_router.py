"""
FeedbackMaster API (v1).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.feedback_master_schema import (
    FeedbackMasterCreateSchema,
    FeedbackMasterUpdateSchema,
    FeedbackMasterActiveToggleSchema,
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.api.v1.services.feedback_master_service import (
    create_feedback_master,
    get_feedback_master_by_id,
    get_feedback_master_by_name,
    update_feedback_master,
    delete_feedback_master,
    restore_feedback_master,
    list_feedback_masters,
)
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/feedback-master", tags=["feedback-master"])

# Job name for RBAC permission checks
JOB_NAME = Jobs.FEEDBACK_MASTER

# Module configuration
MODULE_PREFIX = ModulePrefixes.FEEDBACK_MASTER
ENTITY_NAME = "Feedback Master"
ENTITY_NAME_PLURAL = "Feedback Masters"


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new feedback master",
    description="Creates a new feedback master record for categorizing and managing feedback types."
)
async def create_feedback_master_endpoint(
    payload: FeedbackMasterCreateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Create a new feedback master record.

    This endpoint creates a feedback master entry that defines a category
    or type of feedback that can be collected from users.

    **Request Body (FeedbackMasterCreateSchema):**
    - `name` (required): Unique name for the feedback type
    - `description` (optional): Description of the feedback type
    - `isActive` (optional): Whether the feedback type is active (default: true)

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Feedback Master created successfully"
    - `data`: Created feedback master object

    **Error Responses:**
    - 400: Validation error or user ID not found
    - 403: Permission denied (CREATE permission required)
    - 409: Duplicate name already exists
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with FEEDBACK_MASTER_CREATED code
    - Records createdIp from request
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_CREATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_MASTER_CREATE_FAILED
                )
            )

        # Get client IP using centralized helper
        created_ip = get_client_ip(request)

        created = await create_feedback_master(
            db, payload,
            created_by=current_user.id,
            created_ip=created_ip
        )

        # Log successful created
        await log_transaction(
            request=request,
            log_code=LogCodes.FEEDBACK_MASTER_CREATED,
            json_values={
                "feedbackMasterId": str(created.id) if hasattr(created, 'id') else "",
                "name": created.name if hasattr(created, 'name') else "",
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=created.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME),
                code=201
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else e.detail.get("message", str(e.detail))},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("create_feedback_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_CREATE_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all feedback masters",
    description="Retrieves all feedback master records with optional pagination, search, and filters."
)
async def list_feedback_masters_endpoint(
    request: Request,
    search: Optional[str] = Query(None, description="Search by name (case-insensitive)"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    is_active: Optional[bool] = Query(True, description="Filter by active status (true=active only, false=inactive only, null=all)"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    pageSize: Optional[int] = Query(None, ge=1, le=200, description="Number of records per page."),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    List all feedback masters with optional pagination and filters.

    This endpoint retrieves feedback master records with support for
    search and filtering by active status.

    **Query Parameters:**
    - `search` (optional): Search by name (case-insensitive)
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `is_active` (optional): Filter by active status (default: true)
    - `page` (optional): Page number starting from 1
    - `pageSize` (optional): Items per page (1-200, default: 20)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback Master list fetched successfully"
    - `data`: Array of feedback master objects
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:


        data, total = await list_feedback_masters(
            db=db,
            search=search,
            include_deleted=include_deleted,
            is_active=is_active,
            page=page,
            page_size=pageSize
        )

        # Convert to dict for response
        data_list = [item.model_dump(mode="json", by_alias=True) for item in data]

        # Use paginated response only when pagination is requested
        if page is not None:
            effective_page_size = pageSize if pageSize is not None else 20
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
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("list_feedback_masters_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_LIST_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_LIST_FAILED
            )
        )


@router.get(
    "/get/{id}",
    summary="Get feedback master by ID",
    description="Retrieves a single feedback master record by its MongoDB ObjectId."
)
async def get_feedback_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get a feedback master record by ID.

    This endpoint retrieves a specific feedback master record with all
    its details including name, description, and status.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the feedback master

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback Master fetched successfully"
    - `data`: Feedback master object

    **Error Responses:**
    - 400: Invalid ID format
    - 403: Permission denied (READ permission required)
    - 404: Feedback master not found
    - 500: Internal server error
    """
    try:


        doc = await get_feedback_master_by_id(db, id)
        if not doc:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME), "feedbackMasterId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=doc.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_feedback_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND
            )
        )


@router.get(
    "/get-by-name/{name}",
    summary="Get feedback master by name",
    description="Retrieves a single feedback master record by its unique name (case-insensitive)."
)
async def get_feedback_master_by_name_endpoint(
    name: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get a feedback master record by name.

    This endpoint retrieves a specific feedback master record by its unique name.
    The search is case-insensitive.

    **Path Parameters:**
    - `name` (required): Unique name of the feedback master

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback Master fetched successfully"
    - `data`: Feedback master object

    **Error Responses:**
    - 400: Name is empty or invalid
    - 403: Permission denied (READ permission required)
    - 404: Feedback master not found
    - 500: Internal server error
    """
    try:


        doc = await get_feedback_master_by_name(db, name)
        if not doc:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME), "feedbackMasterName": name},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=doc.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_feedback_master_by_name_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_GET_NOT_FOUND
            )
        )


@router.patch(
    "/update/{id}",
    summary="Update a feedback master",
    description="Partially updates an existing feedback master record with the provided fields."
)
async def update_feedback_master_endpoint(
    id: str,
    patch: FeedbackMasterUpdateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Update an existing feedback master record.

    This endpoint uses PATCH semantics - only provided fields are updated.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the feedback master

    **Request Body (FeedbackMasterUpdateSchema):**
    All fields are optional:
    - `name`: New name for the feedback type
    - `description`: New description
    - `isActive`: New active status

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback Master updated successfully"
    - `data`: Updated feedback master object

    **Error Responses:**
    - 400: Validation error
    - 403: Permission denied (UPDATE permission required)
    - 404: Feedback master not found
    - 409: Duplicate name conflict
    - 500: Internal server error

    **Side Effects:**
    - Updates updatedAt, updatedBy, and updatedIp automatically
    - Logs transaction with FEEDBACK_MASTER_UPDATED code
    """
    try:


        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        updated = await update_feedback_master(db, id, patch, updated_ip=client_ip, updated_by=current_user.id)
        if not updated:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME), "feedbackMasterId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_NOT_FOUND
                )
            )

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.FEEDBACK_MASTER_UPDATED,
            json_values={
                "feedbackMasterId": id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=updated.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("update_feedback_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{id}",
    summary="Soft delete a feedback master",
    description="Performs a soft delete on a feedback master record by setting isDelete=True and isActive=False."
)
async def delete_feedback_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Soft delete a feedback master record.

    This endpoint performs a soft delete on a feedback master record.
    The record remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the feedback master

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback Master deleted successfully"

    **Error Responses:**
    - 400: Invalid ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Feedback master not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=True, isActive=False
    - Logs transaction with FEEDBACK_MASTER_DELETED code
    - Records deletedIp from request
    """
    try:


        # Get client IP using centralized helper
        deleted_ip = get_client_ip(request)
        ok = await delete_feedback_master(db, id, deleted_by=current_user.id, deleted_ip=deleted_ip)

        if not ok:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_DELETE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME), "feedbackMasterId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_MASTER_DELETE_NOT_FOUND
                )
            )

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.FEEDBACK_MASTER_DELETED,
            json_values={
                "feedbackMasterId": id,
                "deletedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_DELETE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_DELETE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("delete_feedback_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_DELETE_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{id}",
    summary="Restore a soft-deleted feedback master",
    description="Restores a soft-deleted feedback master record by setting isDelete=False and isActive=True."
)
async def restore_feedback_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted feedback master record.

    This endpoint restores a previously soft-deleted feedback master,
    making it active and visible in normal queries again.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the feedback master

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback Master restored successfully"
    - `data`: Restored feedback master object

    **Error Responses:**
    - 400: Invalid ID format or record not deleted
    - 403: Permission denied (UPDATE permission required)
    - 404: Feedback master not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=False, isActive=True
    - Logs transaction with FEEDBACK_MASTER_RESTORED code
    - Records restoredIp from request
    """
    try:


        # Get client IP using centralized helper
        client_ip = get_client_ip(request)

        restored = await restore_feedback_master(
            db, id,
            restored_by=current_user.id,
            restored_ip=client_ip,
            request=request
        )

        if not restored:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME), "feedbackMasterId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_NOT_FOUND
                )
            )

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.FEEDBACK_MASTER_RESTORED,
            json_values={
                "feedbackMasterId": id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=restored.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("restore_feedback_master_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_MASTER_UPDATE_FAILED
            )
        )


