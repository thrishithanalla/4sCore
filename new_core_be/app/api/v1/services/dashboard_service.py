"""
Dashboard Service
Provides aggregation and analytics for comprehensive dashboards.

Endpoints:
- Overview Dashboard: Quick stats with period comparison
- User Activity Dashboard: User engagement and top users
- Prompt Analytics Dashboard: Prompt usage and effectiveness
- Cost Analytics Dashboard: Cost breakdown and projections
- Performance Dashboard: Response times and success rates
- Unit Dashboard: Usage by organizational unit
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Any, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.schemas.dashboard_schema import (
    TimeRangeEnum,
    # Counts
    CountsData,
    PlatformCounts,
    ApplicationCounts,
    JobCountItem,
    # Overview
    OverviewStats,
    OverviewChange,
    OverviewDashboardData,
    # User Activity
    UserActivitySummary,
    TopUserItem,
    UserActivityTrend,
    UserActivityDashboardData,
    # Prompt Analytics
    PromptUsageSummary,
    TopPromptItem,
    PromptTypeDistribution,
    PromptAnalyticsDashboardData,
    # Cost Analytics
    CostSummary,
    CostByDayItem,
    CostByUserItem,
    CostByPromptItem,
    CostAnalyticsDashboardData,
    # Performance
    PerformanceSummary,
    ResponseTimeDistribution,
    PerformanceByHour,
    PerformanceDashboardData,
    # Unit
    UnitUsageSummary,
    UnitUsageItem,
    UnitDashboardData,
)
from app.constants.collections import Collections
from app.constants.jobs import Jobs
from app.utils.time_utils import get_ist_now

logger = logging.getLogger(__name__)


# =============================================================================
# Job to Collection Key Mapping for Permission-Based Counts
# =============================================================================
# Maps job names (used in RBAC) to their corresponding response keys in CountsData
JOB_TO_COLLECTION_KEY = {
    # Core Master Data
    Jobs.UNITS: "units",
    Jobs.PERSONNEL_MASTER: "personnels",
    "PERSONNEL": "personnels",  # Support both PERSONNEL and PERSONNELS job names
    Jobs.DEPARTMENTS: "departments",
    Jobs.DISTRICT: "districts",
    Jobs.RANK: "ranks",
    Jobs.UNIT_TYPE: "unitTypes",
    Jobs.MANDALS: "mandals",
    Jobs.DESIGNATION_MASTER: "designations",
    Jobs.UNIT_VILLAGES: "unitVillages",

    # RBAC & Auth
    Jobs.ROLES: "roles",
    Jobs.MODULES: "modules",
    Jobs.JOBS: "jobs",
    Jobs.PERMISSIONS: "permissions",
    Jobs.PERMISSION_MAPPINGS: "permissionMappings",
    Jobs.USER_ROLE_PERMISSIONS: "userRolePermissions",
    Jobs.MODULE_HIERARCHY: "moduleHierarchy",
    Jobs.MODULE_JOB_MAPPINGS: "moduleJobMappings",

    # Value Sets
    Jobs.VALUE_SETS: "valueSets",

    # Approval
    Jobs.APPROVAL_FLOW_MASTER: "approvalFlowMaster",
    Jobs.APPROVAL_CHAIN: "approvalChains",

    # Prompts
    Jobs.PROMPT_MASTER: "prompts",
    Jobs.PROMPT_EXECUTIONS: "promptExecutions",

    # Feedback
    Jobs.FEEDBACK_MASTER: "feedbackMaster",
    Jobs.FEEDBACKS: "feedbacks",

    # Logging
    Jobs.LOG_MASTER: "logMaster",
    Jobs.LOG_TRANSACTION: "logTransactions",
    Jobs.ERROR_MASTER: "errorMaster",
    Jobs.ERROR_LOGS: "errorLogs",

    # Test
    Jobs.TEST_MASTER: "testMaster",
    Jobs.TEST_EXECUTIONS: "testExecutions",
}

# Reverse mapping: Collection key to Job name (for fetching job metadata)
COLLECTION_KEY_TO_JOB = {v: k for k, v in JOB_TO_COLLECTION_KEY.items()}

# Collection names
EXECUTION_COL = Collections.PROMPT_EXECUTION
PROMPT_COL = Collections.PROMPT_MASTER
USER_COL = Collections.PERSONNEL_MASTER
UNIT_COL = Collections.UNIT
USER_MAPPING_COL = Collections.USER_MAPPING


# =============================================================================
# 0. Counts Dashboard
# =============================================================================


async def get_user_permitted_jobs(
    db: AsyncIOMotorDatabase,
    user_id: str,
    role_id: str,
    unit_id: str,
    permission: str = "READ"
) -> List[str]:
    """
    Get list of job names the user has permission to access.

    Permission Formula:
    Final Permissions = (Base Role Permissions + Additional Permissions) - Exclusion Permissions

    Args:
        db: MongoDB database instance
        user_id: User ID from token
        role_id: Role ID from token
        unit_id: Unit ID from token
        permission: Permission type to check (default: READ)

    Returns:
        List of job names the user has access to
    """
    from bson import ObjectId

    permitted_jobs: set = set()

    # Fetch the role to get base permissions
    try:
        role = await db[Collections.ROLES].find_one({
            "_id": ObjectId(role_id),
            "isDelete": False
        })
    except Exception as e:
        logger.warning(f"Error fetching role {role_id}: {e}")
        return []

    if not role:
        return []

    # Get base permissions from role
    role_permissions = role.get("permissions", [])

    # Extract jobs with the specified permission from role
    for module in role_permissions:
        jobs = module.get("jobs", [])
        for job in jobs:
            job_name = job.get("jobName", "")
            perms = job.get("permissions", [])
            for perm in perms:
                # Handle both string and dict permission formats
                if isinstance(perm, dict):
                    perm_name = perm.get("name", "")
                else:
                    perm_name = str(perm)

                if perm_name.upper() == permission.upper():
                    permitted_jobs.add(job_name.upper())
                    break

    # Check user_role_permissions for additional/exclusion permissions
    if user_id and unit_id and role_id:
        try:
            user_id_obj = ObjectId(user_id)
            unit_id_obj = ObjectId(unit_id)
            role_id_obj = ObjectId(role_id)

            user_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                "userId": {"$in": [user_id, user_id_obj]},
                "unitId": {"$in": [unit_id, unit_id_obj]},
                "roleId": {"$in": [role_id, role_id_obj]},
                "isDelete": False
            })

            if user_mapping:
                additional_permissions = user_mapping.get("additionalPermissions", [])
                exclusion_permissions = user_mapping.get("exclusionPermissions", [])

                # Add jobs from additional permissions
                for module in additional_permissions:
                    jobs = module.get("jobs", [])
                    for job in jobs:
                        job_name = job.get("jobName", "")
                        perms = job.get("permissions", [])
                        for perm in perms:
                            if isinstance(perm, dict):
                                perm_name = perm.get("name", "")
                            else:
                                perm_name = str(perm)

                            if perm_name.upper() == permission.upper():
                                permitted_jobs.add(job_name.upper())
                                break

                # Remove jobs from exclusion permissions
                for module in exclusion_permissions:
                    jobs = module.get("jobs", [])
                    for job in jobs:
                        job_name = job.get("jobName", "")
                        perms = job.get("permissions", [])
                        for perm in perms:
                            if isinstance(perm, dict):
                                perm_name = perm.get("name", "")
                            else:
                                perm_name = str(perm)

                            if perm_name.upper() == permission.upper():
                                permitted_jobs.discard(job_name.upper())
                                break

        except Exception as e:
            logger.warning(f"Error checking user_role_permissions: {e}")
            # If there's any error, just use base role permissions
            pass

    return list(permitted_jobs)


# Define collection configurations for counts
# Format: (collection_name, response_key, is_master_table, category)
# is_master_table=True means filter by isDelete=False AND isActive=True
# is_master_table=False means filter by isDelete=False only (transaction tables)
# category: "platform" or "application"

# Platform collections - System/infrastructure level
PLATFORM_COLLECTION_CONFIG = [
    # Value Sets
    (Collections.VALUE_SETS, "valueSets", True),

    # Logging
    (Collections.LOG_MASTER, "logMaster", True),
    (Collections.LOG_TRANSACTION, "logTransactions", False),

    # Error
    (Collections.ERROR_MASTER, "errorMaster", True),
    (Collections.ERROR_LOGS, "errorLogs", False),

    # Approval
    (Collections.APPROVAL_FLOW_MASTER, "approvalFlowMaster", True),
    (Collections.APPROVAL_CHAIN, "approvalChains", False),

    # Test
    (Collections.TEST_MASTER, "testMaster", True),
    (Collections.TEST_EXECUTION, "testExecutions", False),

    # Prompts
    (Collections.PROMPT_MASTER, "prompts", True),
    (Collections.PROMPT_EXECUTION, "promptExecutions", False),

    # Feedback
    (Collections.FEEDBACK_MASTER, "feedbackMaster", True),
    (Collections.FEEDBACKS, "feedbacks", False),
]

# Application collections - Business/feature level
APPLICATION_COLLECTION_CONFIG = [
    # Core Master Data
    (Collections.UNIT, "units", True),
    (Collections.PERSONNEL_MASTER, "personnels", True),
    (Collections.DEPARTMENT, "departments", True),
    (Collections.DISTRICT, "districts", True),
    (Collections.RANK_MASTER, "ranks", True),
    (Collections.UNIT_TYPE, "unitTypes", True),
    (Collections.MANDAL, "mandals", True),
    (Collections.DESIGNATION_MASTER, "designations", True),
    (Collections.UNIT_VILLAGES, "unitVillages", True),

    # RBAC & Auth
    (Collections.ROLES, "roles", True),
    (Collections.MODULES, "modules", True),
    (Collections.JOBS, "jobs", True),
    (Collections.PERMISSIONS, "permissions", True),
    (Collections.PERMISSION_MAPPINGS, "permissionMappings", False),
    (Collections.USER_MAPPING, "userMappings", False),
    (Collections.USER_ROLE_PERMISSIONS, "userRolePermissions", False),
    (Collections.MODULE_HIERARCHY, "moduleHierarchy", False),
    (Collections.MODULE_JOB_MAPPINGS, "moduleJobMappings", False),
]

# Combined config for backward compatibility
COLLECTION_CONFIG = PLATFORM_COLLECTION_CONFIG + APPLICATION_COLLECTION_CONFIG


async def get_job_metadata(db: AsyncIOMotorDatabase) -> Dict[str, Dict[str, Any]]:
    """
    Fetch job metadata (menuEligible as isMenu, route) from jobs_master collection.

    Note: Returns 'isMenu' key for backward compatibility with dashboard consumers.
    The value comes from the 'menuEligible' field in jobs_master.

    Returns:
        Dict mapping job names (uppercase) to their metadata {isMenu, route}
    """
    try:
        jobs_cursor = db[Collections.JOBS].find(
            {"isDelete": False},
            {"name": 1, "menuEligible": 1, "route": 1}
        )
        jobs_list = await jobs_cursor.to_list(length=None)

        # Build mapping: job name (uppercase) -> {isMenu, route}
        # Note: 'isMenu' key is used for compatibility, value comes from 'menuEligible'
        metadata = {}
        for job in jobs_list:
            job_name = job.get("name", "").upper()
            metadata[job_name] = {
                "isMenu": job.get("menuEligible", True),  # menuEligible mapped to isMenu for compatibility
                "route": job.get("route")
            }
        return metadata
    except Exception as e:
        logger.warning(f"Error fetching job metadata: {e}")
        return {}


async def get_user_specific_job_metadata(
    db: AsyncIOMotorDatabase,
    user_id: str,
    role_id: str,
    unit_id: str
) -> Dict[str, Dict[str, Any]]:
    """
    Fetch user-specific job metadata (isMenu, route) from user's permissions.
    This respects per-user isMenu settings from their role permissions.

    Args:
        db: MongoDB database instance
        user_id: User ID from token
        role_id: Role ID from token
        unit_id: Unit ID from token

    Returns:
        Dict mapping job names (uppercase) to their metadata {isMenu, route}
    """
    from bson import ObjectId

    try:
        # Fetch the role to get base permissions
        role = await db[Collections.ROLES].find_one({
            "_id": ObjectId(role_id),
            "isDelete": False
        })

        if not role:
            # Fallback to global job metadata if role not found
            return await get_job_metadata(db)

        # Get base permissions from role
        role_permissions = role.get("permissions", [])

        # Check for user-specific permission overrides
        try:
            user_id_obj = ObjectId(user_id)
            unit_id_obj = ObjectId(unit_id)
            role_id_obj = ObjectId(role_id)

            user_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                "userId": {"$in": [user_id, user_id_obj]},
                "unitId": {"$in": [unit_id, unit_id_obj]},
                "roleId": {"$in": [role_id, role_id_obj]},
                "isDelete": False
            })
        except Exception:
            user_mapping = None

        # Fetch route information from jobs_master
        jobs_cursor = db[Collections.JOBS].find(
            {"isDelete": False},
            {"name": 1, "route": 1}
        )
        jobs_list = await jobs_cursor.to_list(length=None)
        route_map = {job.get("name", "").upper(): job.get("route") for job in jobs_list}

        # Build job metadata from permissions (respects user-specific isMenu)
        metadata = {}

        # Process base role permissions
        for module in role_permissions:
            for job in module.get("jobs", []):
                job_name = job.get("jobName", "").upper()
                metadata[job_name] = {
                    "isMenu": job.get("isMenu", True),
                    "route": route_map.get(job_name),
                    "displayName": job.get("displayName", job_name.title())
                }

        # Apply additional permissions if they exist
        if user_mapping:
            additional_permissions = user_mapping.get("additionalPermissions", [])
            for module in additional_permissions:
                for job in module.get("jobs", []):
                    job_name = job.get("jobName", "").upper()
                    metadata[job_name] = {
                        "isMenu": job.get("isMenu", True),
                        "route": route_map.get(job_name),
                        "displayName": job.get("displayName", job_name.title())
                    }

            # Remove excluded permissions
            exclusion_permissions = user_mapping.get("exclusionPermissions", [])
            for module in exclusion_permissions:
                for job in module.get("jobs", []):
                    job_name = job.get("jobName", "").upper()
                    metadata.pop(job_name, None)

        return metadata

    except Exception as e:
        logger.warning(f"Error fetching user-specific job metadata: {e}")
        # Fallback to global job metadata
        return await get_job_metadata(db)


async def get_counts_dashboard(
    db: AsyncIOMotorDatabase,
    jobs: Optional[List[str]] = None,
    user_id: Optional[str] = None,
    role_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    filter_by_permissions: bool = False,
) -> CountsData:
    """
    Get counts for all collections, optionally filtered by user permissions.
    Returns counts grouped by platform and application categories.
    Each count includes job metadata (isMenu, route).

    Args:
        db: MongoDB database instance
        jobs: Optional list of specific job names to get counts for.
              If None, returns counts based on permissions.
        user_id: User ID from token (required if filter_by_permissions=True)
        role_id: Role ID from token (required if filter_by_permissions=True)
        unit_id: Unit ID from token (required if filter_by_permissions=True)
        filter_by_permissions: If True, only return counts for jobs the user has READ permission for

    Returns:
        CountsData with platform and application nested counts, each with count, isMenu, route
    """
    # Get permitted collection keys based on user permissions
    permitted_keys: Optional[set] = None

    if filter_by_permissions and user_id and role_id and unit_id:
        # Get all jobs user has READ permission for
        permitted_jobs = await get_user_permitted_jobs(db, user_id, role_id, unit_id, "READ")

        # Map job names to collection keys
        permitted_keys = set()
        for job_name in permitted_jobs:
            # Find the job in our mapping (case-insensitive)
            for job_key, collection_key in JOB_TO_COLLECTION_KEY.items():
                if job_key.upper() == job_name.upper():
                    permitted_keys.add(collection_key)
                    break

        # IMPORTANT: Always include logs and error logs in dashboard counts
        # These are transaction/audit collections that should always be visible
        # for monitoring purposes, regardless of explicit permissions
        permitted_keys.add("logTransactions")
        permitted_keys.add("errorLogs")

    # Helper function to filter and count collections
    def filter_collections(config_list: list) -> list:
        """Filter collections based on permissions and requested jobs"""
        filtered = []
        for col, key, is_master in config_list:
            # Check if key is permitted (if filtering by permissions)
            if permitted_keys is not None and key not in permitted_keys:
                continue

            # Check if key matches requested jobs (if specific jobs provided)
            if jobs:
                jobs_lower = [j.lower() for j in jobs]
                if key.lower() not in jobs_lower:
                    continue

            filtered.append((col, key, is_master))
        return filtered

    # Filter platform and application collections separately
    platform_to_count = filter_collections(PLATFORM_COLLECTION_CONFIG)
    application_to_count = filter_collections(APPLICATION_COLLECTION_CONFIG)

    # Create count tasks for parallel execution
    async def count_collection(collection_name: str, is_master: bool) -> int:
        """Count documents in a collection with appropriate filters"""
        try:
            # Special handling for transaction/audit collections that don't have isDelete field
            # These are immutable records and should count all documents
            COLLECTIONS_WITHOUT_ISDELETE = [
                Collections.LOG_TRANSACTION,      # logs collection
                Collections.ERROR_LOGS,            # error_logs collection
                Collections.PROMPT_EXECUTION,      # prompt_execution collection
                Collections.TEST_EXECUTION,        # test_execution collection
                Collections.FEEDBACKS,             # feedback collection
            ]

            if collection_name in COLLECTIONS_WITHOUT_ISDELETE:
                query = {}  # Count all documents (no isDelete filter)
            elif is_master:
                # Master tables: isDelete=False AND isActive=True
                query = {"isDelete": False, "isActive": True}
            else:
                # Transaction tables: isDelete=False only
                query = {"isDelete": False}

            return await db[collection_name].count_documents(query)
        except Exception as e:
            logger.warning(f"Error counting {collection_name}: {e}")
            return 0

    # Run all counts and fetch job metadata in parallel
    platform_tasks = [count_collection(col, is_master) for col, _, is_master in platform_to_count]
    application_tasks = [count_collection(col, is_master) for col, _, is_master in application_to_count]

    # Fetch job metadata concurrently with counts
    # Use user-specific metadata if user credentials provided, otherwise use global metadata
    if user_id and role_id and unit_id:
        metadata_task = get_user_specific_job_metadata(db, user_id, role_id, unit_id)
    else:
        metadata_task = get_job_metadata(db)

    all_results = await asyncio.gather(
        *platform_tasks,
        *application_tasks,
        metadata_task
    )

    # Extract results
    platform_counts = all_results[:len(platform_tasks)]
    application_counts = all_results[len(platform_tasks):len(platform_tasks) + len(application_tasks)]
    job_metadata = all_results[-1]

    # Helper to get job metadata for a collection key
    def get_metadata_for_key(key: str) -> Dict[str, Any]:
        """Get isMenu, route, and displayName for a collection key from job metadata"""
        job_name = COLLECTION_KEY_TO_JOB.get(key, "").upper()
        if job_name and job_name in job_metadata:
            return job_metadata[job_name]
        return {"isMenu": False, "route": None, "displayName": None}

    # Build platform result dictionary with JobCountItem
    platform_dict = {}
    for i, (_, key, _) in enumerate(platform_to_count):
        meta = get_metadata_for_key(key)
        platform_dict[key] = JobCountItem(
            count=platform_counts[i],
            isMenu=meta.get("isMenu", False),
            route=meta.get("route"),
            displayName=meta.get("displayName")
        )

    # Fill missing platform keys with default JobCountItem
    platform_keys = [key for _, key, _ in PLATFORM_COLLECTION_CONFIG]
    for key in platform_keys:
        if key not in platform_dict:
            meta = get_metadata_for_key(key)
            platform_dict[key] = JobCountItem(
                count=0,
                isMenu=meta.get("isMenu", False),
                route=meta.get("route"),
                displayName=meta.get("displayName")
            )

    # Build application result dictionary with JobCountItem
    application_dict = {}
    for i, (_, key, _) in enumerate(application_to_count):
        meta = get_metadata_for_key(key)
        application_dict[key] = JobCountItem(
            count=application_counts[i],
            isMenu=meta.get("isMenu", False),
            route=meta.get("route"),
            displayName=meta.get("displayName")
        )

    # Fill missing application keys with default JobCountItem
    application_keys = [key for _, key, _ in APPLICATION_COLLECTION_CONFIG]
    for key in application_keys:
        if key not in application_dict:
            meta = get_metadata_for_key(key)
            application_dict[key] = JobCountItem(
                count=0,
                isMenu=meta.get("isMenu", False),
                route=meta.get("route"),
                displayName=meta.get("displayName")
            )

    return CountsData(
        platform=PlatformCounts(**platform_dict),
        application=ApplicationCounts(**application_dict)
    )


def _get_time_range_dates(
    time_range: TimeRangeEnum,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
) -> Tuple[datetime, datetime]:
    """Calculate start and end datetime based on time range"""
    now = get_ist_now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if time_range == TimeRangeEnum.CUSTOM:
        if not from_date or not to_date:
            raise ValueError("fromDate and toDate required for custom range")
        return from_date, to_date

    range_map = {
        TimeRangeEnum.TODAY: (today_start, now),
        TimeRangeEnum.YESTERDAY: (today_start - timedelta(days=1), today_start),
        TimeRangeEnum.LAST_7_DAYS: (today_start - timedelta(days=7), now),
        TimeRangeEnum.LAST_30_DAYS: (today_start - timedelta(days=30), now),
        TimeRangeEnum.THIS_MONTH: (today_start.replace(day=1), now),
        TimeRangeEnum.LAST_MONTH: (
            (today_start.replace(day=1) - timedelta(days=1)).replace(day=1),
            today_start.replace(day=1)
        ),
    }

    return range_map.get(time_range, (today_start - timedelta(days=7), now))


def _get_previous_period_dates(start_date: datetime, end_date: datetime) -> Tuple[datetime, datetime]:
    """Get the previous period dates for comparison"""
    duration = end_date - start_date
    prev_end = start_date
    prev_start = prev_end - duration
    return prev_start, prev_end


# =============================================================================
# 1. Overview Dashboard
# =============================================================================

async def get_overview_dashboard(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.LAST_7_DAYS,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
) -> OverviewDashboardData:
    """Get overview dashboard with current vs previous period comparison"""
    start_date, end_date = _get_time_range_dates(time_range, from_date, to_date)
    prev_start, prev_end = _get_previous_period_dates(start_date, end_date)

    # Run current and previous period queries in parallel
    current_stats, prev_stats, top_model, top_type, peak_hour = await asyncio.gather(
        _get_period_stats(db, start_date, end_date),
        _get_period_stats(db, prev_start, prev_end),
        _get_top_model(db, start_date, end_date),
        _get_top_prompt_type(db, start_date, end_date),
        _get_peak_hour(db, start_date, end_date),
    )

    # Calculate changes
    def calc_change(current: float, previous: float) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(((current - previous) / previous) * 100, 2)

    change = OverviewChange(
        executions=calc_change(current_stats.totalPromptExecutions, prev_stats.totalPromptExecutions),
        tokens=calc_change(current_stats.totalTokensUsed, prev_stats.totalTokensUsed),
        cost=calc_change(current_stats.totalCost, prev_stats.totalCost),
        users=calc_change(current_stats.activeUsers, prev_stats.activeUsers),
    )

    return OverviewDashboardData(
        currentPeriod=current_stats,
        previousPeriod=prev_stats,
        change=change,
        topModel=top_model,
        topPromptType=top_type,
        peakHour=peak_hour,
    )


async def _get_period_stats(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> OverviewStats:
    """Get statistics for a specific period"""
    pipeline = [
        {
            "$match": {
                "isDelete": False,
                "executionDateTime": {"$gte": start_date, "$lte": end_date}
            }
        },
        {
            "$group": {
                "_id": None,
                "totalExecutions": {"$sum": 1},
                "totalInputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
                "totalOutputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
                "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
                "uniqueUsers": {"$addToSet": "$userId"},
                "successCount": {
                    "$sum": {
                        "$cond": [{"$ne": ["$promptOutput", None]}, 1, 0]
                    }
                },
            }
        }
    ]

    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)

    if not result:
        return OverviewStats(
            totalPromptExecutions=0,
            totalTokensUsed=0,
            totalCost=0.0,
            activeUsers=0,
            avgResponseTime=0.0,
            successRate=0.0,
        )

    data = result[0]
    total_executions = data.get("totalExecutions", 0)
    success_count = data.get("successCount", 0)
    success_rate = (success_count / total_executions * 100) if total_executions > 0 else 0

    return OverviewStats(
        totalPromptExecutions=total_executions,
        totalTokensUsed=(data.get("totalInputTokens", 0) or 0) + (data.get("totalOutputTokens", 0) or 0),
        totalCost=round(data.get("totalCost", 0) or 0, 4),
        activeUsers=len(data.get("uniqueUsers", [])),
        avgResponseTime=round(data.get("avgResponseTime", 0) or 0, 2),
        successRate=round(success_rate, 2),
    )


async def _get_top_model(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> Optional[str]:
    """Get the most used LLM model"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$lookup": {"from": PROMPT_COL, "localField": "promptId", "foreignField": "_id", "as": "prompt"}},
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$prompt.llm", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1}
    ]
    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)
    return result[0]["_id"] if result and result[0]["_id"] else None


