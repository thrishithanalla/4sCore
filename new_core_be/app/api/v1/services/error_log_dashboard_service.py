"""
Error Log Dashboard Service.

This module provides aggregation and analytics logic for the error log
dashboard endpoint. It generates statistics, trends, and insights from
error log data to support monitoring and decision-making.

Key Features:
    - Summary statistics (total errors, by severity, by type)
    - Trend analysis over configurable time ranges
    - Error pattern detection and categorization
    - Impact analysis for prioritization
    - Source type breakdown (dynamic from 'sourceType' valueSet)

Dashboard Components:
    - DashboardSummary: Overall error counts and rates
    - SeverityStats: Error distribution by severity level
    - TypeStats: Error distribution by error type (dynamic from valueSet)
    - TrendDataPoint: Time-series data for charts (sourceTypes from valueSet)
    - PatternItem: Detected error patterns
    - ImpactAnalysis: Business impact assessment

Time Range Options:
    - 1 hour, 24 hours, 7 days, 30 days, custom range

Usage:
    from app.api.v1.services.error_log_dashboard_service import get_dashboard_data

    dashboard = await get_dashboard_data(db, time_range, from_date, to_date)
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.constants.collections import Collections
from app.api.v1.schemas.error_log_dashboard_schema import (
    DashboardData,
    DashboardSummary,
    ErrorGroupItem,
    ImpactAnalysis,
    ImpactLevel,
    PaginationInfo,
    PatternItem,
    SeverityStats,
    TimeRangeEnum,
    TrendDataPoint,
    TypeStats,
)
from app.utils.time_utils import get_ist_now
from app.core.value_sets import normalize_code, get_all_codes

# Collection names
HOT_COL = Collections.ERROR_LOGS
ARCHIVE_COL = "error_logs_archive"

# Pattern definitions: pattern_name -> list of regex patterns to match error codes
PATTERN_DEFINITIONS = {
    "Database Connection Issues": [
        r"ERR\..*DB.*",
        r"ERR\..*DATABASE.*",
        r"ERR\..*CONNECTION.*",
        r"ERR\..*MONGO.*",
        r"ERR\..*SQL.*",
    ],
    "File Upload Failures": [
        r"ERR\..*UPLOAD.*",
        r"ERR\..*FILE.*",
        r"ERR\..*ATTACHMENT.*",
    ],
    "API Timeouts": [
        r"ERR\..*TIMEOUT.*",
        r"ERR\..*API.*TIMEOUT.*",
        r"ERR\..*REQUEST.*TIMEOUT.*",
    ],
    "Data Parsing Errors": [
        r"ERR\..*PARSE.*",
        r"ERR\..*VALIDATION.*",
        r"ERR\..*FORMAT.*",
        r"ERR\..*INVALID.*",
    ],
    "Authentication Issues": [
        r"ERR\.AUTH\..*",
        r"ERR\..*LOGIN.*",
        r"ERR\..*TOKEN.*",
        r"ERR\..*SESSION.*",
    ],
    "Third-party Service Failures": [
        r"ERR\..*THIRDPARTY.*",
        r"ERR\..*EXTERNAL.*",
        r"ERR\..*INTEGRATION.*",
        r"ERR\..*WHATSAPP.*",
        r"ERR\..*SMS.*",
    ],
    "Memory Leaks": [
        r"ERR\..*MEMORY.*",
        r"ERR\..*HEAP.*",
        r"ERR\..*OOM.*",
    ],
    "Network Errors": [
        r"ERR\..*NETWORK.*",
        r"ERR\..*CONNECTIVITY.*",
        r"ERR\..*SOCKET.*",
    ],
}

# Compile patterns for performance
COMPILED_PATTERNS: Dict[str, List[re.Pattern]] = {
    name: [re.compile(p, re.IGNORECASE) for p in patterns]
    for name, patterns in PATTERN_DEFINITIONS.items()
}


def _get_time_range(
    time_range: TimeRangeEnum,
    from_date: Optional[datetime],
    to_date: Optional[datetime],
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Calculate from/to dates based on time range enum.

    Note: eventDateTime is stored as IST time (naive datetime with IST values).
    So we use get_ist_now() to get current IST time for filtering.

    Returns (None, None) for ALL time range to indicate no time filtering.
    """
    now = get_ist_now()

    # ALL: No time filtering - return all logs
    if time_range == TimeRangeEnum.ALL:
        return None, None

    range_map = {
        TimeRangeEnum.HOUR_1: timedelta(hours=1),
        TimeRangeEnum.HOUR_24: timedelta(hours=24),
        TimeRangeEnum.DAY_7: timedelta(days=7),
        TimeRangeEnum.DAY_30: timedelta(days=30),
    }

    delta = range_map.get(time_range, timedelta(hours=24))
    return now - delta, now


