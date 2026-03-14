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
from app.schemas.auth_schema import TokenDataSchema
from app.schemas.prompt_execution_schema import (
    PromptExecutionCreateSchema,
    PromptExecutionResponseSchema,
    PromptExecutionListPaginatedResponse,
)
from app.schemas.prompt_execution_dashboard_schema import (
    TimeRangeEnum,
    PromptExecutionDashboardResponse,
    RecentCallsResponse,
)
from app.services.prompt_execution_service import (
    create_prompt_execution,
    soft_delete_prompt_execution,
    restore_prompt_execution,
    get_prompt_execution_by_id,
    list_prompt_executions,
)
from app.services.prompt_execution_dashboard_service import get_dashboard_data, get_recent_calls_data
from app.utils.dependencies import get_current_user
from app.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes, ModulePrefixes
from app.constants.collections import Collections
from bson import ObjectId

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/prompt-executions", tags=["prompt-executions"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.PROMPT_EXECUTIONS

# Module configuration
MODULE_PREFIX = ModulePrefixes.PROMPT_EXECUTIONS
ENTITY_NAME = "Prompt Execution"
ENTITY_NAME_PLURAL = "Prompt Executions"


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_prompt_execution_endpoint(
    execution: PromptExecutionCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """
    Create a new prompt execution entry

    - **promptId**: Reference to prompt in prompt_master table (required)
    - **userId**: User who executed the prompt (optional - defaults to current user from token)
    - **promptConstructionRecord**: Prompt construction process (optional)
    - **finalPrompt**: Final prompt text (optional)
    - **promptOutput**: Output from execution (optional)
    - **inputTokenCount**: Number of input tokens (optional)
    - **outputTokenCount**: Number of output tokens (optional)
    - **cost**: Execution cost (optional)
    - **executionTime**: Time in seconds (optional)
    - **originalWorkId**: Original work reference for revisions (optional)
    - **revision**: Revision number (optional)
    - **feedbackId**: Feedback reference (optional)
    """
    try:
        
        # If userId is not provided, use current user from token
        if not execution.userId:
            execution.userId = str(current_user.id)
        else:
            # If userId is provided, validate it exists in personnel_master
            user_exists = await db[Collections.PERSONNEL_MASTER].find_one(
                {"_id": ObjectId(execution.userId), "isDelete": False}
            )
            if not user_exists:
                return JSONResponse(
                    status_code=status.HTTP_404_NOT_FOUND,
                    content=ResponseBuilder.not_found(
                        message=f"User with ID {execution.userId} not found in personnel master",
                        error_code=_error_code(ErrorCodes.NOT_FOUND)
                    )
                )

        created = await create_prompt_execution(execution, current_user.id)
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=created,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_409_CONFLICT:
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=str(e.detail),
                    error_code=_error_code(ErrorCodes.ALREADY_EXISTS)
                )
            )
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


@router.delete("/delete/{execution_id}")
async def delete_prompt_execution_endpoint(
    execution_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a prompt execution

    - **execution_id**: ID of the execution to delete (path parameter)
    - Sets isDelete=True
    """
    try:
    

        await soft_delete_prompt_execution(execution_id, current_user.id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_404_NOT_FOUND:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=str(e.detail),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=str(e.detail),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.DELETE)
            )
        )


@router.patch("/restore/{execution_id}")
async def restore_prompt_execution_endpoint(
    execution_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted prompt execution

    - **execution_id**: ID of the execution to restore (path parameter)
    - Sets isDelete=False
    """
    try:
        

        await restore_prompt_execution(execution_id, current_user.id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_404_NOT_FOUND:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=str(e.detail),
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=str(e.detail),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.RESTORE)
            )
        )


@router.get("/get/{execution_id}")
async def get_prompt_execution_endpoint(
    execution_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a prompt execution by ID

    - **execution_id**: ID of the execution to retrieve (path parameter)
    """
    try:
       

        execution = await get_prompt_execution_by_id(execution_id)

        if not execution:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=f"{ENTITY_NAME} not found",
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
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
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=str(e.detail),
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.READ)
            )
        )


@router.get(
    "/list",
    response_model=PromptExecutionListPaginatedResponse,
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
    List all prompt executions with pagination and filters.

    Default pagination: page=1, page_size=5
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
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.LIST)
            )
        )


# ============================================================================
# Dashboard Endpoint
# ============================================================================

@router.get(
    "/dashboard",
    response_model=PromptExecutionDashboardResponse,
    responses={
        200: {
            "description": "Dashboard data with statistics and analytics",
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
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get AI prompts execution dashboard with statistics, trends, and analytics.

    **Time Range Options:**
    - `1h`: Last 1 hour
    - `24h`: Last 24 hours (default)
    - `7d`: Last 7 days
    - `30d`: Last 30 days
    - `custom`: Custom range (requires fromDate and toDate)

    **Response includes:**
    - `summary`: Total calls, tokens, cost, avg response time, unique users
    - `byModel`: Statistics grouped by LLM model (GPT-4, Claude, Gemini, etc.)
    - `byUseCase`: Statistics grouped by use case / prompt type
    - `trends`: Hourly trend data for token usage
    - `modelPerformance`: Performance comparison across models
    - `costByModel`: Cost breakdown by model with percentages

    **Note:** Recent calls have been moved to a separate endpoint: `/recent-calls`
    """
    try:

        # Validate custom time range
        if timeRange == TimeRangeEnum.CUSTOM:
            if not fromDate or not toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate and toDate are required when timeRange is 'custom'",
                        error_code=_error_code(ErrorCodes.VALIDATION)
                    )
                )
            if fromDate > toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate must be before toDate",
                        error_code=_error_code(ErrorCodes.VALIDATION)
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
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=str(e.detail),
                error_code=_error_code(ErrorCodes.READ),
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_prompt_executions_dashboard failed")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.INTERNAL)
            )
        )


# =============================================================================
# GET /recent-calls - Get Recent AI Calls
# =============================================================================
@router.get(
    "/recent-calls",
    response_model=RecentCallsResponse,
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
    Get recent AI prompt executions with filters.

    **Time Range Options:**
    - `1h`: Last 1 hour
    - `24h`: Last 24 hours (default)
    - `7d`: Last 7 days
    - `30d`: Last 30 days
    - `custom`: Custom range (requires fromDate and toDate)

    **Pagination:**
    - `page`: Page number (default: 1)
    - `pageSize`: Items per page (default: 5, max: 100)

    **Response includes:**
    - `recentCalls`: List of recent AI calls with execution details
    - `totalCount`: Total number of calls matching the filters
    - `page`: Current page number
    - `pageSize`: Number of items per page
    - `totalPages`: Total number of pages

    **Each call includes:**
    - Execution ID, timestamp, model, use case, prompt name
    - Token usage (input, output, total)
    - Cost and response time
    - Status and user ID
    """
    try:

        # Validate custom time range
        if timeRange == TimeRangeEnum.CUSTOM:
            if not fromDate or not toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate and toDate are required when timeRange is 'custom'",
                        error_code=_error_code(ErrorCodes.VALIDATION)
                    )
                )
            if fromDate > toDate:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message="fromDate must be before toDate",
                        error_code=_error_code(ErrorCodes.VALIDATION)
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
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=str(e.detail),
                error_code=_error_code(ErrorCodes.READ),
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_recent_calls failed")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.INTERNAL)
            )
        )