async def _get_top_prompt_type(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> Optional[str]:
    """Get the most used prompt type"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$lookup": {"from": PROMPT_COL, "localField": "promptId", "foreignField": "_id", "as": "prompt"}},
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$prompt.type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1}
    ]
    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)
    return result[0]["_id"] if result and result[0]["_id"] else None


async def _get_peak_hour(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> Optional[int]:
    """Get the hour with most executions"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {"_id": {"$hour": "$executionDateTime"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1}
    ]
    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)
    return result[0]["_id"] if result else None


# =============================================================================
# 2. User Activity Dashboard
# =============================================================================

async def get_user_activity_dashboard(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.LAST_7_DAYS,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 10,
) -> UserActivityDashboardData:
    """Get user activity dashboard data"""
    start_date, end_date = _get_time_range_dates(time_range, from_date, to_date)

    summary, top_users, activity_trend, users_by_unit = await asyncio.gather(
        _get_user_activity_summary(db, start_date, end_date),
        _get_top_users(db, start_date, end_date, limit),
        _get_user_activity_trend(db, start_date, end_date),
        _get_users_by_unit(db, start_date, end_date),
    )

    return UserActivityDashboardData(
        summary=summary,
        topUsers=top_users,
        activityTrend=activity_trend,
        usersByUnit=users_by_unit,
    )