def _match_pattern(error_code: str) -> Optional[str]:
    """Match error code to a pattern name"""
    for pattern_name, compiled_list in COMPILED_PATTERNS.items():
        for pattern in compiled_list:
            if pattern.match(error_code):
                return pattern_name
    return None


async def _get_collections(
    db: AsyncIOMotorDatabase,
    include_archive: bool
) -> List[str]:
    """Get list of collections to query"""
    collections = [HOT_COL]
    if include_archive:
        collections.append(ARCHIVE_COL)
    return collections


async def _aggregate_across_collections(
    db: AsyncIOMotorDatabase,
    pipeline: List[Dict[str, Any]],
    collections: List[str],
) -> List[Dict[str, Any]]:
    """Run aggregation across multiple collections and combine results"""
    all_results = []
    for col in collections:
        cursor = db[col].aggregate(pipeline)
        results = await cursor.to_list(length=None)
        all_results.extend(results)
    return all_results


async def get_dashboard_data(
    db: AsyncIOMotorDatabase,
    time_range: TimeRangeEnum = TimeRangeEnum.ALL,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    source_type: Optional[str] = None,
    error_severity: Optional[str] = None,
    error_code: Optional[str] = None,
    module_id: Optional[str] = None,
    include_archive: bool = False,
    page: int = 1,
    limit: int = 50,
) -> DashboardData:
    """
    Get complete dashboard data with all statistics, trends, and patterns.

    Args:
        db: Database connection
        time_range: Time range enum for filtering
        from_date: Optional start date
        to_date: Optional end date
        source_type: Optional source type filter
        error_severity: Optional severity filter
        error_code: Optional error code filter (e.g., ERR.CORE.DEPARTMENT.CREATE.DUPLICATE_NAME)
        module_id: Optional module ID filter (filters error codes by their moduleId in error_master)
        include_archive: Whether to include archived logs
        page: Page number for error groups pagination
        limit: Number of error groups per page
    """
    # Calculate time range
    start_date, end_date = _get_time_range(time_range, from_date, to_date)

    # Get collections to query
    collections = await _get_collections(db, include_archive)

    # Validate and normalize sourceType against valueSet
    normalized_source_type = None
    if source_type:
        normalized_source_type = await normalize_code(db, "sourceType", source_type)

    # Validate and normalize errorSeverity against valueSet
    normalized_severity = None
    if error_severity:
        normalized_severity = await normalize_code(db, "errorSeverity", error_severity)

    # Build base match filter for filtered data (with time and optional filters)
    base_match: Dict[str, Any] = {}
    if start_date is not None and end_date is not None:
        base_match["eventDateTime"] = {"$gte": start_date, "$lte": end_date}
    if normalized_source_type:
        base_match["sourceType"] = normalized_source_type
    if normalized_severity:
        base_match["errorSeverity"] = normalized_severity
    if error_code:
        # Use regex for partial/contains search (case-insensitive)
        # Escape special regex characters in the error_code
        escaped_error_code = re.escape(error_code)
        base_match["errorCode"] = {"$regex": escaped_error_code, "$options": "i"}

    # If moduleId is provided, filter by error codes that belong to this module
    if module_id:
        module_object_id = ObjectId(module_id) if ObjectId.is_valid(module_id) else module_id
        # Use distinct() for faster retrieval of unique error codes
        error_codes_for_module = await db[Collections.ERROR_MASTER].distinct(
            "errorCode",
            {"moduleId": module_object_id, "isDelete": False}
        )

        if error_codes_for_module:
            if error_code:
                # Combine with existing errorCode filter - filter module codes by regex pattern
                escaped_error_code = re.escape(error_code)
                pattern = re.compile(escaped_error_code, re.IGNORECASE)
                matching_codes = [code for code in error_codes_for_module if pattern.search(code)]
                if matching_codes:
                    base_match["errorCode"] = {"$in": matching_codes}
                else:
                    base_match["errorCode"] = {"$in": []}
            else:
                base_match["errorCode"] = {"$in": error_codes_for_module}
        else:
            base_match["errorCode"] = {"$in": []}

    # Build match filter for severity stats - NO FILTERS AT ALL
    # This ensures bySeverity always shows counts from ALL data in the database
    # regardless of any filters applied (time, sourceType, errorCode, errorSeverity)
    severity_match: Dict[str, Any] = {}

    # Get available sourceTypes and severityLevels from valueSets
    source_types_set = await get_all_codes(db, "sourceType")
    severity_levels_set = await get_all_codes(db, "errorSeverity")
    # Convert to sorted lists (uppercase for consistency)
    source_types_list = sorted([st.upper() for st in source_types_set])
    severity_levels_list = sorted(severity_levels_set)

    # Run all aggregations
    summary = await _get_summary(db, base_match, collections)
    by_type = await _get_stats_by_type(db, base_match, collections)
    # Use severity_match for bySeverity to always show all 4 levels
    by_severity = await _get_stats_by_severity(db, severity_match, collections)
    trends = await _get_trends(db, base_match, collections)
    # Get paginated error groups
    error_groups, pagination = await _get_error_groups_paginated(
        db, base_match, collections, page, limit
    )
    patterns = await _get_patterns(db, base_match, collections, start_date, end_date)
    impact = await _get_impact_analysis(db, base_match, collections, summary.totalErrors)
    top_users = await _get_top_users(db, base_match, collections)

    return DashboardData(
        sourceTypes=source_types_list,
        severityLevels=severity_levels_list,
        summary=summary,
        byType=by_type,
        bySeverity=by_severity,
        trends=trends,
        errorGroups=error_groups,
        pagination=pagination,
        patterns=patterns,
        impact=impact,
        topUsers=top_users,
    )


