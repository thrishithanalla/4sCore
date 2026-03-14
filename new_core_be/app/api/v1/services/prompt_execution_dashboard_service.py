"""
Prompt Execution Dashboard Service.

This module provides aggregation and analytics logic for the AI Prompts
Monitor dashboard. It generates statistics, performance metrics, and
insights from prompt execution data.

Key Features:
    - Summary statistics (total calls, tokens, costs)
    - Model performance metrics and comparisons
    - Use case distribution analysis
    - Trend analysis over configurable time ranges
    - Recent calls listing with details

Dashboard Components:
    - DashboardSummary: Overall execution counts and metrics
    - ModelStats: Performance by AI model
    - UseCaseStats: Distribution by use case
    - TrendDataPoint: Time-series data for charts
    - ModelPerformance: Latency and success metrics
    - CostByModel: Cost breakdown per model

Time Range Options:
    - 1 hour, 24 hours, 7 days, 30 days, custom range

Usage:
    from app.api.v1.services.prompt_execution_dashboard_service import get_dashboard_data

    dashboard = await get_dashboard_data(db, time_range, from_date, to_date)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from bson import ObjectId

from app.api.v1.schemas.prompt_execution_dashboard_schema import (
    TimeRangeEnum,
    DashboardSummary,
    ModelStats,
    UseCaseStats,
    TrendDataPoint,
    RecentCallItem,
    ModelPerformance,
    CostByModel,
    PromptExecutionDashboardData,
    RecentCallsData,
    PaginationInfo,
)
from app.constants.collections import Collections
from app.utils.time_utils import get_ist_now

logger = logging.getLogger(__name__)

# Collection names
EXECUTION_COL = Collections.PROMPT_EXECUTION
PROMPT_COL = Collections.PROMPT_MASTER
USER_COL = Collections.PERSONNEL_MASTER
MODULE_COL = Collections.MODULES


def _get_time_range_filter(
    time_range: TimeRangeEnum,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
) -> tuple[datetime, datetime]:
    """Calculate start and end datetime based on time range"""
    now = get_ist_now()

    if time_range == TimeRangeEnum.CUSTOM:
        if not from_date or not to_date:
            raise ValueError("fromDate and toDate required for custom range")
        return from_date, to_date

    range_map = {
        TimeRangeEnum.HOUR_1: timedelta(hours=1),
        TimeRangeEnum.HOUR_24: timedelta(hours=24),
        TimeRangeEnum.DAY_7: timedelta(days=7),
        TimeRangeEnum.DAY_30: timedelta(days=30),
    }

    delta = range_map.get(time_range, timedelta(hours=24))
    return now - delta, now


async def get_dashboard_data(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.HOUR_24,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    min_accuracy: Optional[float] = None,
    max_accuracy: Optional[float] = None,
    personnel_id: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 10,
) -> PromptExecutionDashboardData:
    """
    Get complete dashboard data with aggregations including stats, trends, and list.
    Joins prompt_execution with prompt_master to get model and use case info.

    Args:
        db: Database connection
        time_range: Time range filter (1h, 24h, 7d, 30d, custom)
        from_date: Start date for custom range
        to_date: End date for custom range
        llm_model: Filter by LLM model name
        use_case: Filter by use case / prompt type
        min_accuracy: Filter by minimum accuracy
        max_accuracy: Filter by maximum accuracy
        personnel_id: Filter by user/personnel ID
        module_id: Filter by module ID
        search: Search text (searches in prompt name, user name)
        page: Page number for list (1-indexed)
        page_size: Number of items per page for list

    Returns:
        Complete dashboard data including summary, charts, and paginated list
    """
    start_date, end_date = _get_time_range_filter(time_range, from_date, to_date)

    # Build base match filter
    base_match: Dict[str, Any] = {
        "isDelete": False,
        "executionDateTime": {"$gte": start_date, "$lte": end_date}
    }

    # Add personnel filter at base level (userId is in prompt_execution)
    if personnel_id and ObjectId.is_valid(personnel_id):
        base_match["userId"] = ObjectId(personnel_id)

    # Get all data in parallel
    summary = await _get_summary(db, base_match, llm_model, use_case, module_id, search)
    by_model = await _get_stats_by_model(db, base_match, llm_model, use_case, module_id, search)
    by_use_case = await _get_stats_by_use_case(db, base_match, llm_model, use_case, module_id, search)
    trends = await _get_trends(db, base_match, start_date, end_date, time_range, llm_model, use_case, module_id, search)
    model_performance = await _get_model_performance(db, base_match, llm_model, use_case, module_id, search)
    cost_by_model = await _get_cost_by_model(db, base_match, llm_model, use_case, module_id, search)

    # Get paginated list
    list_items, total_count = await _get_list_with_count(
        db, base_match, llm_model, use_case, module_id, search, page, page_size
    )

    # Calculate pagination info
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
    pagination = PaginationInfo(
        page=page,
        pageSize=page_size,
        totalCount=total_count,
        totalPages=total_pages,
    )

    return PromptExecutionDashboardData(
        summary=summary,
        byModel=by_model,
        byUseCase=by_use_case,
        trends=trends,
        modelPerformance=model_performance,
        costByModel=cost_by_model,
        list=list_items,
        pagination=pagination,
    )


def _build_base_pipeline_with_filters(
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
    include_user_lookup: bool = False,
    include_module_lookup: bool = False,
) -> List[Dict[str, Any]]:
    """
    Build common pipeline with lookups and filters.
    This is used by all aggregation functions for consistent filtering.
    """
    pipeline: List[Dict[str, Any]] = [
        {"$match": base_match},
        # Join with prompt_master to get llm, type, and moduleId
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "promptId",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
    ]

    # Add user lookup if needed (for search by user name)
    if include_user_lookup or search:
        pipeline.extend([
            {
                "$lookup": {
                    "from": USER_COL,
                    "localField": "userId",
                    "foreignField": "_id",
                    "as": "user"
                }
            },
            {"$unwind": {"path": "$user", "preserveNullAndEmptyArrays": True}},
        ])

    # Add module lookup if needed (for module name in results)
    if include_module_lookup:
        pipeline.extend([
            {
                "$lookup": {
                    "from": MODULE_COL,
                    "localField": "prompt.moduleId",
                    "foreignField": "_id",
                    "as": "module"
                }
            },
            {"$unwind": {"path": "$module", "preserveNullAndEmptyArrays": True}},
        ])

    # Add model filter if specified
    if llm_model:
        pipeline.append({"$match": {"prompt.llm": {"$regex": llm_model, "$options": "i"}}})

    # Add use case filter if specified
    if use_case:
        pipeline.append({"$match": {"prompt.type": {"$regex": use_case, "$options": "i"}}})

    # Add module filter if specified
    if module_id and ObjectId.is_valid(module_id):
        pipeline.append({"$match": {"prompt.moduleId": ObjectId(module_id)}})

    # Add search filter if specified (searches in prompt name and user name)
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        pipeline.append({
            "$match": {
                "$or": [
                    {"prompt.name": search_regex},
                    {"user.name": search_regex},
                ]
            }
        })

    return pipeline


async def _get_summary(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
) -> DashboardSummary:
    """Get overall summary statistics with $lookup to prompt_master"""

    pipeline = _build_base_pipeline_with_filters(
        base_match, llm_model, use_case, module_id, search
    )

    # Aggregate summary
    pipeline.append({
        "$group": {
            "_id": None,
            "totalCalls": {"$sum": 1},
            "totalInputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
            "totalOutputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
            "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
            "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
            "uniqueUsers": {"$addToSet": "$userId"},
        }
    })

    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)

    if not result:
        return DashboardSummary(
            totalCalls=0,
            totalTokens=0,
            totalInputTokens=0,
            totalOutputTokens=0,
            totalCost=0.0,
            avgAccuracy=None,
            avgResponseTime=0.0,
            totalUsers=0,
        )

    data = result[0]
    total_input = data.get("totalInputTokens", 0) or 0
    total_output = data.get("totalOutputTokens", 0) or 0

    return DashboardSummary(
        totalCalls=data.get("totalCalls", 0),
        totalTokens=total_input + total_output,
        totalInputTokens=total_input,
        totalOutputTokens=total_output,
        totalCost=round(data.get("totalCost", 0) or 0, 4),
        avgAccuracy=None,  # Not tracked in current schema
        avgResponseTime=round(data.get("avgResponseTime", 0) or 0, 2),
        totalUsers=len(data.get("uniqueUsers", [])),
    )


async def _get_stats_by_model(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
) -> List[ModelStats]:
    """Get statistics grouped by LLM model"""

    pipeline = _build_base_pipeline_with_filters(
        base_match, llm_model, use_case, module_id, search
    )

    pipeline.extend([
        {
            "$group": {
                "_id": {"$ifNull": ["$prompt.llm", "Unknown"]},
                "calls": {"$sum": 1},
                "inputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
                "outputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
            }
        },
        {"$sort": {"calls": -1}},
        {"$limit": 10},
    ])

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=10)

    return [
        ModelStats(
            model=r["_id"] or "Unknown",
            calls=r.get("calls", 0),
            tokens=(r.get("inputTokens", 0) or 0) + (r.get("outputTokens", 0) or 0),
            inputTokens=r.get("inputTokens", 0) or 0,
            outputTokens=r.get("outputTokens", 0) or 0,
            cost=round(r.get("cost", 0) or 0, 4),
            avgAccuracy=None,
            avgResponseTime=round(r.get("avgResponseTime", 0) or 0, 2),
        )
        for r in results
    ]


async def _get_stats_by_use_case(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
) -> List[UseCaseStats]:
    """Get statistics grouped by use case (prompt type)"""

    pipeline = _build_base_pipeline_with_filters(
        base_match, llm_model, use_case, module_id, search
    )

    pipeline.extend([
        {
            "$group": {
                "_id": {"$ifNull": ["$prompt.type", "Unknown"]},
                "calls": {"$sum": 1},
                "tokens": {
                    "$sum": {
                        "$add": [
                            {"$ifNull": ["$inputTokenCount", 0]},
                            {"$ifNull": ["$outputTokenCount", 0]}
                        ]
                    }
                },
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
            }
        },
        {"$sort": {"calls": -1}},
        {"$limit": 10},
    ])

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=10)

    return [
        UseCaseStats(
            useCase=r["_id"] or "Unknown",
            calls=r.get("calls", 0),
            tokens=r.get("tokens", 0) or 0,
            cost=round(r.get("cost", 0) or 0, 4),
            avgResponseTime=round(r.get("avgResponseTime", 0) or 0, 2),
        )
        for r in results
    ]


async def _get_trends(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    start_date: datetime,
    end_date: datetime,
    time_range: TimeRangeEnum,
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
) -> List[TrendDataPoint]:
    """
    Get trend data for token usage with appropriate granularity.
    - 1h, 24h: Hourly granularity
    - 7d, 30d, custom: Daily granularity
    Includes zero-filling for missing periods.
    """

    # Determine granularity based on time range
    is_hourly = time_range in [TimeRangeEnum.HOUR_1, TimeRangeEnum.HOUR_24]

    # Use base pipeline with filters
    pipeline = _build_base_pipeline_with_filters(
        base_match, llm_model, use_case, module_id, search
    )

    # Group by hour or day based on granularity
    if is_hourly:
        # Hourly grouping for 1h and 24h
        pipeline.extend([
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$executionDateTime"},
                        "month": {"$month": "$executionDateTime"},
                        "day": {"$dayOfMonth": "$executionDateTime"},
                        "hour": {"$hour": "$executionDateTime"},
                    },
                    "calls": {"$sum": 1},
                    "inputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
                    "outputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
                    "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1}},
        ])
    else:
        # Daily grouping for 7d, 30d, and custom
        pipeline.extend([
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$executionDateTime"},
                        "month": {"$month": "$executionDateTime"},
                        "day": {"$dayOfMonth": "$executionDateTime"},
                    },
                    "calls": {"$sum": 1},
                    "inputTokens": {"$sum": {"$ifNull": ["$inputTokenCount", 0]}},
                    "outputTokens": {"$sum": {"$ifNull": ["$outputTokenCount", 0]}},
                    "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}},
        ])

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)

    # Convert results to a dictionary for easy lookup
    data_map = {}
    for r in results:
        try:
            if is_hourly:
                ts = datetime(
                    r["_id"]["year"],
                    r["_id"]["month"],
                    r["_id"]["day"],
                    r["_id"]["hour"],
                )
            else:
                ts = datetime(
                    r["_id"]["year"],
                    r["_id"]["month"],
                    r["_id"]["day"],
                    0,  # Set hour to 0 for daily data
                )

            input_tokens = r.get("inputTokens", 0) or 0
            output_tokens = r.get("outputTokens", 0) or 0

            data_map[ts] = {
                "calls": r.get("calls", 0),
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "cost": r.get("cost", 0) or 0,
            }
        except (KeyError, ValueError):
            continue

    # Generate complete time series with zero-filling
    trends = []
    current = start_date.replace(second=0, microsecond=0)

    if is_hourly:
        # Hourly intervals: reset to start of hour
        current = current.replace(minute=0)
        delta = timedelta(hours=1)
    else:
        # Daily intervals: reset to start of day
        current = current.replace(hour=0, minute=0)
        delta = timedelta(days=1)

    while current <= end_date:
        if current in data_map:
            data = data_map[current]
            trends.append(TrendDataPoint(
                timestamp=current,
                hour=current.hour if is_hourly else 0,
                calls=data["calls"],
                tokens=data["inputTokens"] + data["outputTokens"],
                inputTokens=data["inputTokens"],
                outputTokens=data["outputTokens"],
                cost=round(data["cost"], 4),
            ))
        else:
            # Zero-fill missing periods
            trends.append(TrendDataPoint(
                timestamp=current,
                hour=current.hour if is_hourly else 0,
                calls=0,
                tokens=0,
                inputTokens=0,
                outputTokens=0,
                cost=0.0,
            ))

        current += delta

    return trends


async def _get_recent_calls(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    limit: int = 50,
) -> List[RecentCallItem]:
    """Get recent AI calls with joined prompt and user info"""

    pipeline = [
        {"$match": base_match},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "promptId",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
    ]

    if llm_model:
        pipeline.append({"$match": {"prompt.llm": {"$regex": llm_model, "$options": "i"}}})

    if use_case:
        pipeline.append({"$match": {"prompt.type": {"$regex": use_case, "$options": "i"}}})

    pipeline.extend([
        {"$sort": {"executionDateTime": -1}},
        {"$limit": limit},
        # Lookup user information
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
            "$project": {
                "_id": 1,
                "executionDateTime": 1,
                "inputTokenCount": 1,
                "outputTokenCount": 1,
                "cost": 1,
                "executionTime": 1,
                "userId": 1,
                "promptOutput": 1,
                "prompt.llm": 1,
                "prompt.type": 1,
                "prompt.name": 1,
                "user.name": 1,
            }
        }
    ])

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=limit)

    recent = []
    for r in results:
        input_tokens = r.get("inputTokenCount", 0) or 0
        output_tokens = r.get("outputTokenCount", 0) or 0
        prompt = r.get("prompt", {}) or {}
        user = r.get("user", {}) or {}

        # Determine status based on output presence
        status = "SUCCESS" if r.get("promptOutput") else "PENDING"

        recent.append(RecentCallItem(
            id=str(r["_id"]),
            timestamp=r.get("executionDateTime", datetime.now()),
            model=prompt.get("llm"),
            useCase=prompt.get("type"),
            promptName=prompt.get("name"),
            tokens=input_tokens + output_tokens,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            cost=r.get("cost"),
            responseTime=r.get("executionTime"),
            accuracy=None,  # Not tracked
            status=status,
            userId=str(r["userId"]) if r.get("userId") else None,
            userName=user.get("name"),
        ))

    return recent


async def _get_model_performance(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
) -> List[ModelPerformance]:
    """Get performance metrics per model"""

    pipeline = _build_base_pipeline_with_filters(
        base_match, llm_model, use_case, module_id, search
    )

    pipeline.extend([
        {
            "$group": {
                "_id": {"$ifNull": ["$prompt.llm", "Unknown"]},
                "avgResponseTime": {"$avg": {"$ifNull": ["$executionTime", 0]}},
                "totalTokens": {
                    "$sum": {
                        "$add": [
                            {"$ifNull": ["$inputTokenCount", 0]},
                            {"$ifNull": ["$outputTokenCount", 0]}
                        ]
                    }
                },
                "totalCost": {"$sum": {"$ifNull": ["$cost", 0]}},
                "totalCalls": {"$sum": 1},
            }
        },
        {"$sort": {"totalCalls": -1}},
        {"$limit": 10},
    ])

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=10)

    performance = []
    for r in results:
        total_tokens = r.get("totalTokens", 0) or 0
        total_cost = r.get("totalCost", 0) or 0
        total_calls = r.get("totalCalls", 1) or 1

        cost_per_token = (total_cost / total_tokens) if total_tokens > 0 else 0
        avg_tokens_per_call = total_tokens / total_calls if total_calls > 0 else 0

        performance.append(ModelPerformance(
            model=r["_id"] or "Unknown",
            avgResponseTime=round(r.get("avgResponseTime", 0) or 0, 2),
            avgTokensPerCall=round(avg_tokens_per_call, 2),
            costPerToken=round(cost_per_token, 6),
            totalCalls=total_calls,
        ))

    return performance


async def _get_cost_by_model(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
) -> List[CostByModel]:
    """Get cost breakdown by model with percentages"""

    pipeline = _build_base_pipeline_with_filters(
        base_match, llm_model, use_case, module_id, search
    )

    pipeline.extend([
        {
            "$group": {
                "_id": {"$ifNull": ["$prompt.llm", "Unknown"]},
                "cost": {"$sum": {"$ifNull": ["$cost", 0]}},
            }
        },
        {"$sort": {"cost": -1}},
    ])

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=None)

    # Calculate total cost for percentages
    total_cost = sum(r.get("cost", 0) or 0 for r in results)

    return [
        CostByModel(
            model=r["_id"] or "Unknown",
            cost=round(r.get("cost", 0) or 0, 4),
            percentage=round(((r.get("cost", 0) or 0) / total_cost * 100) if total_cost > 0 else 0, 2),
        )
        for r in results
    ]


async def _get_list_with_count(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    module_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 10,
) -> tuple[List[RecentCallItem], int]:
    """
    Get paginated list of recent AI calls with total count.
    Returns both the list items and total count for pagination.
    """
    # Calculate skip value for pagination
    skip = (page - 1) * page_size

    # Build pipeline with filters and include user/module lookups for list display
    pipeline = _build_base_pipeline_with_filters(
        base_match, llm_model, use_case, module_id, search,
        include_user_lookup=True,
        include_module_lookup=True
    )

    # Use $facet to get both count and paginated data in single query
    pipeline.append({
        "$facet": {
            "metadata": [{"$count": "total"}],
            "data": [
                {"$sort": {"executionDateTime": -1}},
                {"$skip": skip},
                {"$limit": page_size},
                {
                    "$project": {
                        "_id": 1,
                        "executionDateTime": 1,
                        "inputTokenCount": 1,
                        "outputTokenCount": 1,
                        "cost": 1,
                        "executionTime": 1,
                        "userId": 1,
                        "promptOutput": 1,
                        "prompt.llm": 1,
                        "prompt.type": 1,
                        "prompt.name": 1,
                        "prompt.moduleId": 1,
                        "user.name": 1,
                        "module.name": 1,
                    }
                }
            ]
        }
    })

    result = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=1)

    if not result:
        return [], 0

    facet_result = result[0]
    total_count = facet_result["metadata"][0]["total"] if facet_result["metadata"] else 0
    data = facet_result["data"]

    # Convert to RecentCallItem list
    items = []
    for r in data:
        input_tokens = r.get("inputTokenCount", 0) or 0
        output_tokens = r.get("outputTokenCount", 0) or 0
        prompt = r.get("prompt", {}) or {}
        user = r.get("user", {}) or {}
        module = r.get("module", {}) or {}

        # Determine status based on output presence
        status = "SUCCESS" if r.get("promptOutput") else "PENDING"

        items.append(RecentCallItem(
            id=str(r["_id"]),
            timestamp=r.get("executionDateTime", datetime.now()),
            model=prompt.get("llm"),
            useCase=prompt.get("type"),
            promptName=prompt.get("name"),
            tokens=input_tokens + output_tokens,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            cost=r.get("cost"),
            responseTime=r.get("executionTime"),
            accuracy=None,  # Not tracked
            status=status,
            userId=str(r["userId"]) if r.get("userId") else None,
            userName=user.get("name"),
            moduleId=str(prompt.get("moduleId")) if prompt.get("moduleId") else None,
            moduleName=module.get("name"),
        ))

    return items, total_count


async def get_recent_calls_data(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.HOUR_24,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    page: int = 1,
    page_size: int = 5,
) -> RecentCallsData:
    """
    Get recent AI calls with filters and pagination.
    Separate endpoint for retrieving recent execution history.
    """
    start_date, end_date = _get_time_range_filter(time_range, from_date, to_date)

    # Build base match filter
    base_match: Dict[str, Any] = {
        "isDelete": False,
        "executionDateTime": {"$gte": start_date, "$lte": end_date}
    }

    # Get total count first for pagination info
    count_pipeline = [
        {"$match": base_match},
    ]

    if llm_model or use_case:
        count_pipeline.extend([
            {
                "$lookup": {
                    "from": PROMPT_COL,
                    "localField": "promptId",
                    "foreignField": "_id",
                    "as": "prompt"
                }
            },
            {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
        ])

        if llm_model:
            count_pipeline.append({"$match": {"prompt.llm": {"$regex": llm_model, "$options": "i"}}})
        if use_case:
            count_pipeline.append({"$match": {"prompt.type": {"$regex": use_case, "$options": "i"}}})

    count_pipeline.append({"$count": "total"})

    count_result = await db[EXECUTION_COL].aggregate(count_pipeline).to_list(length=1)
    total_count = count_result[0]["total"] if count_result else 0

    # Calculate pagination
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0

    # Get recent calls with pagination using modified _get_recent_calls_paginated
    recent_calls = await _get_recent_calls_paginated(
        db, base_match, llm_model, use_case, page, page_size
    )

    return RecentCallsData(
        recentCalls=recent_calls,
        totalCount=total_count,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
    )


async def _get_recent_calls_paginated(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    llm_model: Optional[str] = None,
    use_case: Optional[str] = None,
    page: int = 1,
    page_size: int = 5,
) -> List[RecentCallItem]:
    """Get recent AI calls with pagination and user info support"""

    # Calculate skip value for pagination
    skip = (page - 1) * page_size

    pipeline = [
        {"$match": base_match},
        {
            "$lookup": {
                "from": PROMPT_COL,
                "localField": "promptId",
                "foreignField": "_id",
                "as": "prompt"
            }
        },
        {"$unwind": {"path": "$prompt", "preserveNullAndEmptyArrays": True}},
    ]

    if llm_model:
        pipeline.append({"$match": {"prompt.llm": {"$regex": llm_model, "$options": "i"}}})

    if use_case:
        pipeline.append({"$match": {"prompt.type": {"$regex": use_case, "$options": "i"}}})

    pipeline.extend([
        {"$sort": {"executionDateTime": -1}},
        {"$skip": skip},
        {"$limit": page_size},
        # Lookup user information
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
            "$project": {
                "_id": 1,
                "executionDateTime": 1,
                "inputTokenCount": 1,
                "outputTokenCount": 1,
                "cost": 1,
                "executionTime": 1,
                "userId": 1,
                "promptOutput": 1,
                "prompt.llm": 1,
                "prompt.type": 1,
                "prompt.name": 1,
                "user.name": 1,
            }
        }
    ])

    results = await db[EXECUTION_COL].aggregate(pipeline).to_list(length=page_size)

    recent = []
    for r in results:
        input_tokens = r.get("inputTokenCount", 0) or 0
        output_tokens = r.get("outputTokenCount", 0) or 0
        prompt = r.get("prompt", {}) or {}
        user = r.get("user", {}) or {}

        # Determine status based on output presence
        status = "SUCCESS" if r.get("promptOutput") else "PENDING"

        recent.append(RecentCallItem(
            id=str(r["_id"]),
            timestamp=r.get("executionDateTime", datetime.now()),
            model=prompt.get("llm"),
            useCase=prompt.get("type"),
            promptName=prompt.get("name"),
            tokens=input_tokens + output_tokens,
            inputTokens=input_tokens,
            outputTokens=output_tokens,
            cost=r.get("cost"),
            responseTime=r.get("executionTime"),
            accuracy=None,  # Not tracked
            status=status,
            userId=str(r["userId"]) if r.get("userId") else None,
            userName=user.get("name"),
        ))

    return recent