async def _get_user_activity_summary(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> UserActivitySummary:
    """Get user activity summary"""
    # Total users
    total_users = await db[USER_COL].count_documents({"isDelete": False})

    # Active users in time range
    active_pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {"_id": "$userId"}},
        {"$count": "count"}
    ]
    active_result = await db[EXECUTION_COL].aggregate(active_pipeline).to_list(length=1)
    active_users = active_result[0]["count"] if active_result else 0

    # New users (created in time range)
    new_users = await db[USER_COL].count_documents({
        "isDelete": False,
        "createdAt": {"$gte": start_date, "$lte": end_date}
    })

    return UserActivitySummary(
        totalUsers=total_users,
        activeUsers=active_users,
        newUsers=new_users,
        inactiveUsers=total_users - active_users,
    )


async def _get_top_users(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime, limit: int) -> List[TopUserItem]:
    """Get top users by prompt executions"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": "$userId",
                "totalCalls": {"$sum": 1},
                "totalInputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
                "totalOutputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
                "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "lastActive": {"$max": "$executionDateTime"},
            }
        },
        {"$sort": {"totalCalls": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": USER_COL,
                "localField": "_id",
                "foreignField": "_id",
                "as": "user"
            }
        },
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": UNIT_COL,
                "localField": "user.unitId",
                "foreignField": "_id",
                "as": "unit"
            }
        },
        {"$unwind": {"path": "$unit", "preserveNullAndEmptyArrays": True}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=limit)

    return [
        TopUserItem(
            userId=str(r["_id"]) if r.get("_id") else "",
            userName=r.get("user", {}).get("name"),
            unitName=r.get("unit", {}).get("name"),
            totalCalls=r.get("totalCalls", 0),
            totalTokens=(r.get("totalInputTokens", 0) or 0) + (r.get("totalOutputTokens", 0) or 0),
            totalCost=round(r.get("totalCost", 0) or 0, 4),
            lastActive=r.get("lastActive"),
        )
        for r in results
    ]


async def _get_user_activity_trend(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[UserActivityTrend]:
    """Get user activity trend over time"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$executionDateTime"},
                    "month": {"$month": "$executionDateTime"},
                    "day": {"$dayOfMonth": "$executionDateTime"},
                },
                "activeUsers": {"$addToSet": "$userId"},
                "totalCalls": {"$sum": 1},
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)

    return [
        UserActivityTrend(
            timestamp=datetime(r["_id"]["year"], r["_id"]["month"], r["_id"]["day"]),
            activeUsers=len(r.get("activeUsers", [])),
            newUsers=0,  # Would need additional query
            totalCalls=r.get("totalCalls", 0),
        )
        for r in results
    ]


