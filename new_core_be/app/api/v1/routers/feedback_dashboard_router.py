"""
Feedback Dashboard Router
Comprehensive feedback monitoring and analytics endpoints.

Routes: /api/v1/feedback-dashboard
- GET /                           -> Combined stats, trend, and list
- GET /top-negative               -> Top 10 negative feedback issues
- GET /negative-reports/{id}      -> Detailed reports for specific issue
"""
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Path, Request, status
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.feedback_dashboard_schema import (
    FeedbackTimeRangeEnum,
    FeedbackGranularityEnum,
    FeedbackDashboardResponse,
    TopNegativeResponse,
    NegativeReportsResponse,
)
from app.api.v1.services.feedback_dashboard_service import (
    get_feedback_dashboard,
    get_top_negative_feedback,
    get_negative_reports_detail,
)
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, PermissionMessages
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/feedback-dashboard",
    tags=["feedback-dashboard"],
)

# Job name for RBAC permission checks
JOB_NAME = Jobs.FEEDBACKS
MODULE_PREFIX = "FEEDBACK_DASHBOARD"
ENTITY_NAME = "Feedback Dashboard"


# =============================================================================
# Helper function for time range validation
# =============================================================================

def validate_custom_time_range(
    time_range: FeedbackTimeRangeEnum,
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Optional[JSONResponse]:
    """Validate custom time range parameters. Returns error response if invalid, None if valid."""
    if time_range == FeedbackTimeRangeEnum.CUSTOM:
        if not start_date or not end_date:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message="startDate and endDate are required when timeRange is 'custom'",
                    error_code=f"{MODULE_PREFIX}_VALIDATION"
                )
            )
        if start_date > end_date:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message="startDate must be before endDate",
                    error_code=f"{MODULE_PREFIX}_VALIDATION"
                )
            )
    return None


# =============================================================================
# 1. Combined Dashboard API
# =============================================================================

