"""
Prompt Execution Router
Provides API endpoints for Prompt Execution management
Routes: /api/v1/prompt-executions
- POST /create           -> create execution record
- DELETE /delete/{id}    -> soft delete
- PATCH /restore/{id}    -> restore deleted
- GET /get/{id}          -> get by ID
- GET /list              -> list with filters
- GET /dashboard         -> dashboard statistics & analytics
- GET /recent-calls      -> recent AI calls with filters
"""
import logging
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.prompt_execution_schema import (
    PromptExecutionCreateSchema,
    PromptExecutionResponseSchema,
    PromptExecutionListPaginatedResponse,
)
from app.api.v1.schemas.prompt_execution_dashboard_schema import (
    TimeRangeEnum,
    PromptExecutionDashboardResponse,
    RecentCallsResponse,
)
from app.api.v1.services.prompt_execution_service import (
    create_prompt_execution,
    soft_delete_prompt_execution,
    restore_prompt_execution,
    get_prompt_execution_by_id,
    list_prompt_executions,
)
from app.api.v1.services.prompt_execution_dashboard_service import get_dashboard_data, get_recent_calls_data
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/prompt-executions",
    tags=["prompt-executions"],
)

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.PROMPT_EXECUTIONS

# Module configuration
MODULE_PREFIX = ModulePrefixes.PROMPT_EXECUTIONS
ENTITY_NAME = "Prompt Execution"
ENTITY_NAME_PLURAL = "Prompt Executions"


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new prompt execution record",
    description="Creates a new prompt execution record to track AI prompt usage, token counts, costs, and execution metrics.",
)
async def create_prompt_execution_endpoint(
    execution: PromptExecutionCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new prompt execution record.

    This endpoint creates a record of an AI prompt execution, capturing all relevant
    metrics including token usage, costs, execution time, and the prompt/response content.

    Request Body (PromptExecutionCreateSchema):
    -------------------------------------------
    Required fields:
        - promptId (str): Reference to the prompt in prompt_master table. Must be a valid ObjectId.
        - userId (str): ID of the user who executed the prompt. Must be a valid ObjectId.

    Optional fields:
        - promptConstructionRecord (dict): Details of the prompt construction process.
        - finalPrompt (str): The final constructed prompt text sent to the LLM.
        - promptOutput (str): The output/response received from the LLM.
        - inputTokenCount (int): Number of input tokens used. Default: 0.
        - outputTokenCount (int): Number of output tokens generated. Default: 0.
        - cost (float): Execution cost in USD. Default: 0.0.
        - executionTime (float): Time taken for execution in seconds. Default: 0.0.
        - originalWorkId (str): Reference to original work for revision tracking.
        - revision (int): Revision number for iterative prompts. Default: 1.
        - feedbackId (str): Reference to associated feedback record.
        - llmModel (str): The LLM model used (e.g., "gpt-4", "claude-3").
        - useCase (str): The use case or prompt type category.
        - accuracy (float): Accuracy score if applicable (0-100).
        - status (str): Execution status (e.g., "success", "failed").

    Response:
    ---------
    Success (201 Created):
        {
            "success": true,
            "message": "Prompt Execution created successfully",
            "data": {
                "_id": "string",
                "promptId": "string",
                "userId": "string",
                "inputTokenCount": 0,
                "outputTokenCount": 0,
                "cost": 0.0,
                "executionTime": 0.0,
                "createdAt": "datetime",
                "createdBy": "string",
                "createdIp": "string",
                ...
            }
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid input data or validation error.
        - Error code: PROMPT_EXEC_CREATE_FAILED
    - 403 Forbidden: User lacks CREATE permission for prompt executions.
        - Error code: PE_PERMISSION_DENIED
    - 409 Conflict: Duplicate entry or constraint violation.
        - Error code: PROMPT_EXEC_CREATE_FAILED
    - 500 Internal Server Error: Unexpected server error.
        - Error code: PROMPT_EXEC_CREATE_FAILED

    Side Effects:
    -------------
    - Records client IP address in createdIp field.
    - Logs transaction with log code PROMPT_EXECUTION_CREATED on success.
    - Logs error to error_logs collection on failure.

    RBAC Permission Required:
    -------------------------
    - Job: PROMPT_EXECUTIONS
    - Action: CREATE
    """
    try:


        # Get client IP
        client_ip = get_client_ip(request)

        created = await create_prompt_execution(execution, current_user.id, created_ip=client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.PROMPT_EXECUTION_CREATED,
            json_values={
                "promptExecutionId": created.get("_id", ""),
                "promptId": created.get("promptId", ""),
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
                error_code=CentralizedErrorCodes.PROMPT_EXEC_CREATE_FAILED,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_EXEC_CREATE_FAILED
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_EXEC_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_EXEC_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_CREATE_FAILED
            )
        )


@router.delete(
    "/delete/{execution_id}",
    summary="Soft delete a prompt execution record",
    description="Marks a prompt execution record as deleted without permanently removing it from the database.",
)
async def delete_prompt_execution_endpoint(
    execution_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a prompt execution record.

    This endpoint performs a soft delete by setting the isDelete flag to True,
    preserving the record for audit purposes while hiding it from normal queries.

    Path Parameters:
    ----------------
    - execution_id (str, required): The unique identifier (ObjectId) of the prompt
      execution record to delete.

    Response:
    ---------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt Execution deleted successfully",
            "data": null
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid execution_id format or record already deleted.
        - Error code: PROMPT_EXEC_DELETE_FAILED
    - 403 Forbidden: User lacks DELETE permission for prompt executions.
        - Error code: PE_PERMISSION_DENIED
    - 404 Not Found: Prompt execution record not found.
        - Error code: PROMPT_EXEC_DELETE_NOT_FOUND
    - 500 Internal Server Error: Unexpected server error.
        - Error code: PROMPT_EXEC_DELETE_FAILED

    Side Effects:
    -------------
    - Sets isDelete=True on the record.
    - Records deletedAt timestamp.
    - Records deletedBy user ID.
    - Records deletedIp (client IP address).
    - Logs transaction with log code PROMPT_EXECUTION_DELETED on success.
    - Logs error to error_logs collection on failure.

    RBAC Permission Required:
    -------------------------
    - Job: PROMPT_EXECUTIONS
    - Action: DELETE
    """
    try:


        # Get client IP
        client_ip = get_client_ip(request)

        await soft_delete_prompt_execution(execution_id, current_user.id, deleted_ip=client_ip, request=request)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.PROMPT_EXECUTION_DELETED,
            json_values={
                "promptExecutionId": execution_id,
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
                error_code=CentralizedErrorCodes.PROMPT_EXEC_DELETE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_EXEC_DELETE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_DELETE_FAILED,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_EXEC_DELETE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_EXEC_DELETE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{execution_id}",
    summary="Restore a soft-deleted prompt execution record",
    description="Restores a previously soft-deleted prompt execution record by clearing the deletion flag.",
)
async def restore_prompt_execution_endpoint(
    execution_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted prompt execution record.

    This endpoint restores a previously soft-deleted prompt execution by setting
    the isDelete flag back to False, making the record visible in normal queries again.

    Path Parameters:
    ----------------
    - execution_id (str, required): The unique identifier (ObjectId) of the prompt
      execution record to restore.

    Response:
    ---------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt Execution restored successfully",
            "data": null
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid execution_id format or record not deleted.
        - Error code: PROMPT_EXEC_UPDATE_FAILED
    - 403 Forbidden: User lacks UPDATE permission for prompt executions.
        - Error code: PE_PERMISSION_DENIED
    - 404 Not Found: Prompt execution record not found.
        - Error code: PROMPT_EXEC_UPDATE_NOT_FOUND
    - 500 Internal Server Error: Unexpected server error.
        - Error code: PROMPT_EXEC_UPDATE_FAILED

    Side Effects:
    -------------
    - Sets isDelete=False on the record.
    - Records restoredAt timestamp (via updatedAt).
    - Records restoredBy user ID (via updatedBy).
    - Records restoredIp (client IP address via updatedIp).
    - Logs transaction with log code PROMPT_EXECUTION_RESTORED on success.
    - Logs error to error_logs collection on failure.

    RBAC Permission Required:
    -------------------------
    - Job: PROMPT_EXECUTIONS
    - Action: UPDATE (restore is considered an update operation)
    """
    try:


        # Get client IP
        client_ip = get_client_ip(request)

        await restore_prompt_execution(execution_id, current_user.id, restored_ip=client_ip, request=request)

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.PROMPT_EXECUTION_RESTORED,
            json_values={
                "promptExecutionId": execution_id,
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
                error_code=CentralizedErrorCodes.PROMPT_EXEC_UPDATE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_EXEC_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_EXEC_UPDATE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_EXEC_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_UPDATE_FAILED
            )
        )


@router.get(
    "/get/{execution_id}",
    summary="Get a prompt execution record by ID",
    description="Retrieves a single prompt execution record with all its details by its unique identifier.",
)
async def get_prompt_execution_endpoint(
    execution_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a prompt execution record by ID.

    This endpoint retrieves a single prompt execution record with all its details,
    including token usage, costs, execution time, and the full prompt/response content.

    Path Parameters:
    ----------------
    - execution_id (str, required): The unique identifier (ObjectId) of the prompt
      execution record to retrieve.

    Response:
    ---------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt Execution fetched successfully",
            "data": {
                "_id": "string",
                "promptId": "string",
                "userId": "string",
                "promptConstructionRecord": {},
                "finalPrompt": "string",
                "promptOutput": "string",
                "inputTokenCount": 0,
                "outputTokenCount": 0,
                "cost": 0.0,
                "executionTime": 0.0,
                "originalWorkId": "string",
                "revision": 1,
                "feedbackId": "string",
                "llmModel": "string",
                "useCase": "string",
                "accuracy": 0.0,
                "status": "string",
                "isDelete": false,
                "createdAt": "datetime",
                "createdBy": "string",
                "createdIp": "string",
                "updatedAt": "datetime",
                "updatedBy": "string"
            }
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid execution_id format.
        - Error code: PROMPT_EXEC_GET_NOT_FOUND
    - 403 Forbidden: User lacks READ permission for prompt executions.
        - Error code: PE_PERMISSION_DENIED
    - 404 Not Found: Prompt execution record not found.
        - Error code: PROMPT_EXEC_GET_NOT_FOUND
    - 500 Internal Server Error: Unexpected server error.
        - Error code: PROMPT_EXEC_GET_NOT_FOUND

    Side Effects:
    -------------
    - Logs error to error_logs collection on failure.

    RBAC Permission Required:
    -------------------------
    - Job: PROMPT_EXECUTIONS
    - Action: READ
    """
    try:


        execution = await get_prompt_execution_by_id(execution_id, request)

        if not execution:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_GET_NOT_FOUND,
                parameters={"errorMessage": f"{ENTITY_NAME} not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"{ENTITY_NAME} not found"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_EXEC_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=execution,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_GET_NOT_FOUND,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_EXEC_GET_NOT_FOUND
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_EXEC_GET_NOT_FOUND,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    response_model=PromptExecutionListPaginatedResponse,
    summary="List prompt execution records with filters",
    description="Retrieves a paginated list of prompt execution records with optional filtering capabilities.",
    responses={
        200: {
            "description": "List of prompt executions",
            "model": PromptExecutionListPaginatedResponse,
        },
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def list_prompt_executions_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    prompt_id: Optional[str] = Query(None, description="Filter by prompt ID"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    feedback_id: Optional[str] = Query(None, description="Filter by feedback ID"),
    original_work_id: Optional[str] = Query(None, description="Filter by original work ID"),
    min_cost: Optional[float] = Query(None, ge=0, description="Filter by minimum cost"),
    max_cost: Optional[float] = Query(None, ge=0, description="Filter by maximum cost"),
    min_execution_time: Optional[float] = Query(None, ge=0, description="Filter by minimum execution time"),
    max_execution_time: Optional[float] = Query(None, ge=0, description="Filter by maximum execution time"),
    from_date: Optional[datetime] = Query(None, description="Filter executions from this date"),
    to_date: Optional[datetime] = Query(None, description="Filter executions until this date"),
    page: int = Query(1, ge=1, description="Page number (1-indexed). Default: 1"),
    page_size: int = Query(5, ge=1, le=500, description="Number of records per page. Default: 5"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List prompt execution records with pagination and filters.

    This endpoint retrieves a paginated list of prompt execution records with
    various filtering options for searching and analyzing execution history.

    Query Parameters:
    -----------------
    Pagination:
        - page (int, optional): Page number (1-indexed). Default: 1. Min: 1.
        - page_size (int, optional): Number of records per page. Default: 5. Min: 1, Max: 500.

    Filters:
        - include_deleted (bool, optional): Include soft-deleted records. Default: false.
        - prompt_id (str, optional): Filter by prompt ID (ObjectId).
        - user_id (str, optional): Filter by user ID (ObjectId).
        - feedback_id (str, optional): Filter by feedback ID (ObjectId).
        - original_work_id (str, optional): Filter by original work ID (ObjectId).
        - min_cost (float, optional): Filter by minimum cost (>= 0).
        - max_cost (float, optional): Filter by maximum cost (>= 0).
        - min_execution_time (float, optional): Filter by minimum execution time in seconds (>= 0).
        - max_execution_time (float, optional): Filter by maximum execution time in seconds (>= 0).
        - from_date (datetime, optional): Filter executions from this date (ISO 8601 format).
        - to_date (datetime, optional): Filter executions until this date (ISO 8601 format).

    Response:
    ---------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt Execution list fetched successfully",
            "data": [
                {
                    "_id": "string",
                    "promptId": "string",
                    "userId": "string",
                    "inputTokenCount": 0,
                    "outputTokenCount": 0,
                    "cost": 0.0,
                    "executionTime": 0.0,
                    "llmModel": "string",
                    "useCase": "string",
                    "status": "string",
                    "createdAt": "datetime",
                    ...
                }
            ],
            "pagination": {
                "page": 1,
                "pageSize": 5,
                "total": 100,
                "totalPages": 20
            }
        }

    Error Responses:
    ----------------
    - 403 Forbidden: User lacks READ permission for prompt executions.
        - Error code: PE_PERMISSION_DENIED
    - 500 Internal Server Error: Unexpected server error.
        - Error code: PROMPT_EXEC_LIST_FAILED

    Side Effects:
    -------------
    - Logs error to error_logs collection on failure.

    RBAC Permission Required:
    -------------------------
    - Job: PROMPT_EXECUTIONS
    - Action: READ
    """
    try:


        executions_list, total = await list_prompt_executions(
            include_deleted=include_deleted,
            prompt_id=prompt_id,
            user_id=user_id,
            feedback_id=feedback_id,
            original_work_id=original_work_id,
            min_cost=min_cost,
            max_cost=max_cost,
            min_execution_time=min_execution_time,
            max_execution_time=max_execution_time,
            from_date=from_date,
            to_date=to_date,
            page=page,
            page_size=page_size
        )

        # Always return paginated response
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=executions_list,
                total=total,
                page=page,
                page_size=page_size,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_EXEC_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_EXEC_LIST_FAILED
            )
        )


# ============================================================================
# Dashboard Endpoint
# ============================================================================

@router.get(
    "/dashboard",
    response_model=PromptExecutionDashboardResponse,
    summary="Get prompt execution dashboard analytics",
    description="Retrieves comprehensive dashboard analytics including statistics, trends, performance metrics, and paginated list for AI prompt executions.",
    responses={
        200: {
            "description": "Dashboard data with statistics, trends, and list",
            "model": PromptExecutionDashboardResponse,
        },
        400: {"description": "Bad request (invalid time range)"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def get_prompt_executions_dashboard(
    request: Request,
    timeRange: TimeRangeEnum = Query(
        TimeRangeEnum.HOUR_24,
        description="Time range for dashboard data: 1h, 24h, 7d, 30d, or custom"
    ),
    fromDate: Optional[datetime] = Query(
        None,
        description="Start date (required if timeRange=custom)"
    ),
    toDate: Optional[datetime] = Query(
        None,
        description="End date (required if timeRange=custom)"
    ),
    llmModel: Optional[str] = Query(
        None,
        description="Filter by LLM model (e.g., gpt-4, claude, gemini)"
    ),
    useCase: Optional[str] = Query(
        None,
        description="Filter by use case / prompt type"
    ),
    minAccuracy: Optional[float] = Query(
        None,
        ge=0,
        le=100,
        description="Filter by minimum accuracy (0-100)"
    ),
    maxAccuracy: Optional[float] = Query(
        None,
        ge=0,
        le=100,
        description="Filter by maximum accuracy (0-100)"
    ),
    personnelId: Optional[str] = Query(
        None,
        description="Filter by personnel/user ID"
    ),
    moduleId: Optional[str] = Query(
        None,
        description="Filter by module ID"
    ),
    search: Optional[str] = Query(
        None,
        description="Search text (searches in prompt name, user name)"
    ),
    page: int = Query(
        1,
        ge=1,
        description="Page number for list (starts from 1)"
    ),
    pageSize: int = Query(
        10,
        ge=1,
        le=100,
        description="Number of items per page for list (default: 10, max: 100)"
    ),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get AI prompts execution dashboard with statistics, trends, list, and analytics.

    This endpoint provides comprehensive analytics and metrics for AI prompt executions,
    enabling monitoring of usage patterns, costs, performance, and trends. All filters
    affect stats, trends, and the list section.

    Query Parameters:
    -----------------
    Time Range:
        - timeRange (TimeRangeEnum, optional): Time range for data. Default: "24h".
            - "1h": Last 1 hour
            - "24h": Last 24 hours (default)
            - "7d": Last 7 days
            - "30d": Last 30 days
            - "custom": Custom range (requires fromDate and toDate)
        - fromDate (datetime, optional): Start date for custom range (ISO 8601 format).
        - toDate (datetime, optional): End date for custom range (ISO 8601 format).

    Filters:
        - llmModel (str, optional): Filter by LLM model name (e.g., "gpt-4", "claude-3", "gemini").
        - useCase (str, optional): Filter by use case or prompt type category.
        - minAccuracy (float, optional): Filter by minimum accuracy score (0-100).
        - maxAccuracy (float, optional): Filter by maximum accuracy score (0-100).
        - personnelId (str, optional): Filter by personnel/user ID.
        - moduleId (str, optional): Filter by module ID.
        - search (str, optional): Search text (searches in prompt name, user name).

    Pagination (for list):
        - page (int, optional): Page number (1-indexed). Default: 1.
        - pageSize (int, optional): Items per page. Default: 10. Max: 100.

    Response:
    ---------
    Success (200 OK):
        {
            "success": true,
            "message": "Dashboard data retrieved successfully",
            "data": {
                "summary": { ... },
                "byModel": [ ... ],
                "byUseCase": [ ... ],
                "trends": [ ... ],
                "modelPerformance": [ ... ],
                "costByModel": [ ... ],
                "list": [ ... ],
                "pagination": {
                    "page": 1,
                    "pageSize": 10,
                    "totalCount": 100,
                    "totalPages": 10
                }
            }
        }

    RBAC Permission Required:
    -------------------------
    - Job: PROMPT_EXECUTIONS
    - Action: READ
    """
    try:


        # Validate custom time range
        if timeRange == TimeRangeEnum.CUSTOM:
            if not fromDate or not toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate and toDate are required when timeRange is 'custom'",
                        error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.VALIDATION)
                    )
                )
            if fromDate > toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate must be before toDate",
                        error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.VALIDATION)
                    )
                )

        # Get dashboard data
        dashboard_data = await get_dashboard_data(
            db=db,
            time_range=timeRange,
            from_date=fromDate,
            to_date=toDate,
            llm_model=llmModel,
            use_case=useCase,
            min_accuracy=minAccuracy,
            max_accuracy=maxAccuracy,
            personnel_id=personnelId,
            module_id=moduleId,
            search=search,
            page=page,
            page_size=pageSize,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=dashboard_data.model_dump(mode="json"),
                message="Dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.VALIDATION)
            )
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=str(e.detail),
                error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.READ),
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_prompt_executions_dashboard failed")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.INTERNAL)
            )
        )