async def _get_users_by_unit(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
    """Get user activity grouped by unit"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": USER_COL,
                "localField": "userId",
                "foreignField": "_id",
                "as": "user"
            }
        },
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": UNIT_COL,
                "localField": "user.unitId",
                "foreignField": "_id",
                "as": "unit"
            }
        },
        {"$unwind": {"path": "$unit", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": "$user.unitId",
                "unitName": {"$first": "$unit.name"},
                "activeUsers": {"$addToSet": "$userId"},
                "totalCalls": {"$sum": 1},
                "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
            }
        },
        {"$sort": {"totalCalls": -1}},
        {"$limit": 10},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=10)

    return [
        {
            "unitId": str(r["_id"]) if r.get("_id") else "Unknown",
            "unitName": r.get("unitName", "Unknown"),
            "activeUsers": len(r.get("activeUsers", [])),
            "totalCalls": r.get("totalCalls", 0),
            "totalCost": round(r.get("totalCost", 0) or 0, 4),
        }
        for r in results
    ]


# =============================================================================
# 3. Prompt Analytics Dashboard
# =============================================================================

async def get_prompt_analytics_dashboard(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.LAST_7_DAYS,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 10,
) -> PromptAnalyticsDashboardData:
    """Get prompt analytics dashboard data"""
    start_date, end_date = _get_time_range_dates(time_range, from_date, to_date)

    summary, top_prompts, by_type, unused = await asyncio.gather(
        _get_prompt_usage_summary(db, start_date, end_date),
        _get_top_prompts(db, start_date, end_date, limit),
        _get_prompt_type_distribution(db, start_date, end_date),
        _get_unused_prompts(db, start_date, end_date, limit),
    )

    return PromptAnalyticsDashboardData(
        summary=summary,
        topPrompts=top_prompts,
        byType=by_type,
        unusedPrompts=unused,
    )


async def _get_prompt_usage_summary(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> PromptUsageSummary:
    """Get prompt usage summary"""
    # Total prompts
    total_prompts = await db[PROMPT_COL].count_documents({"isDelete": False})

    # Active prompts and total executions
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": None,
                "uniquePrompts": {"$addToSet": "$promptId"},
                "totalExecutions": {"$sum": 1},
            }
        }
    ]
    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)

    if not result:
        return PromptUsageSummary(
            totalPrompts=total_prompts,
            activePrompts=0,
            totalExecutions=0,
            avgExecutionsPerPrompt=0.0,
        )

    data = result[0]
    active_prompts = len(data.get("uniquePrompts", []))
    total_executions = data.get("totalExecutions", 0)

    return PromptUsageSummary(
        totalPrompts=total_prompts,
        activePrompts=active_prompts,
        totalExecutions=total_executions,
        avgExecutionsPerPrompt=round(total_executions / active_prompts, 2) if active_prompts > 0 else 0.0,
    )


async def _get_top_prompts(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime, limit: int) -> List[TopPromptItem]:
    """Get top prompts by usage"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": "$promptId",
                "totalExecutions": {"$sum": 1},
                "totalInputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
                "totalOutputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
                "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
                "successCount": {"$sum": {"$cond": [{"$ne": ["$promptOutput", None]}, 1, 0]}},
            }
        },
        {"$sort": {"totalExecutions": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "_id",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=limit)

    return [
        TopPromptItem(
            promptId=str(r["_id"]) if r.get("_id") else "",
            promptName=r.get("prompt", {}).get("name", "Unknown"),
            promptType=r.get("prompt", {}).get("type"),
            llm=r.get("prompt", {}).get("llm"),
            totalExecutions=r.get("totalExecutions", 0),
            totalTokens=(r.get("totalInputTokens", 0) or 0) + (r.get("totalOutputTokens", 0) or 0),
            totalCost=round(r.get("totalCost", 0) or 0, 4),
            avgResponseTime=round(r.get("avgResponseTime", 0) or 0, 2),
            successRate=round((r.get("successCount", 0) / r.get("totalExecutions", 1)) * 100, 2),
        )
        for r in results
    ]


async def _get_prompt_type_distribution(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[PromptTypeDistribution]:
    """Get distribution by prompt type"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "promptId",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": "$prompt.type",
                "count": {"$addToSet": "$promptId"},
                "totalExecutions": {"$sum": 1},
            }
        },
        {"$sort": {"totalExecutions": -1}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)

    total_executions = sum(r.get("totalExecutions", 0) for r in results)

    return [
        PromptTypeDistribution(
            promptType=r["_id"] or "Unknown",
            count=len(r.get("count", [])),
            totalExecutions=r.get("totalExecutions", 0),
            percentage=round((r.get("totalExecutions", 0) / total_executions) * 100, 2) if total_executions > 0 else 0,
        )
        for r in results
    ]


async def _get_unused_prompts(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime, limit: int) -> List[Dict[str, Any]]:
    """Get prompts with no recent usage"""
    # Get prompts that were used in the time range
    used_pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {"_id": "$promptId"}},
    ]
    used_result = await db[EXECUTION_COL].aggregate(used_pipeline).to_list(length=None)
    used_prompt_ids = [r["_id"] for r in used_result]

    # Get prompts not in the used list
    unused_prompts = await db[PROMPT_COL].find(
        {"isDelete": False, "_id": {"$nin": used_prompt_ids}}
    ).limit(limit).to_list(length=limit)

    return [
        {
            "promptId": str(p["_id"]),
            "promptName": p.get("name", "Unknown"),
            "promptType": p.get("type"),
            "createdAt": p.get("createdAt"),
        }
        for p in unused_prompts
    ]


# =============================================================================
# 4. Cost Analytics Dashboard
# =============================================================================

async def get_cost_analytics_dashboard(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.LAST_7_DAYS,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 10,
) -> CostAnalyticsDashboardData:
    """Get cost analytics dashboard data"""
    start_date, end_date = _get_time_range_dates(time_range, from_date, to_date)
    prev_start, prev_end = _get_previous_period_dates(start_date, end_date)

    summary, by_day, by_model, by_user, by_prompt = await asyncio.gather(
        _get_cost_summary(db, start_date, end_date, prev_start, prev_end),
        _get_cost_by_day(db, start_date, end_date),
        _get_cost_by_model(db, start_date, end_date),
        _get_cost_by_user(db, start_date, end_date, limit),
        _get_cost_by_prompt(db, start_date, end_date, limit),
    )

    return CostAnalyticsDashboardData(
        summary=summary,
        byDay=by_day,
        byModel=by_model,
        byUser=by_user,
        byPrompt=by_prompt,
    )


async def _get_cost_summary(
    db: AsyncIOMotorDatabase,
    start_date: datetime,
    end_date: datetime,
    prev_start: datetime,
    prev_end: datetime,
) -> CostSummary:
    """Get cost summary with projections"""
    # Current period cost
    current_pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {"_id": None, "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}}}},
    ]
    current_result = await db[EXECUTION_COL].aggregate(current_pipeline).to_list(length=1)
    current_cost = current_result[0]["totalCost"] if current_result else 0

    # Previous period cost
    prev_pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": prev_start, "$lte": prev_end}}},
        {"$group": {"_id": None, "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}}}},
    ]
    prev_result = await db[EXECUTION_COL].aggregate(prev_pipeline).to_list(length=1)
    prev_cost = prev_result[0]["totalCost"] if prev_result else 0

    # Calculate metrics
    days_in_period = max((end_date - start_date).days, 1)
    avg_daily_cost = current_cost / days_in_period
    projected_monthly = avg_daily_cost * 30

    cost_change = 0.0
    if prev_cost > 0:
        cost_change = ((current_cost - prev_cost) / prev_cost) * 100

    return CostSummary(
        totalCost=round(current_cost, 4),
        avgDailyCost=round(avg_daily_cost, 4),
        projectedMonthlyCost=round(projected_monthly, 4),
        costChange=round(cost_change, 2),
    )


async def _get_cost_by_day(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[CostByDayItem]:
    """Get cost breakdown by day"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$executionDateTime"},
                    "month": {"$month": "$executionDateTime"},
                    "day": {"$dayOfMonth": "$executionDateTime"},
                },
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "calls": {"$sum": 1},
                "tokens": {
                    "$sum": {
                        "$add": [
                            {"$ifNull": ["$inputTokenCount", 0]},
                            {"$ifNull": ["$outputTokenCount", 0]}
                        ]
                    }
                },
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)

    return [
        CostByDayItem(
            date=date(r["_id"]["year"], r["_id"]["month"], r["_id"]["day"]),
            cost=round(r.get("cost", 0) or 0, 4),
            calls=r.get("calls", 0),
            tokens=r.get("tokens", 0),
        )
        for r in results
    ]