async def get_user_analytics(
    db: AsyncIOMotorDatabase,
    actor_user_id: str,
    include_archive: bool = False,
    records_limit: int = 200,
) -> Dict[str, Any]:
    """
    Get analytics for a specific user: total errors, breakdown by severity/environment/errorCode,
    and recent records. Uses $facet for a single efficient aggregation.
    """
    from bson import ObjectId as _ObjectId

    # Try ObjectId first, fall back to string
    try:
        uid = _ObjectId(actor_user_id)
    except Exception:
        uid = actor_user_id

    collections = await _get_collections(db, include_archive)

    # Try both ObjectId and string match for actorUserId
    user_match: Dict[str, Any] = {"actorUserId": {"$in": [uid, actor_user_id]}} if isinstance(uid, _ObjectId) else {"actorUserId": actor_user_id}

    pipeline: List[Dict[str, Any]] = [
        {"$match": user_match},
        {"$facet": {
            "total": [{"$count": "count"}],
            "bySeverity": [
                {"$group": {"_id": "$errorSeverity", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
            ],
            "byEnvironment": [
                {"$group": {"_id": "$environment", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
            ],
            "byErrorCode": [
                {"$group": {"_id": "$errorCode", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 20},
            ],
            "records": [
                {"$sort": {"eventDateTime": -1}},
                {"$limit": records_limit},
            ],
        }},
    ]

    # Run across collections
    merged: Dict[str, Any] = {
        "total": 0,
        "severities": {},
        "environments": {},
        "errorCodes": {},
        "records": [],
    }

    for col in collections:
        cursor = db[col].aggregate(pipeline)
        results = await cursor.to_list(length=1)
        if not results:
            continue
        r = results[0]

        merged["total"] += (r["total"][0]["count"] if r.get("total") else 0)

        for s in r.get("bySeverity", []):
            if s["_id"]:
                k = s["_id"]
                merged["severities"][k] = merged["severities"].get(k, 0) + s["count"]

        for e in r.get("byEnvironment", []):
            if e["_id"]:
                k = e["_id"]
                merged["environments"][k] = merged["environments"].get(k, 0) + e["count"]

        for ec in r.get("byErrorCode", []):
            if ec["_id"]:
                k = ec["_id"]
                merged["errorCodes"][k] = merged["errorCodes"].get(k, 0) + ec["count"]

        for doc in r.get("records", []):
            doc["_id"] = str(doc["_id"])
            if doc.get("actorUserId"):
                doc["actorUserId"] = str(doc["actorUserId"])
            if doc.get("eventDateTime"):
                doc["eventDateTime"] = doc["eventDateTime"].isoformat()
            merged["records"].append(doc)

    # Sort merged records and limit
    merged["records"].sort(key=lambda x: x.get("eventDateTime", ""), reverse=True)
    merged["records"] = merged["records"][:records_limit]

    return {
        "totalErrors": merged["total"],
        "severities": merged["severities"],
        "environments": merged["environments"],
        "errorCodes": merged["errorCodes"],
        "records": merged["records"],
    }


async def _get_top_users(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
    limit: int = 500,
) -> List[Dict[str, Any]]:
    """Get all users by error count (grouped by actorUserId), sorted desc"""
    pipeline = [
        {"$match": base_match},
        {"$match": {"actorUserId": {"$ne": None}}},
        {
            "$group": {
                "_id": "$actorUserId",
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Merge across collections
    user_counts: Dict[str, int] = {}
    for r in results:
        uid = r.get("_id")
        if uid:
            uid_str = str(uid)
            user_counts[uid_str] = user_counts.get(uid_str, 0) + r.get("count", 0)

    # Sort and limit
    sorted_users = sorted(user_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

    return [{"userId": uid, "count": cnt} for uid, cnt in sorted_users]


async def _get_summary(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
) -> DashboardSummary:
    """Get overall summary statistics"""
    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": None,
                "totalErrors": {"$sum": 1},
                "uniqueErrorCodes": {"$addToSet": "$errorCode"},
                "uniqueUsers": {"$addToSet": "$actorUserId"},
            }
        },
        {
            "$project": {
                "_id": 0,
                "totalErrors": 1,
                "totalUniqueErrors": {"$size": "$uniqueErrorCodes"},
                "totalAffectedUsers": {
                    "$size": {
                        "$filter": {
                            "input": "$uniqueUsers",
                            "cond": {"$ne": ["$$this", None]}
                        }
                    }
                },
            }
        },
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    if not results:
        return DashboardSummary(
            totalErrors=0,
            totalUniqueErrors=0,
            totalAffectedUsers=0,
        )

    # Combine results from multiple collections
    total_errors = sum(r.get("totalErrors", 0) for r in results)
    unique_codes = set()
    unique_users = set()

    # Re-aggregate to get accurate unique counts across collections
    if len(collections) > 1:
        all_codes_pipeline = [
            {"$match": base_match},
            {"$group": {"_id": "$errorCode"}},
        ]
        all_users_pipeline = [
            {"$match": base_match},
            {"$match": {"actorUserId": {"$ne": None}}},
            {"$group": {"_id": "$actorUserId"}},
        ]

        for col in collections:
            codes = await db[col].aggregate(all_codes_pipeline).to_list(length=None)
            unique_codes.update(r["_id"] for r in codes if r["_id"])

            users = await db[col].aggregate(all_users_pipeline).to_list(length=None)
            unique_users.update(r["_id"] for r in users if r["_id"])

        return DashboardSummary(
            totalErrors=total_errors,
            totalUniqueErrors=len(unique_codes),
            totalAffectedUsers=len(unique_users),
        )

    return DashboardSummary(
        totalErrors=results[0].get("totalErrors", 0),
        totalUniqueErrors=results[0].get("totalUniqueErrors", 0),
        totalAffectedUsers=results[0].get("totalAffectedUsers", 0),
    )


async def _get_stats_by_type(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
) -> Dict[str, TypeStats]:
    """Get statistics grouped by sourceType (only sourceTypes from valueSet).

    All sourceTypes are treated as uppercase (case-insensitive grouping).
    """
    # Get allowed sourceTypes from valueSet
    allowed_source_types = await get_all_codes(db, "sourceType")
    # Normalize to uppercase for consistent matching
    allowed_source_types_upper = {st.upper() for st in allowed_source_types}

    # Group by uppercase sourceType to treat 'api' and 'API' as same
    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": {"$toUpper": "$sourceType"},  # Treat all as uppercase
                "count": {"$sum": 1},
                "uniqueCodes": {"$addToSet": "$errorCode"},
                "uniqueUsers": {"$addToSet": "$actorUserId"},
            }
        },
        {
            "$project": {
                "_id": 1,
                "count": 1,
                "unique": {"$size": "$uniqueCodes"},
                "affectedUsers": {
                    "$size": {
                        "$filter": {
                            "input": "$uniqueUsers",
                            "cond": {"$ne": ["$$this", None]}
                        }
                    }
                },
            }
        },
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Combine results by type
    type_stats: Dict[str, Dict[str, Any]] = {}
    for r in results:
        source_type = r.get("_id")
        if not source_type:
            continue

        # sourceType is already uppercase from MongoDB $toUpper
        source_type_upper = source_type

        # Only include sourceTypes that are in the valueSet
        if source_type_upper not in allowed_source_types_upper:
            continue

        if source_type_upper not in type_stats:
            type_stats[source_type_upper] = {"count": 0, "unique": 0, "affectedUsers": 0}

        # Sum counts across collections
        type_stats[source_type_upper]["count"] += r.get("count", 0)
        type_stats[source_type_upper]["unique"] += r.get("unique", 0)
        type_stats[source_type_upper]["affectedUsers"] += r.get("affectedUsers", 0)

    # Return stats only for allowed source types that have data
    return {
        st: TypeStats(
            count=stats.get("count", 0),
            unique=stats.get("unique", 0),
            affectedUsers=stats.get("affectedUsers", 0),
        )
        for st, stats in type_stats.items()
    }


async def _get_stats_by_severity(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
) -> Dict[str, SeverityStats]:
    """Get statistics grouped by errorSeverity"""
    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": "$errorSeverity",
                "count": {"$sum": 1},
                "uniqueUsers": {"$addToSet": "$actorUserId"},
            }
        },
        {
            "$project": {
                "_id": 1,
                "count": 1,
                "affectedUsers": {
                    "$size": {
                        "$filter": {
                            "input": "$uniqueUsers",
                            "cond": {"$ne": ["$$this", None]}
                        }
                    }
                },
            }
        },
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Combine results by severity
    severity_stats: Dict[str, Dict[str, int]] = {}
    for r in results:
        severity = r.get("_id")
        if not severity:
            continue

        if severity not in severity_stats:
            severity_stats[severity] = {"count": 0, "affectedUsers": 0}

        severity_stats[severity]["count"] += r.get("count", 0)
        severity_stats[severity]["affectedUsers"] += r.get("affectedUsers", 0)

    # Return stats for all severity levels found in the data (dynamic based on valueSet)
    return {
        sev: SeverityStats(
            count=stats.get("count", 0),
            affectedUsers=stats.get("affectedUsers", 0),
        )
        for sev, stats in severity_stats.items()
    }


async def _get_trends(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
) -> List[TrendDataPoint]:
    """Get trend data - always returns hourly format (hours 0-23) for all time ranges.

    All sourceTypes are treated as uppercase (case-insensitive).
    """
    # Get all valid sourceTypes from valueSet and normalize to uppercase
    source_types_raw = await get_all_codes(db, "sourceType")
    source_types = {st.upper() for st in source_types_raw}

    # Always use hourly aggregation for all time ranges
    return await _get_hourly_trends(db, base_match, collections, source_types)


async def _get_hourly_trends(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
    source_types: set,
) -> List[TrendDataPoint]:
    """Get hourly trend data (for all, 1h, 24h time ranges).

    All sourceTypes are treated as uppercase (case-insensitive grouping).
    """
    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": {
                    "hour": {"$hour": "$eventDateTime"},
                    "sourceType": {"$toUpper": "$sourceType"},  # Treat all as uppercase
                },
                "count": {"$sum": 1},
            }
        },
        {
            "$group": {
                "_id": "$_id.hour",
                "types": {
                    "$push": {
                        "type": "$_id.sourceType",
                        "count": "$count",
                    }
                },
            }
        },
        {"$sort": {"_id": 1}},
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Initialize hour_data with all sourceTypes from valueSet (dynamic)
    hour_data: Dict[int, Dict[str, int]] = {
        h: {st: 0 for st in source_types} for h in range(24)
    }

    for r in results:
        hour = r.get("_id")
        if hour is None:
            continue

        for type_data in r.get("types", []):
            source_type = type_data.get("type")
            count = type_data.get("count", 0)
            # Normalize sourceType to uppercase for consistent matching
            source_type_upper = source_type.upper() if isinstance(source_type, str) else source_type
            if source_type_upper in hour_data[hour]:
                hour_data[hour][source_type_upper] += count

    return [
        TrendDataPoint(
            hour=h,
            bySourceType=hour_data[h],
        )
        for h in range(24)
    ]


