"""
Dashboard Router
Comprehensive dashboard endpoints for analytics and reporting.

Routes: /api/v1/dashboard
- GET /counts             -> Counts for all collections
- GET /overview           -> Quick stats with period comparison
- GET /user-activity      -> User engagement and top users
- GET /prompt-analytics   -> Prompt usage and effectiveness
- GET /cost-analytics     -> Cost breakdown and projections
- GET /performance        -> Response times and success rates
- GET /unit-usage         -> Usage by organizational unit
"""
import logging
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.dashboard_schema import (
    TimeRangeEnum,
    CountsDashboardResponse,
    OverviewDashboardResponse,
    UserActivityDashboardResponse,
    PromptAnalyticsDashboardResponse,
    CostAnalyticsDashboardResponse,
    PerformanceDashboardResponse,
    UnitDashboardResponse,
)
from app.api.v1.services.dashboard_service import (
    get_counts_dashboard,
    get_overview_dashboard,
    get_user_activity_dashboard,
    get_prompt_analytics_dashboard,
    get_cost_analytics_dashboard,
    get_performance_dashboard,
    get_unit_dashboard,
)
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, PermissionMessages, ErrorCodes, ModulePrefixes

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/dashboard",
    tags=["dashboard"],
)

# Job name for RBAC permission checks
JOB_NAME = Jobs.PROMPT_EXECUTIONS  # Reuse prompt executions permission
MODULE_PREFIX = "DASH"
ENTITY_NAME = "Dashboard"


# =============================================================================
# Helper function for time range validation
# =============================================================================

def validate_custom_time_range(
    time_range: TimeRangeEnum,
    from_date: Optional[datetime],
    to_date: Optional[datetime],
) -> Optional[JSONResponse]:
    """Validate custom time range parameters. Returns error response if invalid, None if valid."""
    if time_range == TimeRangeEnum.CUSTOM:
        if not from_date or not to_date:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message="fromDate and toDate are required when timeRange is 'custom'",
                    error_code=f"{MODULE_PREFIX}_VALIDATION"
                )
            )
        if from_date > to_date:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message="fromDate must be before toDate",
                    error_code=f"{MODULE_PREFIX}_VALIDATION"
                )
            )
    return None


# =============================================================================
# 0. Counts Dashboard
# =============================================================================