async def _get_cost_by_model(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
    """Get cost breakdown by LLM model"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "promptId",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": {"$ifNull": ["$prompt.llm", "Unknown"]},
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "calls": {"$sum": 1},
            }
        },
        {"$sort": {"cost": -1}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)
    total_cost = sum(r.get("cost", 0) or 0 for r in results)

    return [
        {
            "model": r["_id"],
            "cost": round(r.get("cost", 0) or 0, 4),
            "percentage": round((r.get("cost", 0) / total_cost) * 100, 2) if total_cost > 0 else 0,
            "calls": r.get("calls", 0),
        }
        for r in results
    ]


async def _get_cost_by_user(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime, limit: int) -> List[CostByUserItem]:
    """Get cost breakdown by user"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": "$userId",
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "calls": {"$sum": 1},
            }
        },
        {"$sort": {"cost": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": USER_COL,
                "localField": "_id",
                "foreignField": "_id",
                "as": "user"
            }
        },
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": UNIT_COL,
                "localField": "user.unitId",
                "foreignField": "_id",
                "as": "unit"
            }
        },
        {"$unwind": {"path": "$unit", "preserveNullAndEmptyArrays": True}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=limit)

    # Get total cost for percentage calculation
    total_pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$cost", 0]}}}},
    ]
    total_result = await db[EXECUTION_COL].aggregate(total_pipeline).to_list(length=1)
    total_cost = total_result[0]["total"] if total_result else 0

    return [
        CostByUserItem(
            userId=str(r["_id"]) if r.get("_id") else "",
            userName=r.get("user", {}).get("name"),
            unitName=r.get("unit", {}).get("name"),
            cost=round(r.get("cost", 0) or 0, 4),
            percentage=round((r.get("cost", 0) / total_cost) * 100, 2) if total_cost > 0 else 0,
            calls=r.get("calls", 0),
        )
        for r in results
    ]