async def _get_error_groups(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
    limit: int = 50,
) -> List[ErrorGroupItem]:
    """Get error groups (grouped by errorCode) sorted by occurrences"""
    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": "$errorCode",
                "occurrences": {"$sum": 1},
                "sourceType": {"$first": "$sourceType"},
                "severity": {"$first": "$errorSeverity"},
                "firstSeen": {"$min": "$eventDateTime"},
                "lastSeen": {"$max": "$eventDateTime"},
                "sourceName": {"$first": "$sourceName"},
                "endpoint": {"$first": "$endpoint"},
                "resolvedMessage": {"$first": "$resolvedMessage"},
                "uniqueUsers": {"$addToSet": "$actorUserId"},
            }
        },
        {
            "$project": {
                "_id": 1,
                "occurrences": 1,
                "sourceType": 1,
                "severity": 1,
                "firstSeen": 1,
                "lastSeen": 1,
                "sourceName": 1,
                "endpoint": 1,
                "resolvedMessage": 1,
                "affectedUsers": {
                    "$size": {
                        "$filter": {
                            "input": "$uniqueUsers",
                            "cond": {"$ne": ["$$this", None]}
                        }
                    }
                },
            }
        },
        {"$sort": {"occurrences": -1}},
        {"$limit": limit},
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Combine and sort results from multiple collections
    error_groups: Dict[str, Dict[str, Any]] = {}
    for r in results:
        error_code = r.get("_id")
        if not error_code:
            continue

        if error_code not in error_groups:
            error_groups[error_code] = {
                "errorCode": error_code,
                "occurrences": 0,
                "sourceType": r.get("sourceType"),
                "severity": r.get("severity"),
                "firstSeen": r.get("firstSeen"),
                "lastSeen": r.get("lastSeen"),
                "sourceName": r.get("sourceName"),
                "endpoint": r.get("endpoint"),
                "resolvedMessage": r.get("resolvedMessage"),
                "affectedUsers": 0,
            }

        group = error_groups[error_code]
        group["occurrences"] += r.get("occurrences", 0)
        group["affectedUsers"] += r.get("affectedUsers", 0)

        # Update first/last seen
        if r.get("firstSeen"):
            if not group["firstSeen"] or r["firstSeen"] < group["firstSeen"]:
                group["firstSeen"] = r["firstSeen"]
        if r.get("lastSeen"):
            if not group["lastSeen"] or r["lastSeen"] > group["lastSeen"]:
                group["lastSeen"] = r["lastSeen"]

    # Sort by occurrences and limit
    sorted_groups = sorted(
        error_groups.values(),
        key=lambda x: x["occurrences"],
        reverse=True
    )[:limit]

    return [
        ErrorGroupItem(
            errorCode=g["errorCode"],
            sourceType=g.get("sourceType"),
            severity=g.get("severity"),
            occurrences=g["occurrences"],
            affectedUsers=g["affectedUsers"],
            firstSeen=g.get("firstSeen"),
            lastSeen=g.get("lastSeen"),
            sourceName=g.get("sourceName"),
            endpoint=g.get("endpoint"),
            resolvedMessage=g.get("resolvedMessage"),
        )
        for g in sorted_groups
    ]