@router.get(
    "/counts",
    response_model=CountsDashboardResponse,
    summary="Get counts for all collections (filtered by user permissions)",
    description="Get counts for collections the user has READ permission for. Returns counts filtered by user's role permissions.",
    responses={
        200: {"description": "Counts data", "model": CountsDashboardResponse},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def counts_dashboard(
    request: Request,
    jobs: Optional[str] = Query(
        None,
        description="Comma-separated list of collection keys to get counts for (e.g., jobs=units,personnels,roles). Only returns counts for jobs the user has READ permission for."
    ),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get counts for all collections (filtered by user permissions).

    This endpoint returns the count of active records for each collection
    that the user has READ permission for based on their role.
    Counts are grouped into two categories: platform and application.

    - Master tables: Filtered by isDelete=false AND isActive=true
    - Transaction tables: Filtered by isDelete=false only
    - Only returns non-zero counts for jobs the user has READ permission for

    Query Parameters:
    -----------------
    - jobs (str, optional): Comma-separated list of collection keys to get counts for.
      Only returns counts for jobs the user has READ permission for.

      Platform collections: valueSets, logMaster, logTransactions, errorMaster, errorLogs,
        approvalFlowMaster, approvalChains, testMaster, testExecutions, prompts,
        promptExecutions, feedbackMaster, feedbacks

      Application collections: units, personnels, departments, districts, ranks, unitTypes,
        mandals, designations, unitVillages, roles, modules, jobs, permissions,
        permissionMappings, userMappings, userRolePermissions, moduleHierarchy, moduleJobMappings

    Response:
    ---------
    Success (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Counts retrieved successfully",
            "data": {
                "platform": {
                    "valueSets": {"count": 120, "isMenu": true, "route": "value-setss"},
                    "logMaster": {"count": 6, "isMenu": true, "route": "log-masters"},
                    "logTransactions": {"count": 10000, "isMenu": false, "route": "log-transactions"},
                    "errorMaster": {"count": 50, "isMenu": true, "route": "error-masters"},
                    "errorLogs": {"count": 500, "isMenu": false, "route": "error-logss"},
                    "approvalFlowMaster": {"count": 15, "isMenu": true, "route": "approval-flow-masters"},
                    "approvalChains": {"count": 45, "isMenu": false, "route": "approval-chains"},
                    "testMaster": {"count": 20, "isMenu": true, "route": "test-masters"},
                    "testExecutions": {"count": 1000, "isMenu": false, "route": "test-executions"},
                    "prompts": {"count": 50, "isMenu": true, "route": "prompt-tables"},
                    "promptExecutions": {"count": 5000, "isMenu": false, "route": "prompt-executionss"},
                    "feedbackMaster": {"count": 10, "isMenu": true, "route": "feedback-masters"},
                    "feedbacks": {"count": 250, "isMenu": false, "route": "feedbackss"}
                },
                "application": {
                    "units": {"count": 150, "isMenu": true, "route": "unitss"},
                    "personnels": {"count": 1200, "isMenu": true, "route": "personnelss"},
                    "departments": {"count": 25, "isMenu": true, "route": "departmentss"},
                    "districts": {"count": 13, "isMenu": true, "route": "districts"},
                    "ranks": {"count": 45, "isMenu": true, "route": "ranks"},
                    "unitTypes": {"count": 8, "isMenu": true, "route": "unit-types"},
                    "mandals": {"count": 670, "isMenu": true, "route": "mandalss"},
                    "designations": {"count": 40, "isMenu": true, "route": "designation-masters"},
                    "unitVillages": {"count": 5000, "isMenu": true, "route": "unit-villagess"},
                    "roles": {"count": 12, "isMenu": true, "route": "roless"},
                    "modules": {"count": 5, "isMenu": true, "route": "moduless"},
                    "jobs": {"count": 30, "isMenu": true, "route": "jobss"},
                    "permissions": {"count": 85, "isMenu": true, "route": "permissionss"},
                    "permissionMappings": {"count": 200, "isMenu": false, "route": "permission-mappingss"},
                    "userMappings": {"count": 150, "isMenu": false, "route": null},
                    "userRolePermissions": {"count": 300, "isMenu": false, "route": "user-role-permissionss"},
                    "moduleHierarchy": {"count": 25, "isMenu": false, "route": "module-hierarchys"},
                    "moduleJobMappings": {"count": 50, "isMenu": false, "route": "module-job-mappingss"}
                }
            }
        }

    Example Usage:
    --------------
    - Get all permitted counts: GET /api/v1/dashboard/counts
    - Get specific counts: GET /api/v1/dashboard/counts?jobs=units,personnels,roles
    """
    try:
        # RBAC check - need at least one READ permission to access this endpoint
        # has_permission = await check_job_permission(request, JOB_NAME, "READ")
        # if not has_permission:
        #     return JSONResponse(
        #         status_code=status.HTTP_403_FORBIDDEN,
        #         content=ResponseBuilder.forbidden(
        #             message=PermissionMessages.format(PermissionMessages.READ, "dashboard"),
        #             error_code=f"{MODULE_PREFIX}_PERMISSION_DENIED"
        #         )
        #     )

        # Parse jobs parameter if provided
        jobs_list: Optional[List[str]] = None
        if jobs:
            jobs_list = [j.strip() for j in jobs.split(",") if j.strip()]

        # Get user info from token for permission filtering
        user_id = current_user.id if hasattr(current_user, 'id') else str(current_user.sub) if hasattr(current_user, 'sub') else None
        role_id = current_user.roleId if hasattr(current_user, 'roleId') else None
        unit_id = current_user.unitId if hasattr(current_user, 'unitId') else None

        # Get counts filtered by user permissions
        data = await get_counts_dashboard(
            db=db,
            jobs=jobs_list,
            user_id=user_id,
            role_id=role_id,
            unit_id=unit_id,
            filter_by_permissions=True  # Enable permission-based filtering
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Counts retrieved successfully"
            )
        )

    except Exception as e:
        logger.exception("Error fetching counts dashboard")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(message=ErrorMessages.UNEXPECTED_ERROR, error_code=f"{MODULE_PREFIX}_INTERNAL")
        )


# =============================================================================
# 1. Overview Dashboard
# =============================================================================

@router.get(
    "/overview",
    response_model=OverviewDashboardResponse,
    summary="Get overview dashboard",
    description="Get quick statistics with current vs previous period comparison.",
    responses={
        200: {"description": "Overview dashboard data", "model": OverviewDashboardResponse},
        400: {"description": "Bad request"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def overview_dashboard(
    request: Request,
    timeRange: TimeRangeEnum = Query(
        TimeRangeEnum.LAST_7_DAYS,
        description="Time range: today, yesterday, 7d, 30d, this_month, last_month, custom"
    ),
    fromDate: Optional[datetime] = Query(None, description="Start date (required if timeRange=custom)"),
    toDate: Optional[datetime] = Query(None, description="End date (required if timeRange=custom)"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get overview dashboard with key metrics and period comparison.

    Returns:
    - Current period stats (executions, tokens, cost, users, response time, success rate)
    - Previous period stats for comparison
    - Percentage change for each metric
    - Top model, top prompt type, and peak usage hour
    """
    try:


        # Validate time range
        validation_error = validate_custom_time_range(timeRange, fromDate, toDate)
        if validation_error:
            return validation_error

        data = await get_overview_dashboard(db, timeRange, fromDate, toDate)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Overview dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(message=str(e), error_code=f"{MODULE_PREFIX}_VALIDATION")
        )
    except Exception as e:
        logger.exception("Error fetching overview dashboard")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(message=ErrorMessages.UNEXPECTED_ERROR, error_code=f"{MODULE_PREFIX}_INTERNAL")
        )


# =============================================================================
# 2. User Activity Dashboard
# =============================================================================

@router.get(
    "/user-activity",
    response_model=UserActivityDashboardResponse,
    summary="Get user activity dashboard",
    description="Get user engagement metrics, top users, and activity trends.",
    responses={
        200: {"description": "User activity dashboard data", "model": UserActivityDashboardResponse},
        400: {"description": "Bad request"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def user_activity_dashboard(
    request: Request,
    timeRange: TimeRangeEnum = Query(TimeRangeEnum.LAST_7_DAYS, description="Time range"),
    fromDate: Optional[datetime] = Query(None, description="Start date (required if timeRange=custom)"),
    toDate: Optional[datetime] = Query(None, description="End date (required if timeRange=custom)"),
    limit: int = Query(10, ge=1, le=50, description="Number of top users to return"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get user activity dashboard with engagement metrics.

    Returns:
    - Summary: total users, active users, new users, inactive users
    - Top users by prompt executions with usage details
    - Activity trend over time (daily)
    - Users grouped by unit
    """
    try:


        validation_error = validate_custom_time_range(timeRange, fromDate, toDate)
        if validation_error:
            return validation_error

        data = await get_user_activity_dashboard(db, timeRange, fromDate, toDate, limit)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="User activity dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(message=str(e), error_code=f"{MODULE_PREFIX}_VALIDATION")
        )
    except Exception as e:
        logger.exception("Error fetching user activity dashboard")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(message=ErrorMessages.UNEXPECTED_ERROR, error_code=f"{MODULE_PREFIX}_INTERNAL")
        )


# =============================================================================
# 3. Prompt Analytics Dashboard
# =============================================================================

@router.get(
    "/prompt-analytics",
    response_model=PromptAnalyticsDashboardResponse,
    summary="Get prompt analytics dashboard",
    description="Get prompt usage statistics, top prompts, and distribution by type.",
    responses={
        200: {"description": "Prompt analytics dashboard data", "model": PromptAnalyticsDashboardResponse},
        400: {"description": "Bad request"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def prompt_analytics_dashboard(
    request: Request,
    timeRange: TimeRangeEnum = Query(TimeRangeEnum.LAST_7_DAYS, description="Time range"),
    fromDate: Optional[datetime] = Query(None, description="Start date (required if timeRange=custom)"),
    toDate: Optional[datetime] = Query(None, description="End date (required if timeRange=custom)"),
    limit: int = Query(10, ge=1, le=50, description="Number of top prompts to return"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get prompt analytics dashboard with usage statistics.

    Returns:
    - Summary: total prompts, active prompts, total executions, avg executions per prompt
    - Top prompts by usage with effectiveness metrics
    - Distribution by prompt type
    - Unused prompts (prompts with no recent activity)
    """
    try:


        validation_error = validate_custom_time_range(timeRange, fromDate, toDate)
        if validation_error:
            return validation_error

        data = await get_prompt_analytics_dashboard(db, timeRange, fromDate, toDate, limit)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Prompt analytics dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(message=str(e), error_code=f"{MODULE_PREFIX}_VALIDATION")
        )
    except Exception as e:
        logger.exception("Error fetching prompt analytics dashboard")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(message=ErrorMessages.UNEXPECTED_ERROR, error_code=f"{MODULE_PREFIX}_INTERNAL")
        )


# =============================================================================
# 4. Cost Analytics Dashboard
# =============================================================================

@router.get(
    "/cost-analytics",
    response_model=CostAnalyticsDashboardResponse,
    summary="Get cost analytics dashboard",
    description="Get cost breakdown, projections, and analysis by model/user/prompt.",
    responses={
        200: {"description": "Cost analytics dashboard data", "model": CostAnalyticsDashboardResponse},
        400: {"description": "Bad request"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def cost_analytics_dashboard(
    request: Request,
    timeRange: TimeRangeEnum = Query(TimeRangeEnum.LAST_7_DAYS, description="Time range"),
    fromDate: Optional[datetime] = Query(None, description="Start date (required if timeRange=custom)"),
    toDate: Optional[datetime] = Query(None, description="End date (required if timeRange=custom)"),
    limit: int = Query(10, ge=1, le=50, description="Number of top items to return"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get cost analytics dashboard with financial metrics.

    Returns:
    - Summary: total cost, avg daily cost, projected monthly cost, cost change %
    - Daily cost breakdown
    - Cost by LLM model with percentages
    - Cost by user (top spenders)
    - Cost by prompt
    """
    try:
 

        validation_error = validate_custom_time_range(timeRange, fromDate, toDate)
        if validation_error:
            return validation_error

        data = await get_cost_analytics_dashboard(db, timeRange, fromDate, toDate, limit)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Cost analytics dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(message=str(e), error_code=f"{MODULE_PREFIX}_VALIDATION")
        )
    except Exception as e:
        logger.exception("Error fetching cost analytics dashboard")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(message=ErrorMessages.UNEXPECTED_ERROR, error_code=f"{MODULE_PREFIX}_INTERNAL")
        )


# =============================================================================
# 5. Performance Dashboard
# =============================================================================

@router.get(
    "/performance",
    response_model=PerformanceDashboardResponse,
    summary="Get performance dashboard",
    description="Get response time metrics, percentiles, and performance by model/hour.",
    responses={
        200: {"description": "Performance dashboard data", "model": PerformanceDashboardResponse},
        400: {"description": "Bad request"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def performance_dashboard(
    request: Request,
    timeRange: TimeRangeEnum = Query(TimeRangeEnum.LAST_7_DAYS, description="Time range"),
    fromDate: Optional[datetime] = Query(None, description="Start date (required if timeRange=custom)"),
    toDate: Optional[datetime] = Query(None, description="End date (required if timeRange=custom)"),
    limit: int = Query(10, ge=1, le=50, description="Number of slowest calls to return"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get performance dashboard with latency and success metrics.

    Returns:
    - Summary: avg response time, p50/p95/p99 percentiles, success/error rates
    - Response time distribution buckets
    - Performance by hour of day
    - Performance by LLM model
    - Slowest executions for debugging
    """
    try:


        validation_error = validate_custom_time_range(timeRange, fromDate, toDate)
        if validation_error:
            return validation_error

        data = await get_performance_dashboard(db, timeRange, fromDate, toDate, limit)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Performance dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(message=str(e), error_code=f"{MODULE_PREFIX}_VALIDATION")
        )
    except Exception as e:
        logger.exception("Error fetching performance dashboard")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(message=ErrorMessages.UNEXPECTED_ERROR, error_code=f"{MODULE_PREFIX}_INTERNAL")
        )


# =============================================================================
# 6. Unit Usage Dashboard
# =============================================================================

@router.get(
    "/unit-usage",
    response_model=UnitDashboardResponse,
    summary="Get unit usage dashboard",
    description="Get usage statistics by organizational unit.",
    responses={
        200: {"description": "Unit usage dashboard data", "model": UnitDashboardResponse},
        400: {"description": "Bad request"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def unit_usage_dashboard(
    request: Request,
    timeRange: TimeRangeEnum = Query(TimeRangeEnum.LAST_7_DAYS, description="Time range"),
    fromDate: Optional[datetime] = Query(None, description="Start date (required if timeRange=custom)"),
    toDate: Optional[datetime] = Query(None, description="End date (required if timeRange=custom)"),
    limit: int = Query(10, ge=1, le=50, description="Number of top units to return"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get unit usage dashboard for organizational analytics.

    Returns:
    - Summary: total units, active units, total calls, total cost
    - Top units by usage with detailed metrics
    - Unit comparison data for charts
    """
    try:

        validation_error = validate_custom_time_range(timeRange, fromDate, toDate)
        if validation_error:
            return validation_error

        data = await get_unit_dashboard(db, timeRange, fromDate, toDate, limit)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data.model_dump(mode="json"),
                message="Unit usage dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(message=str(e), error_code=f"{MODULE_PREFIX}_VALIDATION")
        )
    except Exception as e:
        logger.exception("Error fetching unit usage dashboard")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(message=ErrorMessages.UNEXPECTED_ERROR, error_code=f"{MODULE_PREFIX}_INTERNAL")
        )