async def _get_cost_by_prompt(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime, limit: int) -> List[CostByPromptItem]:
    """Get cost breakdown by prompt"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": "$promptId",
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "calls": {"$sum": 1},
            }
        },
        {"$sort": {"cost": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "_id",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=limit)

    # Get total cost
    total_pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$cost", 0]}}}},
    ]
    total_result = await db[EXECUTION_COL].aggregate(total_pipeline).to_list(length=1)
    total_cost = total_result[0]["total"] if total_result else 0

    return [
        CostByPromptItem(
            promptId=str(r["_id"]) if r.get("_id") else "",
            promptName=r.get("prompt", {}).get("name", "Unknown"),
            promptType=r.get("prompt", {}).get("type"),
            cost=round(r.get("cost", 0) or 0, 4),
            percentage=round((r.get("cost", 0) / total_cost) * 100, 2) if total_cost > 0 else 0,
            calls=r.get("calls", 0),
        )
        for r in results
    ]


# =============================================================================
# 5. Performance Dashboard
# =============================================================================

async def get_performance_dashboard(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.LAST_7_DAYS,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 10,
) -> PerformanceDashboardData:
    """Get performance dashboard data"""
    start_date, end_date = _get_time_range_dates(time_range, from_date, to_date)

    summary, distribution, by_hour, by_model, slowest = await asyncio.gather(
        _get_performance_summary(db, start_date, end_date),
        _get_response_time_distribution(db, start_date, end_date),
        _get_performance_by_hour(db, start_date, end_date),
        _get_performance_by_model(db, start_date, end_date),
        _get_slowest_calls(db, start_date, end_date, limit),
    )

    return PerformanceDashboardData(
        summary=summary,
        responseTimeDistribution=distribution,
        byHour=by_hour,
        byModel=by_model,
        slowestCalls=slowest,
    )


async def _get_performance_summary(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> PerformanceSummary:
    """Get performance summary with percentiles"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$sort": {"executionTime": 1}},
        {
            "$group": {
                "_id": None,
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
                "responseTimes": {"$push": {"$ifNull": ["$executionTime", 0]}},
                "totalCalls": {"$sum": 1},
                "successCount": {"$sum": {"$cond": [{"$ne": ["$promptOutput", None]}, 1, 0]}},
            }
        }
    ]

    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)

    if not result:
        return PerformanceSummary(
            avgResponseTime=0.0,
            p50ResponseTime=0.0,
            p95ResponseTime=0.0,
            p99ResponseTime=0.0,
            successRate=0.0,
            errorRate=0.0,
        )

    data = result[0]
    response_times = sorted(data.get("responseTimes", []))
    total_calls = data.get("totalCalls", 0)
    success_count = data.get("successCount", 0)

    def percentile(arr, p):
        if not arr:
            return 0.0
        k = (len(arr) - 1) * p / 100
        f = int(k)
        c = f + 1
        if c >= len(arr):
            return arr[-1]
        return arr[f] + (arr[c] - arr[f]) * (k - f)

    success_rate = (success_count / total_calls * 100) if total_calls > 0 else 0

    return PerformanceSummary(
        avgResponseTime=round(data.get("avgResponseTime", 0) or 0, 2),
        p50ResponseTime=round(percentile(response_times, 50), 2),
        p95ResponseTime=round(percentile(response_times, 95), 2),
        p99ResponseTime=round(percentile(response_times, 99), 2),
        successRate=round(success_rate, 2),
        errorRate=round(100 - success_rate, 2),
    )


