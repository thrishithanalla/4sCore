"""
Feedback Dashboard Service
Provides aggregation and analytics for feedback monitoring dashboard.

APIs:
1. GET /feedback-dashboard - Combined stats, trend, and list
2. GET /feedback-dashboard/top-negative - Top 10 negative issues
3. GET /feedback-dashboard/negative-reports/{feedbackMasterId} - Detailed reports
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.schemas.feedback_dashboard_schema import (
    FeedbackTimeRangeEnum,
    FeedbackGranularityEnum,
    FeedbackStats,
    FeedbackStatsByComponent,
    FeedbackStatsByModule,
    FeedbackTrendPoint,
    FeedbackListItem,
    PersonnelInfo,
    FeedbackDashboardData,
    TopNegativeItem,
    TopNegativeResponse,
    SeverityLevel,
    NegativeReportDetail,
    NegativeReportsResponse,
)
from app.constants.collections import Collections
from app.utils.time_utils import get_ist_now

logger = logging.getLogger(__name__)


def _convert_objectids(obj: Any) -> Any:
    """Recursively convert all ObjectIds to strings in a dict/list structure"""
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, dict):
        return {k: _convert_objectids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_objectids(item) for item in obj]
    else:
        return obj

# Constants
RATING_THRESHOLD = 2.5  # Ratings below this are considered negative
FEEDBACK_COLL = Collections.FEEDBACKS
FEEDBACK_MASTER_COLL = Collections.FEEDBACK_MASTER
PERSONNEL_COLL = Collections.PERSONNEL_MASTER
UNIT_COLL = Collections.UNIT
MODULES_COLL = Collections.MODULES


# =============================================================================
# Helper Functions
# =============================================================================

def _parse_object_id(id_str: str) -> Optional[ObjectId]:
    """Safely parse string to ObjectId"""
    try:
        return ObjectId(id_str) if id_str else None
    except Exception:
        return None


def _get_date_range(
    time_range: FeedbackTimeRangeEnum,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> Tuple[datetime, datetime]:
    """Calculate start and end dates based on time range"""
    now = get_ist_now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if time_range == FeedbackTimeRangeEnum.TODAY:
        return today_start, now
    elif time_range == FeedbackTimeRangeEnum.YESTERDAY:
        yesterday = today_start - timedelta(days=1)
        return yesterday, today_start
    elif time_range == FeedbackTimeRangeEnum.LAST_7_DAYS:
        return today_start - timedelta(days=7), now
    elif time_range == FeedbackTimeRangeEnum.LAST_30_DAYS:
        return today_start - timedelta(days=30), now
    elif time_range == FeedbackTimeRangeEnum.THIS_MONTH:
        month_start = today_start.replace(day=1)
        return month_start, now
    elif time_range == FeedbackTimeRangeEnum.LAST_MONTH:
        month_start = today_start.replace(day=1)
        last_month_end = month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        return last_month_start, month_start
    elif time_range == FeedbackTimeRangeEnum.CUSTOM:
        if start_date and end_date:
            return start_date, end_date
        # Default to last 30 days if custom but no dates provided
        return today_start - timedelta(days=30), now
    else:
        return today_start - timedelta(days=30), now


def _get_severity(count: int) -> SeverityLevel:
    """Determine severity level based on report count"""
    if count >= 20:
        return SeverityLevel.CRITICAL
    elif count >= 10:
        return SeverityLevel.HIGH
    elif count >= 5:
        return SeverityLevel.MEDIUM
    else:
        return SeverityLevel.LOW


def _build_base_query(
    component_type: Optional[str] = None,
    module_id: Optional[str] = None,
    feedback_master_id: Optional[str] = None,
    created_by: Optional[str] = None,
    unit_id: Optional[str] = None,
    state: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    personnel_ids: Optional[List[ObjectId]] = None,
) -> Dict[str, Any]:
    """Build base MongoDB query with filters"""
    query: Dict[str, Any] = {"isDelete": {"$ne": True}}

    # Date range filter
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        if date_filter:
            query["createdAt"] = date_filter

    # Feedback master filter
    if feedback_master_id:
        fm_id = _parse_object_id(feedback_master_id)
        if fm_id:
            query["feedbackMasterId"] = fm_id

    # Created by filter
    if created_by:
        cb_id = _parse_object_id(created_by)
        if cb_id:
            query["createdBy"] = cb_id

    # Personnel IDs filter (for unit-based filtering)
    if personnel_ids:
        query["createdBy"] = {"$in": personnel_ids}

    # State filter
    if state:
        query["state"] = state

    return query


async def _get_personnel_ids_by_unit(
    db: AsyncIOMotorDatabase,
    unit_id: str
) -> List[ObjectId]:
    """Get personnel IDs belonging to a unit"""
    uid = _parse_object_id(unit_id)
    if not uid:
        return []

    cursor = db[PERSONNEL_COLL].find(
        {"unitId": uid, "isDelete": {"$ne": True}},
        {"_id": 1}
    )
    docs = await cursor.to_list(length=None)
    return [doc["_id"] for doc in docs]


async def _get_feedback_masters_map(
    db: AsyncIOMotorDatabase,
    component_type: Optional[str] = None,
    module_id: Optional[str] = None
) -> Dict[str, Dict[str, Any]]:
    """Get feedback masters as a map, optionally filtered"""
    query: Dict[str, Any] = {"isDelete": {"$ne": True}, "isActive": {"$ne": False}}

    if component_type:
        query["componentType"] = component_type

    if module_id:
        mid = _parse_object_id(module_id)
        if mid:
            query["moduleId"] = mid

    cursor = db[FEEDBACK_MASTER_COLL].find(query)
    docs = await cursor.to_list(length=None)

    return {
        str(doc["_id"]): {
            "_id": str(doc["_id"]),
            "name": doc.get("name"),
            "componentType": doc.get("componentType"),
            "moduleId": str(doc["moduleId"]) if doc.get("moduleId") else None,
        }
        for doc in docs
    }


async def _get_modules_map(db: AsyncIOMotorDatabase) -> Dict[str, str]:
    """Get modules as ID -> name map"""
    cursor = db[MODULES_COLL].find(
        {"isDelete": {"$ne": True}},
        {"_id": 1, "name": 1}
    )
    docs = await cursor.to_list(length=None)
    return {str(doc["_id"]): doc.get("name", "") for doc in docs}


async def _get_personnel_info(
    db: AsyncIOMotorDatabase,
    personnel_id: ObjectId
) -> Optional[PersonnelInfo]:
    """Get personnel information with unit details"""
    personnel = await db[PERSONNEL_COLL].find_one(
        {"_id": personnel_id, "isDelete": {"$ne": True}}
    )
    if not personnel:
        return None

    # Get unit info - check both direct unitId and units array
    unit_id = personnel.get("unitId")
    if not unit_id and personnel.get("units") and len(personnel["units"]) > 0:
        unit_id = personnel["units"][0].get("unitId")

    unit_name = None
    district_name = None
    if unit_id:
        unit = await db[UNIT_COLL].find_one({"_id": unit_id})
        if unit:
            unit_name = unit.get("name")
            district_name = unit.get("districtName")

    # Build name - check 'name' field first, then firstName/lastName
    name = personnel.get("name")
    if not name:
        name_parts = []
        if personnel.get("firstName"):
            name_parts.append(personnel["firstName"])
        if personnel.get("lastName"):
            name_parts.append(personnel["lastName"])
        name = " ".join(name_parts) if name_parts else None

    return PersonnelInfo(
        personnelId=str(personnel["_id"]),
        name=name,
        rank=personnel.get("rankName"),
        unitId=str(unit_id) if unit_id else None,
        unitName=unit_name,
        districtName=district_name,
    )


async def _bulk_get_personnel_info(
    db: AsyncIOMotorDatabase,
    personnel_ids: List[ObjectId]
) -> Dict[str, PersonnelInfo]:
    """Bulk get personnel info to avoid N+1 queries"""
    if not personnel_ids:
        return {}

    # Get personnel
    cursor = db[PERSONNEL_COLL].find(
        {"_id": {"$in": personnel_ids}, "isDelete": {"$ne": True}}
    )
    personnel_docs = await cursor.to_list(length=None)

    # Get unique unit IDs - check both direct unitId and units array
    unit_ids = set()
    for doc in personnel_docs:
        unit_id = doc.get("unitId")
        if not unit_id and doc.get("units") and len(doc["units"]) > 0:
            unit_id = doc["units"][0].get("unitId")
        if unit_id:
            unit_ids.add(unit_id)

    # Get units
    units_map = {}
    if unit_ids:
        unit_cursor = db[UNIT_COLL].find({"_id": {"$in": list(unit_ids)}})
        unit_docs = await unit_cursor.to_list(length=None)
        units_map = {
            str(u["_id"]): {"name": u.get("name"), "districtName": u.get("districtName")}
            for u in unit_docs
        }

    # Build result
    result = {}
    for p in personnel_docs:
        pid = str(p["_id"])

        # Get unit ID - check both direct unitId and units array
        unit_id = p.get("unitId")
        if not unit_id and p.get("units") and len(p["units"]) > 0:
            unit_id = p["units"][0].get("unitId")

        unit_id_str = str(unit_id) if unit_id else None
        unit_info = units_map.get(unit_id_str, {}) if unit_id_str else {}

        # Build name - check 'name' field first, then firstName/lastName
        name = p.get("name")
        if not name:
            name_parts = []
            if p.get("firstName"):
                name_parts.append(p["firstName"])
            if p.get("lastName"):
                name_parts.append(p["lastName"])
            name = " ".join(name_parts) if name_parts else None

        result[pid] = PersonnelInfo(
            personnelId=pid,
            name=name,
            rank=p.get("rankName"),
            unitId=unit_id_str,
            unitName=unit_info.get("name"),
            districtName=unit_info.get("districtName"),
        )

    return result


# =============================================================================
# Main Dashboard API
# =============================================================================

async def get_feedback_dashboard(
    db: AsyncIOMotorDatabase,
    time_range: FeedbackTimeRangeEnum = FeedbackTimeRangeEnum.LAST_30_DAYS,
    granularity: FeedbackGranularityEnum = FeedbackGranularityEnum.DAILY,
    component_type: Optional[str] = None,
    module_id: Optional[str] = None,
    feedback_master_id: Optional[str] = None,
    created_by: Optional[str] = None,
    unit_id: Optional[str] = None,
    state: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 20,
) -> FeedbackDashboardData:
    """
    Get combined feedback dashboard data including:
    - Overall stats
    - Stats by component type
    - Stats by module
    - Trend data for graphs
    - Recent feedback list with personnel details
    """
    # Calculate date range
    range_start, range_end = _get_date_range(time_range, start_date, end_date)

    # Get personnel IDs if filtering by unit
    personnel_ids = None
    if unit_id:
        personnel_ids = await _get_personnel_ids_by_unit(db, unit_id)
        if not personnel_ids:
            # No personnel in unit, return empty data
            return FeedbackDashboardData(
                stats=FeedbackStats(),
                statsByComponent=[],
                statsByModule=[],
                trend=[],
                recentFeedback=[],
                pagination={"page": page, "pageSize": page_size, "totalItems": 0, "totalPages": 0}
            )

    # Get feedback masters filtered by component_type and module_id
    feedback_masters_map = await _get_feedback_masters_map(db, component_type, module_id)

    # If filtering by component_type or module_id, we need to filter by feedback_master_ids
    feedback_master_ids = None
    if component_type or module_id:
        feedback_master_ids = [ObjectId(fm_id) for fm_id in feedback_masters_map.keys()]
        if not feedback_master_ids:
            return FeedbackDashboardData(
                stats=FeedbackStats(),
                statsByComponent=[],
                statsByModule=[],
                trend=[],
                recentFeedback=[],
                pagination={"page": page, "pageSize": page_size, "totalItems": 0, "totalPages": 0}
            )

    # Build base query
    base_query = _build_base_query(
        feedback_master_id=feedback_master_id,
        created_by=created_by,
        state=state,
        start_date=range_start,
        end_date=range_end,
        personnel_ids=personnel_ids,
    )

    # Add feedback master IDs filter if needed
    if feedback_master_ids:
        base_query["feedbackMasterId"] = {"$in": feedback_master_ids}

    # Get modules map
    modules_map = await _get_modules_map(db)

    # Fetch all feedback masters for lookups
    all_feedback_masters = await _get_feedback_masters_map(db)

    # 1. Get overall stats using aggregation
    stats = await _get_overall_stats(db, base_query)

    # 2. Get stats by component type
    stats_by_component = await _get_stats_by_component(db, base_query, all_feedback_masters)

    # 3. Get stats by module
    stats_by_module = await _get_stats_by_module(db, base_query, all_feedback_masters, modules_map)

    # 4. Get trend data
    trend = await _get_trend_data(db, base_query, granularity, range_start, range_end)

    # 5. Get recent feedback list with pagination
    recent_feedback, total_items = await _get_recent_feedback(
        db, base_query, all_feedback_masters, modules_map, page, page_size
    )

    # Calculate pagination
    total_pages = (total_items + page_size - 1) // page_size if total_items > 0 else 0

    return FeedbackDashboardData(
        stats=stats,
        statsByComponent=stats_by_component,
        statsByModule=stats_by_module,
        trend=trend,
        recentFeedback=recent_feedback,
        pagination={
            "page": page,
            "pageSize": page_size,
            "totalItems": total_items,
            "totalPages": total_pages
        }
    )


async def _get_overall_stats(
    db: AsyncIOMotorDatabase,
    base_query: Dict[str, Any]
) -> FeedbackStats:
    """Get overall feedback statistics"""
    pipeline = [
        {"$match": base_query},
        {
            "$group": {
                "_id": None,
                "totalFeedback": {"$sum": 1},
                "likedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", True]}, 1, 0]}
                },
                "dislikedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", False]}, 1, 0]}
                },
                "neutralCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", None]}, 1, 0]}
                },
                "totalRating": {"$sum": {"$ifNull": ["$rating", 0]}},
                "ratingCount": {
                    "$sum": {"$cond": [{"$ne": ["$rating", None]}, 1, 0]}
                }
            }
        }
    ]

    cursor = db[FEEDBACK_COLL].aggregate(pipeline)
    results = await cursor.to_list(length=1)

    if not results:
        return FeedbackStats()

    r = results[0]
    total = r.get("totalFeedback", 0)
    liked = r.get("likedCount", 0)
    disliked = r.get("dislikedCount", 0)
    neutral = r.get("neutralCount", 0)
    rating_count = r.get("ratingCount", 0)
    total_rating = r.get("totalRating", 0)

    avg_rating = round(total_rating / rating_count, 2) if rating_count > 0 else None
    like_pct = round((liked / total) * 100, 1) if total > 0 else 0.0
    dislike_pct = round((disliked / total) * 100, 1) if total > 0 else 0.0

    return FeedbackStats(
        totalFeedback=total,
        likedCount=liked,
        dislikedCount=disliked,
        neutralCount=neutral,
        averageRating=avg_rating,
        likePercentage=like_pct,
        dislikePercentage=dislike_pct
    )


async def _get_stats_by_component(
    db: AsyncIOMotorDatabase,
    base_query: Dict[str, Any],
    feedback_masters_map: Dict[str, Dict[str, Any]]
) -> List[FeedbackStatsByComponent]:
    """Get stats breakdown by component type"""
    pipeline = [
        {"$match": base_query},
        {
            "$group": {
                "_id": "$feedbackMasterId",
                "totalFeedback": {"$sum": 1},
                "likedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", True]}, 1, 0]}
                },
                "dislikedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", False]}, 1, 0]}
                },
                "totalRating": {"$sum": {"$ifNull": ["$rating", 0]}},
                "ratingCount": {
                    "$sum": {"$cond": [{"$ne": ["$rating", None]}, 1, 0]}
                }
            }
        }
    ]

    cursor = db[FEEDBACK_COLL].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    # Group by component type
    component_stats: Dict[str, Dict[str, Any]] = {}
    for r in results:
        fm_id = str(r["_id"]) if r.get("_id") else None
        fm = feedback_masters_map.get(fm_id, {})
        comp_type = fm.get("componentType", "unknown")

        if comp_type not in component_stats:
            component_stats[comp_type] = {
                "totalFeedback": 0,
                "likedCount": 0,
                "dislikedCount": 0,
                "totalRating": 0,
                "ratingCount": 0
            }

        component_stats[comp_type]["totalFeedback"] += r.get("totalFeedback", 0)
        component_stats[comp_type]["likedCount"] += r.get("likedCount", 0)
        component_stats[comp_type]["dislikedCount"] += r.get("dislikedCount", 0)
        component_stats[comp_type]["totalRating"] += r.get("totalRating", 0)
        component_stats[comp_type]["ratingCount"] += r.get("ratingCount", 0)

    # Convert to response format
    result = []
    for comp_type, stats in component_stats.items():
        avg_rating = None
        if stats["ratingCount"] > 0:
            avg_rating = round(stats["totalRating"] / stats["ratingCount"], 2)

        result.append(FeedbackStatsByComponent(
            componentType=comp_type,
            totalFeedback=stats["totalFeedback"],
            likedCount=stats["likedCount"],
            dislikedCount=stats["dislikedCount"],
            averageRating=avg_rating
        ))

    return sorted(result, key=lambda x: x.totalFeedback, reverse=True)


async def _get_stats_by_module(
    db: AsyncIOMotorDatabase,
    base_query: Dict[str, Any],
    feedback_masters_map: Dict[str, Dict[str, Any]],
    modules_map: Dict[str, str]
) -> List[FeedbackStatsByModule]:
    """Get stats breakdown by module"""
    pipeline = [
        {"$match": base_query},
        {
            "$group": {
                "_id": "$feedbackMasterId",
                "totalFeedback": {"$sum": 1},
                "likedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", True]}, 1, 0]}
                },
                "dislikedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", False]}, 1, 0]}
                },
                "totalRating": {"$sum": {"$ifNull": ["$rating", 0]}},
                "ratingCount": {
                    "$sum": {"$cond": [{"$ne": ["$rating", None]}, 1, 0]}
                }
            }
        }
    ]

    cursor = db[FEEDBACK_COLL].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    # Group by module
    module_stats: Dict[str, Dict[str, Any]] = {}
    for r in results:
        fm_id = str(r["_id"]) if r.get("_id") else None
        fm = feedback_masters_map.get(fm_id, {})
        module_id = fm.get("moduleId")

        if not module_id:
            module_id = "unknown"

        if module_id not in module_stats:
            module_stats[module_id] = {
                "moduleName": modules_map.get(module_id, "Unknown"),
                "totalFeedback": 0,
                "likedCount": 0,
                "dislikedCount": 0,
                "totalRating": 0,
                "ratingCount": 0
            }

        module_stats[module_id]["totalFeedback"] += r.get("totalFeedback", 0)
        module_stats[module_id]["likedCount"] += r.get("likedCount", 0)
        module_stats[module_id]["dislikedCount"] += r.get("dislikedCount", 0)
        module_stats[module_id]["totalRating"] += r.get("totalRating", 0)
        module_stats[module_id]["ratingCount"] += r.get("ratingCount", 0)

    # Convert to response format
    result = []
    for module_id, stats in module_stats.items():
        avg_rating = None
        if stats["ratingCount"] > 0:
            avg_rating = round(stats["totalRating"] / stats["ratingCount"], 2)

        result.append(FeedbackStatsByModule(
            moduleId=module_id,
            moduleName=stats["moduleName"],
            totalFeedback=stats["totalFeedback"],
            likedCount=stats["likedCount"],
            dislikedCount=stats["dislikedCount"],
            averageRating=avg_rating
        ))

    return sorted(result, key=lambda x: x.totalFeedback, reverse=True)


async def _get_trend_data(
    db: AsyncIOMotorDatabase,
    base_query: Dict[str, Any],
    granularity: FeedbackGranularityEnum,
    start_date: datetime,
    end_date: datetime
) -> List[FeedbackTrendPoint]:
    """Get trend data for graphs"""
    # Build date grouping based on granularity
    if granularity == FeedbackGranularityEnum.HOURLY:
        date_group = {
            "year": {"$year": "$createdAt"},
            "month": {"$month": "$createdAt"},
            "day": {"$dayOfMonth": "$createdAt"},
            "hour": {"$hour": "$createdAt"}
        }
        date_format = "%Y-%m-%d %H:00"
    elif granularity == FeedbackGranularityEnum.DAILY:
        date_group = {
            "year": {"$year": "$createdAt"},
            "month": {"$month": "$createdAt"},
            "day": {"$dayOfMonth": "$createdAt"}
        }
        date_format = "%Y-%m-%d"
    elif granularity == FeedbackGranularityEnum.WEEKLY:
        date_group = {
            "year": {"$year": "$createdAt"},
            "week": {"$week": "$createdAt"}
        }
        date_format = "%Y-W%W"
    else:  # MONTHLY
        date_group = {
            "year": {"$year": "$createdAt"},
            "month": {"$month": "$createdAt"}
        }
        date_format = "%Y-%m"

    pipeline = [
        {"$match": base_query},
        {
            "$group": {
                "_id": date_group,
                "totalFeedback": {"$sum": 1},
                "likedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", True]}, 1, 0]}
                },
                "dislikedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", False]}, 1, 0]}
                },
                "neutralCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", None]}, 1, 0]}
                },
                "totalRating": {"$sum": {"$ifNull": ["$rating", 0]}},
                "ratingCount": {
                    "$sum": {"$cond": [{"$ne": ["$rating", None]}, 1, 0]}
                }
            }
        },
        {"$sort": {"_id": 1}}
    ]

    cursor = db[FEEDBACK_COLL].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    trend_data = []
    for r in results:
        # Reconstruct timestamp from grouping
        _id = r["_id"]
        if granularity == FeedbackGranularityEnum.HOURLY:
            ts = datetime(
                year=_id.get("year", 2024),
                month=_id.get("month", 1),
                day=_id.get("day", 1),
                hour=_id.get("hour", 0)
            )
            date_str = ts.strftime(date_format)
        elif granularity == FeedbackGranularityEnum.DAILY:
            ts = datetime(
                year=_id.get("year", 2024),
                month=_id.get("month", 1),
                day=_id.get("day", 1)
            )
            date_str = ts.strftime(date_format)
        elif granularity == FeedbackGranularityEnum.WEEKLY:
            # Approximate - first day of the week
            ts = datetime(
                year=_id.get("year", 2024),
                month=1,
                day=1
            ) + timedelta(weeks=_id.get("week", 0))
            date_str = f"{_id.get('year')}-W{_id.get('week', 0):02d}"
        else:  # MONTHLY
            ts = datetime(
                year=_id.get("year", 2024),
                month=_id.get("month", 1),
                day=1
            )
            date_str = ts.strftime(date_format)

        avg_rating = None
        if r.get("ratingCount", 0) > 0:
            avg_rating = round(r["totalRating"] / r["ratingCount"], 2)

        trend_data.append(FeedbackTrendPoint(
            timestamp=ts,
            date=date_str,
            totalFeedback=r.get("totalFeedback", 0),
            likedCount=r.get("likedCount", 0),
            dislikedCount=r.get("dislikedCount", 0),
            neutralCount=r.get("neutralCount", 0),
            averageRating=avg_rating
        ))

    return trend_data


async def _get_recent_feedback(
    db: AsyncIOMotorDatabase,
    base_query: Dict[str, Any],
    feedback_masters_map: Dict[str, Dict[str, Any]],
    modules_map: Dict[str, str],
    page: int,
    page_size: int
) -> Tuple[List[FeedbackListItem], int]:
    """Get recent feedback list with personnel details"""
    # Get total count
    total = await db[FEEDBACK_COLL].count_documents(base_query)

    # Get paginated results
    skip = (page - 1) * page_size
    cursor = db[FEEDBACK_COLL].find(base_query).sort("createdAt", -1).skip(skip).limit(page_size)
    docs = await cursor.to_list(length=None)

    if not docs:
        return [], total

    # Get unique personnel IDs
    personnel_ids = list(set(
        doc["createdBy"] for doc in docs if doc.get("createdBy")
    ))

    # Bulk fetch personnel info
    personnel_map = await _bulk_get_personnel_info(db, personnel_ids)

    # Build response
    result = []
    for doc in docs:
        fm_id = str(doc["feedbackMasterId"]) if doc.get("feedbackMasterId") else None
        fm = feedback_masters_map.get(fm_id, {})
        module_id = fm.get("moduleId")

        # Get personnel info
        personnel = None
        if doc.get("createdBy"):
            personnel = personnel_map.get(str(doc["createdBy"]))

        # Convert userFeedback to ensure no ObjectIds remain
        user_feedback = _convert_objectids(doc.get("userFeedback"))

        result.append(FeedbackListItem(
            _id=str(doc["_id"]),
            feedbackMasterId=fm_id or "",
            feedbackMasterName=fm.get("name"),
            componentType=fm.get("componentType"),
            moduleId=module_id,
            moduleName=modules_map.get(module_id) if module_id else None,
            isLiked=doc.get("isLiked"),
            rating=doc.get("rating"),
            comment=doc.get("comment"),
            quickFeedback=doc.get("quickFeedback"),
            state=doc.get("state"),
            userFeedback=user_feedback,
            personnel=personnel,
            createdAt=doc.get("createdAt")
        ))

    return result, total


# =============================================================================
# Top Negative Feedback API
# =============================================================================

async def get_top_negative_feedback(
    db: AsyncIOMotorDatabase,
    time_range: FeedbackTimeRangeEnum = FeedbackTimeRangeEnum.LAST_30_DAYS,
    component_type: Optional[str] = None,
    module_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 10,
    rating_threshold: float = RATING_THRESHOLD
) -> TopNegativeResponse:
    """
    Get top negative feedback items grouped by feedbackMasterId.
    Negative = isLiked=false OR rating < threshold
    """
    # Calculate date range
    range_start, range_end = _get_date_range(time_range, start_date, end_date)

    # Get personnel IDs if filtering by unit
    personnel_ids = None
    if unit_id:
        personnel_ids = await _get_personnel_ids_by_unit(db, unit_id)
        if not personnel_ids:
            return TopNegativeResponse(items=[], totalNegativeFeedback=0, ratingThreshold=rating_threshold)

    # Get feedback masters filtered
    feedback_masters_map = await _get_feedback_masters_map(db, component_type, module_id)
    feedback_master_ids = [ObjectId(fm_id) for fm_id in feedback_masters_map.keys()] if (component_type or module_id) else None

    # Get modules map
    modules_map = await _get_modules_map(db)

    # Build query for negative feedback
    base_query: Dict[str, Any] = {
        "isDelete": {"$ne": True},
        "createdAt": {"$gte": range_start, "$lte": range_end},
        "$or": [
            {"isLiked": False},
            {"rating": {"$lt": rating_threshold, "$ne": None}}
        ]
    }

    if personnel_ids:
        base_query["createdBy"] = {"$in": personnel_ids}

    if feedback_master_ids:
        base_query["feedbackMasterId"] = {"$in": feedback_master_ids}

    # Aggregation pipeline
    pipeline = [
        {"$match": base_query},
        {
            "$group": {
                "_id": "$feedbackMasterId",
                "totalReports": {"$sum": 1},
                "dislikedCount": {
                    "$sum": {"$cond": [{"$eq": ["$isLiked", False]}, 1, 0]}
                },
                "lowRatingCount": {
                    "$sum": {
                        "$cond": [
                            {"$and": [
                                {"$ne": ["$rating", None]},
                                {"$lt": ["$rating", rating_threshold]}
                            ]},
                            1, 0
                        ]
                    }
                },
                "totalRating": {"$sum": {"$ifNull": ["$rating", 0]}},
                "ratingCount": {
                    "$sum": {"$cond": [{"$ne": ["$rating", None]}, 1, 0]}
                }
            }
        },
        {"$sort": {"totalReports": -1}},
        {"$limit": limit}
    ]

    cursor = db[FEEDBACK_COLL].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    # Get all feedback masters if not already filtered
    if not feedback_masters_map:
        feedback_masters_map = await _get_feedback_masters_map(db)

    # Build response
    items = []
    total_negative = 0

    for r in results:
        fm_id = str(r["_id"]) if r.get("_id") else None
        fm = feedback_masters_map.get(fm_id, {})
        module_id_val = fm.get("moduleId")

        total_reports = r.get("totalReports", 0)
        total_negative += total_reports

        avg_rating = None
        if r.get("ratingCount", 0) > 0:
            avg_rating = round(r["totalRating"] / r["ratingCount"], 2)

        items.append(TopNegativeItem(
            feedbackMasterId=fm_id or "",
            feedbackMasterName=fm.get("name", "Unknown"),
            componentType=fm.get("componentType", "unknown"),
            moduleId=module_id_val,
            moduleName=modules_map.get(module_id_val) if module_id_val else None,
            totalReports=total_reports,
            dislikedCount=r.get("dislikedCount", 0),
            lowRatingCount=r.get("lowRatingCount", 0),
            averageRating=avg_rating,
            severity=_get_severity(total_reports),
            status="OPEN"
        ))

    return TopNegativeResponse(
        items=items,
        totalNegativeFeedback=total_negative,
        ratingThreshold=rating_threshold
    )


# =============================================================================
# Negative Reports Detail API
# =============================================================================

async def get_negative_reports_detail(
    db: AsyncIOMotorDatabase,
    feedback_master_id: str,
    time_range: FeedbackTimeRangeEnum = FeedbackTimeRangeEnum.LAST_30_DAYS,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    page: int = 1,
    page_size: int = 20,
    rating_threshold: float = RATING_THRESHOLD
) -> NegativeReportsResponse:
    """
    Get detailed negative reports for a specific feedbackMasterId.
    """
    # Validate feedback_master_id
    fm_oid = _parse_object_id(feedback_master_id)
    if not fm_oid:
        return NegativeReportsResponse(
            feedbackMasterId=feedback_master_id,
            feedbackMasterName="Unknown",
            componentType="unknown",
            totalReports=0,
            reports=[],
            page=page,
            pageSize=page_size,
            totalPages=0
        )

    # Get feedback master info
    fm = await db[FEEDBACK_MASTER_COLL].find_one({"_id": fm_oid})
    if not fm:
        return NegativeReportsResponse(
            feedbackMasterId=feedback_master_id,
            feedbackMasterName="Unknown",
            componentType="unknown",
            totalReports=0,
            reports=[],
            page=page,
            pageSize=page_size,
            totalPages=0
        )

    # Get module name
    module_name = None
    if fm.get("moduleId"):
        module = await db[MODULES_COLL].find_one({"_id": fm["moduleId"]})
        if module:
            module_name = module.get("name")

    # Calculate date range
    range_start, range_end = _get_date_range(time_range, start_date, end_date)

    # Build query for negative feedback for this feedback master
    query: Dict[str, Any] = {
        "feedbackMasterId": fm_oid,
        "isDelete": {"$ne": True},
        "createdAt": {"$gte": range_start, "$lte": range_end},
        "$or": [
            {"isLiked": False},
            {"rating": {"$lt": rating_threshold, "$ne": None}}
        ]
    }

    # Get total count
    total = await db[FEEDBACK_COLL].count_documents(query)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    # Get paginated results
    skip = (page - 1) * page_size
    cursor = db[FEEDBACK_COLL].find(query).sort("createdAt", -1).skip(skip).limit(page_size)
    docs = await cursor.to_list(length=None)

    # Calculate average rating
    avg_rating = None
    if docs:
        ratings = [d["rating"] for d in docs if d.get("rating") is not None]
        if ratings:
            avg_rating = round(sum(ratings) / len(ratings), 2)

    # Get personnel info
    personnel_ids = list(set(doc["createdBy"] for doc in docs if doc.get("createdBy")))
    personnel_map = await _bulk_get_personnel_info(db, personnel_ids)

    # Build reports
    reports = []
    for doc in docs:
        personnel = None
        if doc.get("createdBy"):
            personnel = personnel_map.get(str(doc["createdBy"]))

        # Convert userFeedback to ensure no ObjectIds remain
        user_feedback = _convert_objectids(doc.get("userFeedback"))

        reports.append(NegativeReportDetail(
            _id=str(doc["_id"]),
            personnel=personnel,
            isLiked=doc.get("isLiked"),
            rating=doc.get("rating"),
            comment=doc.get("comment"),
            quickFeedback=doc.get("quickFeedback"),
            state=doc.get("state"),
            userFeedback=user_feedback,
            createdAt=doc.get("createdAt")
        ))

    return NegativeReportsResponse(
        feedbackMasterId=feedback_master_id,
        feedbackMasterName=fm.get("name", "Unknown"),
        componentType=fm.get("componentType", "unknown"),
        moduleId=str(fm["moduleId"]) if fm.get("moduleId") else None,
        moduleName=module_name,
        totalReports=total,
        averageRating=avg_rating,
        reports=reports,
        page=page,
        pageSize=page_size,
        totalPages=total_pages
    )