async def _get_error_groups_paginated(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
    page: int = 1,
    limit: int = 50,
) -> Tuple[List[ErrorGroupItem], PaginationInfo]:
    """Get paginated error groups (grouped by errorCode) sorted by occurrences"""
    # First get all groups to count total (without limit)
    count_pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": "$errorCode",
            }
        },
        {"$count": "total"},
    ]

    # Get total count
    total_items = 0
    for col in collections:
        result = await db[col].aggregate(count_pipeline).to_list(length=1)
        if result:
            total_items += result[0].get("total", 0)

    # Calculate pagination
    total_pages = max((total_items + limit - 1) // limit, 1)
    skip = (page - 1) * limit

    # Get paginated error groups
    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": "$errorCode",
                "occurrences": {"$sum": 1},
                "sourceType": {"$first": "$sourceType"},
                "severity": {"$first": "$errorSeverity"},
                "firstSeen": {"$min": "$eventDateTime"},
                "lastSeen": {"$max": "$eventDateTime"},
                "sourceName": {"$first": "$sourceName"},
                "endpoint": {"$first": "$endpoint"},
                "resolvedMessage": {"$first": "$resolvedMessage"},
                "uniqueUsers": {"$addToSet": "$actorUserId"},
            }
        },
        {
            "$project": {
                "_id": 1,
                "occurrences": 1,
                "sourceType": 1,
                "severity": 1,
                "firstSeen": 1,
                "lastSeen": 1,
                "sourceName": 1,
                "endpoint": 1,
                "resolvedMessage": 1,
                "affectedUsers": {
                    "$size": {
                        "$filter": {
                            "input": "$uniqueUsers",
                            "cond": {"$ne": ["$$this", None]}
                        }
                    }
                },
            }
        },
        {"$sort": {"occurrences": -1}},
        {"$skip": skip},
        {"$limit": limit},
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Combine results from multiple collections
    error_groups: Dict[str, Dict[str, Any]] = {}
    for r in results:
        error_code = r.get("_id")
        if not error_code:
            continue

        if error_code not in error_groups:
            error_groups[error_code] = {
                "errorCode": error_code,
                "occurrences": 0,
                "sourceType": r.get("sourceType"),
                "severity": r.get("severity"),
                "firstSeen": r.get("firstSeen"),
                "lastSeen": r.get("lastSeen"),
                "sourceName": r.get("sourceName"),
                "endpoint": r.get("endpoint"),
                "resolvedMessage": r.get("resolvedMessage"),
                "affectedUsers": 0,
            }

        group = error_groups[error_code]
        group["occurrences"] += r.get("occurrences", 0)
        group["affectedUsers"] += r.get("affectedUsers", 0)

        # Update first/last seen
        if r.get("firstSeen"):
            if not group["firstSeen"] or r["firstSeen"] < group["firstSeen"]:
                group["firstSeen"] = r["firstSeen"]
        if r.get("lastSeen"):
            if not group["lastSeen"] or r["lastSeen"] > group["lastSeen"]:
                group["lastSeen"] = r["lastSeen"]

    # Sort by occurrences
    sorted_groups = sorted(
        error_groups.values(),
        key=lambda x: x["occurrences"],
        reverse=True
    )

    error_group_items = [
        ErrorGroupItem(
            errorCode=g["errorCode"],
            sourceType=g.get("sourceType"),
            severity=g.get("severity"),
            occurrences=g["occurrences"],
            affectedUsers=g["affectedUsers"],
            firstSeen=g.get("firstSeen"),
            lastSeen=g.get("lastSeen"),
            sourceName=g.get("sourceName"),
            endpoint=g.get("endpoint"),
            resolvedMessage=g.get("resolvedMessage"),
        )
        for g in sorted_groups
    ]

    pagination = PaginationInfo(
        page=page,
        limit=limit,
        totalItems=total_items,
        totalPages=total_pages,
        hasNextPage=page < total_pages,
        hasPrevPage=page > 1,
    )

    return error_group_items, pagination