async def _get_response_time_distribution(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[ResponseTimeDistribution]:
    """Get response time distribution buckets"""
    buckets = [
        (0, 1, "0-1s"),
        (1, 2, "1-2s"),
        (2, 5, "2-5s"),
        (5, 10, "5-10s"),
        (10, float('inf'), "10s+"),
    ]

    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$bucket": {
                "groupBy": {"$ifNull": ["$executionTime", 0]},
                "boundaries": [0, 1, 2, 5, 10, 1000],
                "default": "Other",
                "output": {"count": {"$sum": 1}}
            }
        }
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)

    # Map results to buckets
    result_map = {r["_id"]: r["count"] for r in results}
    total = sum(r["count"] for r in results)

    distribution = []
    for i, (low, high, label) in enumerate(buckets):
        boundary = low if i < len(buckets) - 1 else 10
        count = result_map.get(boundary, 0)
        if boundary == 10:
            # Handle 10s+ bucket
            count = result_map.get(10, 0) + result_map.get("Other", 0)

        distribution.append(ResponseTimeDistribution(
            range=label,
            count=count,
            percentage=round((count / total) * 100, 2) if total > 0 else 0,
        ))

    return distribution


async def _get_performance_by_hour(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[PerformanceByHour]:
    """Get performance metrics by hour of day"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$group": {
                "_id": {"$hour": "$executionDateTime"},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
                "calls": {"$sum": 1},
                "errorCount": {"$sum": {"$cond": [{"$eq": ["$promptOutput", None]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=24)

    return [
        PerformanceByHour(
            hour=r["_id"],
            avgResponseTime=round(r.get("avgResponseTime", 0) or 0, 2),
            calls=r.get("calls", 0),
            errorRate=round((r.get("errorCount", 0) / r.get("calls", 1)) * 100, 2),
        )
        for r in results
    ]


async def _get_performance_by_model(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
    """Get performance metrics by model"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "promptId",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": {"$ifNull": ["$prompt.llm", "Unknown"]},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
                "calls": {"$sum": 1},
                "successCount": {"$sum": {"$cond": [{"$ne": ["$promptOutput", None]}, 1, 0]}},
            }
        },
        {"$sort": {"calls": -1}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)

    return [
        {
            "model": r["_id"],
            "avgResponseTime": round(r.get("avgResponseTime", 0) or 0, 2),
            "calls": r.get("calls", 0),
            "successRate": round((r.get("successCount", 0) / r.get("calls", 1)) * 100, 2),
        }
        for r in results
    ]