# =============================================================================
# GET /recent-calls - Get Recent AI Calls
# =============================================================================
@router.get(
    "/recent-calls",
    response_model=RecentCallsResponse,
    summary="Get recent AI prompt execution calls",
    description="Retrieves a paginated list of recent AI prompt execution calls with filtering and detailed execution information.",
    responses={
        200: {
            "description": "Recent calls data retrieved successfully",
            "model": RecentCallsResponse,
        },
        400: {"description": "Bad request (invalid time range)"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def get_recent_calls(
    request: Request,
    timeRange: TimeRangeEnum = Query(
        TimeRangeEnum.HOUR_24,
        description="Time range for recent calls: 1h, 24h, 7d, 30d, or custom"
    ),
    fromDate: Optional[datetime] = Query(
        None,
        description="Start date (required if timeRange=custom)"
    ),
    toDate: Optional[datetime] = Query(
        None,
        description="End date (required if timeRange=custom)"
    ),
    llmModel: Optional[str] = Query(
        None,
        description="Filter by LLM model (e.g., gpt-4, claude, gemini)"
    ),
    useCase: Optional[str] = Query(
        None,
        description="Filter by use case / prompt type"
    ),
    page: int = Query(
        1,
        ge=1,
        description="Page number (starts from 1)"
    ),
    pageSize: int = Query(
        5,
        ge=1,
        le=100,
        description="Number of items per page (default: 5, max: 100)"
    ),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get recent AI prompt execution calls with filters.

    This endpoint retrieves a paginated list of the most recent AI prompt execution
    calls, providing detailed information about each execution for monitoring and debugging.

    Query Parameters:
    -----------------
    Time Range:
        - timeRange (TimeRangeEnum, optional): Time range for data. Default: "24h".
            - "1h": Last 1 hour
            - "24h": Last 24 hours (default)
            - "7d": Last 7 days
            - "30d": Last 30 days
            - "custom": Custom range (requires fromDate and toDate)
        - fromDate (datetime, optional): Start date for custom range (ISO 8601 format).
          Required if timeRange="custom".
        - toDate (datetime, optional): End date for custom range (ISO 8601 format).
          Required if timeRange="custom".

    Filters:
        - llmModel (str, optional): Filter by LLM model name (e.g., "gpt-4", "claude-3", "gemini").
        - useCase (str, optional): Filter by use case or prompt type category.

    Pagination:
        - page (int, optional): Page number (1-indexed). Default: 1. Min: 1.
        - pageSize (int, optional): Number of items per page. Default: 5. Min: 1, Max: 100.

    Response:
    ---------
    Success (200 OK):
        {
            "success": true,
            "message": "Recent calls retrieved successfully",
            "data": {
                "recentCalls": [
                    {
                        "id": "string",
                        "timestamp": "datetime",
                        "model": "gpt-4",
                        "useCase": "code-generation",
                        "promptName": "string",
                        "inputTokens": 500,
                        "outputTokens": 300,
                        "totalTokens": 800,
                        "cost": 0.05,
                        "responseTime": 1.25,
                        "status": "success",
                        "userId": "string"
                    }
                ],
                "totalCount": 100,
                "page": 1,
                "pageSize": 5,
                "totalPages": 20
            }
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid time range or missing required parameters for custom range.
        - Error code: PE_VALIDATION
    - 403 Forbidden: User lacks READ permission for prompt executions.
        - Error code: PE_PERMISSION_DENIED
    - 500 Internal Server Error: Unexpected server error.
        - Error code: PE_INTERNAL

    Side Effects:
    -------------
    - None (read-only operation).

    RBAC Permission Required:
    -------------------------
    - Job: PROMPT_EXECUTIONS
    - Action: READ

    Notes:
    ------
    - Results are sorted by timestamp in descending order (most recent first).
    - This endpoint is optimized for displaying recent activity in dashboards.
    - For comprehensive analytics, use the /dashboard endpoint instead.
    """
    try:


        # Validate custom time range
        if timeRange == TimeRangeEnum.CUSTOM:
            if not fromDate or not toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate and toDate are required when timeRange is 'custom'",
                        error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.VALIDATION)
                    )
                )
            if fromDate > toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate must be before toDate",
                        error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.VALIDATION)
                    )
                )

        # Get recent calls data
        recent_calls_data = await get_recent_calls_data(
            db=db,
            time_range=timeRange,
            from_date=fromDate,
            to_date=toDate,
            llm_model=llmModel,
            use_case=useCase,
            page=page,
            page_size=pageSize,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=recent_calls_data.model_dump(mode="json"),
                message="Recent calls retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.VALIDATION)
            )
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=str(e.detail),
                error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.READ),
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_recent_calls failed")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.INTERNAL)
            )
        )
