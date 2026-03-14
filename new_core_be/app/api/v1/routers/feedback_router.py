"""
Feedback API (v1).

Only supports: Create, Get, List, Delete
NO Update, NO Restore
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.feedback_schema import (
    FeedbackCreateSchema,
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.api.v1.services.feedback_service import (
    create_feedback,
    get_feedback_by_id,
    delete_feedback,
    list_feedbacks,
)
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/feedbacks", tags=["feedbacks"])

# Job name for RBAC permission checks
JOB_NAME = Jobs.FEEDBACKS

# Module configuration
MODULE_PREFIX = ModulePrefixes.FEEDBACKS
ENTITY_NAME = "Feedback"
ENTITY_NAME_PLURAL = "Feedbacks"


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new feedback",
    description="Creates a new feedback record to capture user feedback on the system."
)
async def create_feedback_endpoint(
    payload: FeedbackCreateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Create a new feedback record.

    This endpoint creates a feedback entry that captures user feedback,
    comments, or suggestions about the system.

    **Request Body (FeedbackCreateSchema):**
    - `feedbackMasterId` (required): FK to feedback_master collection
    - `content` (required): Feedback text content
    - `rating` (optional): Numeric rating value
    - `metadata` (optional): Additional metadata

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Feedback created successfully"
    - `data`: Created feedback object

    **Error Responses:**
    - 400: Validation error or user ID not found
    - 403: Permission denied (CREATE permission required)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with FEEDBACK_CREATED code
    - Records createdIp from request

    **Note:** This router only supports Create, Get, List, Delete operations.
    There is no Update or Restore for feedback records.
    """
    try:


        if not current_user.id:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_CREATE_FAILED,
                parameters={"errorMessage": ErrorMessages.USER_ID_NOT_FOUND},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.USER_ID_NOT_FOUND
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_CREATE_FAILED
                )
            )

        # Get client IP using centralized helper
        created_ip = get_client_ip(request)

        created = await create_feedback(
            db, payload,
            created_by=current_user.id,
            created_ip=created_ip
        )

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.FEEDBACK_CREATED,
            json_values={
                "feedbackId": str(created.id) if hasattr(created, 'id') else "",
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
            error_code=CentralizedErrorCodes.FEEDBACK_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else e.detail.get("message", str(e.detail))},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("create_feedback_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_CREATE_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all feedbacks",
    description="Retrieves all feedback records with optional pagination and filters."
)
async def list_feedbacks_endpoint(
    request: Request,
    feedbackMasterId: Optional[str] = Query(None, description="Filter by FeedbackMaster ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    is_active: Optional[bool] = Query(True, description="Filter by active status (true=active only, false=inactive only, null=all)"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    pageSize: Optional[int] = Query(None, ge=1, le=200, description="Number of records per page."),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    List all feedbacks with optional pagination and filters.

    This endpoint retrieves feedback records with support for
    filtering by feedback master type and active status.

    **Query Parameters:**
    - `feedbackMasterId` (optional): Filter by FeedbackMaster ID
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `is_active` (optional): Filter by active status (default: true)
    - `page` (optional): Page number starting from 1
    - `pageSize` (optional): Items per page (1-200, default: 20)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback list fetched successfully"
    - `data`: Array of feedback objects
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:


        data, total = await list_feedbacks(
            db=db,
            feedback_master_id=feedbackMasterId,
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
            error_code=CentralizedErrorCodes.FEEDBACK_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("list_feedbacks_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_LIST_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_LIST_FAILED
            )
        )


@router.get(
    "/get/{id}",
    summary="Get feedback by ID",
    description="Retrieves a single feedback record by its MongoDB ObjectId."
)
async def get_feedback_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get a feedback record by ID.

    This endpoint retrieves a specific feedback record with all
    its details including content, rating, and metadata.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the feedback

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback fetched successfully"
    - `data`: Feedback object

    **Error Responses:**
    - 400: Invalid ID format
    - 403: Permission denied (READ permission required)
    - 404: Feedback not found
    - 500: Internal server error
    """
    try:


        doc = await get_feedback_by_id(db, id)
        if not doc:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_GET_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME), "feedbackId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_GET_NOT_FOUND
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
            error_code=CentralizedErrorCodes.FEEDBACK_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_feedback_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_GET_NOT_FOUND,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_GET_NOT_FOUND
            )
        )


@router.delete(
    "/delete/{id}",
    summary="Soft delete a feedback",
    description="Performs a soft delete on a feedback record by setting isDelete=True."
)
async def delete_feedback_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Soft delete a feedback record.

    This endpoint performs a soft delete on a feedback record.
    The record remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the feedback

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Feedback deleted successfully"

    **Error Responses:**
    - 400: Invalid ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Feedback not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=True
    - Logs transaction with FEEDBACK_DELETED code
    - Records deletedIp from request

    **Note:** Deleted feedback records cannot be restored. This is a
    permanent soft delete operation.
    """
    try:


        # Get client IP using centralized helper
        deleted_ip = get_client_ip(request)
        ok = await delete_feedback(db, id, deleted_by=current_user.id, deleted_ip=deleted_ip)

        if not ok:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.FEEDBACK_DELETE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME), "feedbackId": id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.FEEDBACK_DELETE_NOT_FOUND
                )
            )

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.FEEDBACK_DELETED,
            json_values={
                "feedbackId": id,
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
            error_code=CentralizedErrorCodes.FEEDBACK_DELETE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_DELETE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("delete_feedback_endpoint failed")
        error_log = await log_error_with_exception(
            request=request,
            error_code=CentralizedErrorCodes.FEEDBACK_DELETE_FAILED,
            parameters={"errorMessage": str(exc)},
            exception=exc,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.FEEDBACK_DELETE_FAILED
            )
        )