async def _get_slowest_calls(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime, limit: int) -> List[Dict[str, Any]]:
    """Get slowest executions"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {"$sort": {"executionTime": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "promptId",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": USER_COL,
                "localField": "userId",
                "foreignField": "_id",
                "as": "user"
            }
        },
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=limit)

    return [
        {
            "executionId": str(r["_id"]),
            "timestamp": r.get("executionDateTime"),
            "responseTime": r.get("executionTime", 0),
            "promptName": r.get("prompt", {}).get("name"),
            "model": r.get("prompt", {}).get("llm"),
            "userName": r.get("user", {}).get("name"),
            "tokens": (r.get("inputTokenCount", 0) or 0) + (r.get("outputTokenCount", 0) or 0),
        }
        for r in results
    ]


# =============================================================================
# 6. Unit Dashboard
# =============================================================================

async def get_unit_dashboard(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.LAST_7_DAYS,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 10,
) -> UnitDashboardData:
    """Get unit dashboard data"""
    start_date, end_date = _get_time_range_dates(time_range, from_date, to_date)

    summary, top_units, comparison = await asyncio.gather(
        _get_unit_usage_summary(db, start_date, end_date),
        _get_top_units(db, start_date, end_date, limit),
        _get_unit_comparison(db, start_date, end_date),
    )

    return UnitDashboardData(
        summary=summary,
        topUnits=top_units,
        unitComparison=comparison,
    )


async def _get_unit_usage_summary(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> UnitUsageSummary:
    """Get unit usage summary"""
    # Total units
    total_units = await db[UNIT_COL].count_documents({"isDelete": False})

    # Execution stats by unit
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": USER_COL,
                "localField": "userId",
                "foreignField": "_id",
                "as": "user"
            }
        },
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": None,
                "uniqueUnits": {"$addToSet": "$user.unitId"},
                "totalCalls": {"$sum": 1},
                "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
            }
        }
    ]

    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)

    if not result:
        return UnitUsageSummary(
            totalUnits=total_units,
            activeUnits=0,
            totalCalls=0,
            totalCost=0.0,
        )

    data = result[0]
    return UnitUsageSummary(
        totalUnits=total_units,
        activeUnits=len([u for u in data.get("uniqueUnits", []) if u is not None]),
        totalCalls=data.get("totalCalls", 0),
        totalCost=round(data.get("totalCost", 0) or 0, 4),
    )


async def _get_top_units(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime, limit: int) -> List[UnitUsageItem]:
    """Get top units by usage"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": USER_COL,
                "localField": "userId",
                "foreignField": "_id",
                "as": "user"
            }
        },
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": "$user.unitId",
                "totalCalls": {"$sum": 1},
                "uniqueUsers": {"$addToSet": "$userId"},
                "totalInputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
                "totalOutputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
                "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
            }
        },
        {"$match": {"_id": {"$ne": None}}},
        {"$sort": {"totalCalls": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": UNIT_COL,
                "localField": "_id",
                "foreignField": "_id",
                "as": "unit"
            }
        },
        {"$unwind": {"path": "$unit", "preserveNullAndEmptyArrays": True}},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=limit)

    # Get total users per unit
    unit_ids = [r["_id"] for r in results if r.get("_id")]
    total_users_pipeline = [
        {"$match": {"isDelete": False, "unitId": {"$in": unit_ids}}},
        {"$group": {"_id": "$unitId", "count": {"$sum": 1}}},
    ]
    total_users_result = await db[USER_COL].aggregate(total_users_pipeline).to_list(length=None)
    total_users_map = {r["_id"]: r["count"] for r in total_users_result}

    return [
        UnitUsageItem(
            unitId=str(r["_id"]) if r.get("_id") else "",
            unitName=r.get("unit", {}).get("name", "Unknown"),
            districtName=r.get("unit", {}).get("districtName"),
            totalUsers=total_users_map.get(r["_id"], 0),
            activeUsers=len(r.get("uniqueUsers", [])),
            totalCalls=r.get("totalCalls", 0),
            totalTokens=(r.get("totalInputTokens", 0) or 0) + (r.get("totalOutputTokens", 0) or 0),
            totalCost=round(r.get("totalCost", 0) or 0, 4),
            avgResponseTime=round(r.get("avgResponseTime", 0) or 0, 2),
        )
        for r in results
    ]


async def _get_unit_comparison(db: AsyncIOMotorDatabase, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
    """Get unit comparison data for charts"""
    pipeline = [
        {"$match": {"isDelete": False, "executionDateTime": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": USER_COL,
                "localField": "userId",
                "foreignField": "_id",
                "as": "user"
            }
        },
        {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        {
            "$lookup": {
                "from": UNIT_COL,
                "localField": "user.unitId",
                "foreignField": "_id",
                "as": "unit"
            }
        },
        {"$unwind": {"path": "$unit", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": "$user.unitId",
                "unitName": {"$first": "$unit.name"},
                "calls": {"$sum": 1},
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "tokens": {
                    "$sum": {
                        "$add": [
                            {"$ifNull": ["$inputTokenCount", 0]},
                            {"$ifNull": ["$outputTokenCount", 0]}
                        ]
                    }
                },
            }
        },
        {"$match": {"_id": {"$ne": None}}},
        {"$sort": {"calls": -1}},
        {"$limit": 10},
    ]

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=10)

    return [
        {
            "unitId": str(r["_id"]) if r.get("_id") else "",
            "unitName": r.get("unitName", "Unknown"),
            "calls": r.get("calls", 0),
            "cost": round(r.get("cost", 0) or 0, 4),
            "tokens": r.get("tokens", 0),
        }
        for r in results
    ]