async def _get_patterns(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> List[PatternItem]:
    """Analyze error patterns based on error code prefixes"""
    # Get all error codes with their counts and hourly distribution
    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": {
                    "errorCode": "$errorCode",
                    "hour": {"$hour": "$eventDateTime"},
                },
                "count": {"$sum": 1},
                "modules": {"$addToSet": "$sourceName"},
            }
        },
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Calculate time range in days for frequency calculation
    # If no time range specified (ALL), default to 1 day for frequency calculation
    if start_date is not None and end_date is not None:
        days = max((end_date - start_date).days, 1)
    else:
        days = 1  # Default to 1 day when showing all data

    # Aggregate by pattern
    pattern_data: Dict[str, Dict[str, Any]] = {
        name: {
            "total_count": 0,
            "hourly_counts": {},
            "modules": set(),
            "previous_count": 0,  # For trend calculation
        }
        for name in PATTERN_DEFINITIONS.keys()
    }

    for r in results:
        error_code = r.get("_id", {}).get("errorCode")
        hour = r.get("_id", {}).get("hour")
        count = r.get("count", 0)
        modules = r.get("modules", [])

        if not error_code:
            continue

        # Match to pattern
        pattern_name = _match_pattern(error_code)
        if not pattern_name:
            continue

        pattern_data[pattern_name]["total_count"] += count
        pattern_data[pattern_name]["modules"].update(m for m in modules if m)

        if hour is not None:
            if hour not in pattern_data[pattern_name]["hourly_counts"]:
                pattern_data[pattern_name]["hourly_counts"][hour] = 0
            pattern_data[pattern_name]["hourly_counts"][hour] += count

    # Calculate trends and peak hours
    patterns = []
    for name, data in pattern_data.items():
        if data["total_count"] == 0:
            continue

        # Calculate frequency (errors per day)
        frequency = round(data["total_count"] / days)

        # Determine peak hours
        hourly = data["hourly_counts"]
        if hourly:
            sorted_hours = sorted(hourly.items(), key=lambda x: x[1], reverse=True)
            peak_hour = sorted_hours[0][0]
            peak_hours = f"{peak_hour:02d}:00-{(peak_hour + 2) % 24:02d}:00"
        else:
            peak_hours = "All day"

        # Determine trend (simplified: based on first vs second half of time range)
        # In real implementation, compare with previous period
        trend = "stable"
        if len(hourly) >= 2:
            first_half = sum(v for h, v in hourly.items() if h < 12)
            second_half = sum(v for h, v in hourly.items() if h >= 12)
            if second_half > first_half * 1.2:
                trend = "increasing"
            elif first_half > second_half * 1.2:
                trend = "decreasing"

        patterns.append(PatternItem(
            pattern=name,
            frequency=frequency,
            trend=trend,
            peakHours=peak_hours,
            affectedModules=len(data["modules"]),
        ))

    # Sort by frequency
    patterns.sort(key=lambda x: x.frequency, reverse=True)

    return patterns