@router.get(
    "",
    summary="Get feedback dashboard data",
    description="""
    Get combined feedback dashboard data including:
    - Overall statistics (total, liked, disliked counts)
    - Stats breakdown by component type
    - Stats breakdown by module
    - Trend data for graphs (configurable granularity)
    - Recent feedback list with personnel details (paginated)

    **Filters:**
    - timeRange: Predefined time range (today, 7d, 30d, this_month, last_month, custom)
    - granularity: Graph data grouping (hourly, daily, weekly, monthly)
    - componentType: Filter by screen, prompt, api, or function
    - moduleId: Filter by specific module
    - feedbackMasterId: Filter by specific feedback master
    - createdBy: Filter by personnel who gave feedback
    - unitId: Filter by personnel's unit
    - state: Filter by feedback state (submitted, resolved, etc.)
    - startDate/endDate: Custom date range (required when timeRange=custom)
    """,
    responses={
        200: {"description": "Dashboard data retrieved successfully"},
        400: {"description": "Invalid parameters"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def feedback_dashboard(
    request: Request,
    timeRange: FeedbackTimeRangeEnum = Query(
        FeedbackTimeRangeEnum.LAST_30_DAYS,
        description="Time range for filtering data"
    ),
    granularity: FeedbackGranularityEnum = Query(
        FeedbackGranularityEnum.DAILY,
        description="Granularity for trend data (hourly, daily, weekly, monthly)"
    ),
    componentType: Optional[str] = Query(
        None,
        description="Filter by component type (screen, prompt, api, function)"
    ),
    moduleId: Optional[str] = Query(
        None,
        description="Filter by module ID"
    ),
    feedbackMasterId: Optional[str] = Query(
        None,
        description="Filter by feedback master ID"
    ),
    createdBy: Optional[str] = Query(
        None,
        description="Filter by personnel ID who gave feedback"
    ),
    unitId: Optional[str] = Query(
        None,
        description="Filter by unit ID (filters all personnel in that unit)"
    ),
    state: Optional[str] = Query(
        None,
        description="Filter by feedback state (submitted, acknowledged, resolved, etc.)"
    ),
    startDate: Optional[datetime] = Query(
        None,
        description="Start date for custom time range (required when timeRange=custom)"
    ),
    endDate: Optional[datetime] = Query(
        None,
        description="End date for custom time range (required when timeRange=custom)"
    ),
    page: int = Query(1, ge=1, description="Page number for feedback list"),
    pageSize: int = Query(20, ge=1, le=100, description="Page size for feedback list"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get combined feedback dashboard data.
    """
    try:
        

        # Validate custom time range
        validation_error = validate_custom_time_range(timeRange, startDate, endDate)
        if validation_error:
            return validation_error

        # Get dashboard data
        data = await get_feedback_dashboard(
            db=db,
            time_range=timeRange,
            granularity=granularity,
            component_type=componentType,
            module_id=moduleId,
            feedback_master_id=feedbackMasterId,
            created_by=createdBy,
            unit_id=unitId,
            state=state,
            start_date=startDate,
            end_date=endDate,
            page=page,
            page_size=pageSize,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Feedback dashboard data retrieved successfully"
            )
        )

    except Exception as exc:
        logger.exception("feedback_dashboard failed")
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


# =============================================================================
# 2. Top Negative Feedback API
# =============================================================================

@router.get(
    "/top-negative",
    summary="Get top negative feedback issues",
    description="""
    Get top 10 negative feedback issues grouped by feedbackMaster.

    **Negative criteria:** isLiked=false OR rating < 2.5

    **Response includes:**
    - feedbackMasterName (e.g., "AI Case Summary", "CDR Analysis")
    - componentType (screen, prompt, api, function)
    - moduleId and moduleName
    - totalReports (count of negative feedback)
    - severity (CRITICAL, HIGH, MEDIUM, LOW based on count)
    - averageRating

    **Filters:**
    - Same filters as main dashboard
    - limit: Number of top items to return (default 10)
    - ratingThreshold: Rating below which is considered negative (default 2.5)
    """,
    responses={
        200: {"description": "Top negative feedback retrieved successfully"},
        400: {"description": "Invalid parameters"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def top_negative_feedback(
    request: Request,
    timeRange: FeedbackTimeRangeEnum = Query(
        FeedbackTimeRangeEnum.LAST_30_DAYS,
        description="Time range for filtering data"
    ),
    componentType: Optional[str] = Query(
        None,
        description="Filter by component type (screen, prompt, api, function)"
    ),
    moduleId: Optional[str] = Query(
        None,
        description="Filter by module ID"
    ),
    unitId: Optional[str] = Query(
        None,
        description="Filter by unit ID (filters all personnel in that unit)"
    ),
    startDate: Optional[datetime] = Query(
        None,
        description="Start date for custom time range"
    ),
    endDate: Optional[datetime] = Query(
        None,
        description="End date for custom time range"
    ),
    limit: int = Query(10, ge=1, le=50, description="Number of top items to return"),
    ratingThreshold: float = Query(2.5, ge=0, le=5, description="Rating threshold for negative feedback"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get top negative feedback issues grouped by feedback master.
    """
    try:


        # Validate custom time range
        validation_error = validate_custom_time_range(timeRange, startDate, endDate)
        if validation_error:
            return validation_error

        # Get top negative feedback
        data = await get_top_negative_feedback(
            db=db,
            time_range=timeRange,
            component_type=componentType,
            module_id=moduleId,
            unit_id=unitId,
            start_date=startDate,
            end_date=endDate,
            limit=limit,
            rating_threshold=ratingThreshold,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Top negative feedback retrieved successfully"
            )
        )

    except Exception as exc:
        logger.exception("top_negative_feedback failed")
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


# =============================================================================
# 3. Negative Reports Detail API
# =============================================================================

@router.get(
    "/negative-reports/{feedbackMasterId}",
    summary="Get detailed negative reports for a specific issue",
    description="""
    Get detailed negative feedback reports for a specific feedbackMaster.

    **Returns full details including:**
    - Personnel info (name, rank, unit, district)
    - Feedback details (isLiked, rating, comment, quickFeedback)
    - userFeedback structure (screen/prompt/api/function specific data)
    - Timestamps

    **Use this when clicking "View Reports" on the top negative issues list.**
    """,
    responses={
        200: {"description": "Negative reports retrieved successfully"},
        400: {"description": "Invalid parameters"},
        403: {"description": "Permission denied"},
        404: {"description": "Feedback master not found"},
        500: {"description": "Internal server error"},
    },
)
async def negative_reports_detail(
    request: Request,
    feedbackMasterId: str = Path(..., description="Feedback master ID to get reports for"),
    timeRange: FeedbackTimeRangeEnum = Query(
        FeedbackTimeRangeEnum.LAST_30_DAYS,
        description="Time range for filtering data"
    ),
    startDate: Optional[datetime] = Query(
        None,
        description="Start date for custom time range"
    ),
    endDate: Optional[datetime] = Query(
        None,
        description="End date for custom time range"
    ),
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=100, description="Page size"),
    ratingThreshold: float = Query(2.5, ge=0, le=5, description="Rating threshold for negative feedback"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get detailed negative reports for a specific feedback master.
    """
    try:


        # Validate custom time range
        validation_error = validate_custom_time_range(timeRange, startDate, endDate)
        if validation_error:
            return validation_error

        # Get detailed reports
        data = await get_negative_reports_detail(
            db=db,
            feedback_master_id=feedbackMasterId,
            time_range=timeRange,
            start_date=startDate,
            end_date=endDate,
            page=page,
            page_size=pageSize,
            rating_threshold=ratingThreshold,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Negative feedback reports retrieved successfully"
            )
        )

    except Exception as exc:
        logger.exception("negative_reports_detail failed")
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