async def _get_impact_analysis(
    db: AsyncIOMotorDatabase,
    base_match: Dict[str, Any],
    collections: List[str],
    total_errors: int,
) -> ImpactAnalysis:
    """Get impact analysis for all severity levels (dynamic from valueSet)"""
    # Get all valid severity levels from valueSet
    severity_levels = await get_all_codes(db, "errorSeverity")

    # If no severity levels found in valueSet, return empty impact analysis
    if not severity_levels:
        return ImpactAnalysis(
            bySeverity={},
            totalAffectedUsers=0,
        )

    pipeline = [
        {"$match": base_match},
        {
            "$group": {
                "_id": "$errorSeverity",
                "totalErrors": {"$sum": 1},
                "uniqueCodes": {"$addToSet": "$errorCode"},
                "uniqueUsers": {"$addToSet": "$actorUserId"},
            }
        },
        {
            "$project": {
                "_id": 1,
                "totalErrors": 1,
                "errorGroups": {"$size": "$uniqueCodes"},
                "affectedUsers": {
                    "$size": {
                        "$filter": {
                            "input": "$uniqueUsers",
                            "cond": {"$ne": ["$$this", None]}
                        }
                    }
                },
            }
        },
    ]

    results = await _aggregate_across_collections(db, pipeline, collections)

    # Initialize impact data for all severity levels from valueSet
    impact_data: Dict[str, Dict[str, int]] = {
        sev: {"totalErrors": 0, "errorGroups": 0, "affectedUsers": 0}
        for sev in severity_levels
    }

    for r in results:
        severity = r.get("_id")
        # Normalize severity to uppercase for consistent matching
        severity_upper = severity.upper() if isinstance(severity, str) else severity
        if severity_upper in impact_data:
            impact_data[severity_upper]["totalErrors"] += r.get("totalErrors", 0)
            impact_data[severity_upper]["errorGroups"] += r.get("errorGroups", 0)
            impact_data[severity_upper]["affectedUsers"] += r.get("affectedUsers", 0)

    # Calculate total affected users across all severities
    total_affected_users = sum(
        data["affectedUsers"] for data in impact_data.values()
    )

    # Build bySeverity dict with ImpactLevel for each severity that has errors
    by_severity: Dict[str, ImpactLevel] = {}
    for sev, data in impact_data.items():
        if data["totalErrors"] > 0:
            error_rate = round(data["totalErrors"] / total_errors * 100, 1) if total_errors > 0 else 0.0
            by_severity[sev] = ImpactLevel(
                errorGroups=data["errorGroups"],
                totalErrors=data["totalErrors"],
                affectedUsers=data["affectedUsers"],
                errorRate=error_rate,
            )

    return ImpactAnalysis(
        bySeverity=by_severity,
        totalAffectedUsers=total_affected_users,
    )
