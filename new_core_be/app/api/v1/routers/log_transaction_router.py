"""
Audit Log Router
CRUD operations for audit log entry management.
"""
from typing import List, Optional
from datetime import datetime, timedelta
import asyncio
import csv
import io

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.database import get_database
from app.core.constants import Collections
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.log_transaction_schema import (
    LogTransactionCreateSchema,
    LogTransactionResponseSchema
)
from app.api.v1.schemas.response_schemas import (
    StandardResponse,
    ValidationErrorResponse,
    ErrorResponse,
    PaginatedResponse,
    AnalyticsResponse,
    CleanupResponse,
    DashboardResponse
)
from app.utils.response_helpers import success_response, error_response
from app.core.logger import logger
from app.api.v1.services.error_logger import log_error, log_error_with_exception, get_user_id_from_token, ErrorCodes
#NOTE: log_transaction/LogCodes not imported - this router should NOT log its own operations
# to avoid recursive calls when LOG_TRANSACTION_API_URL points to this same service

router = APIRouter(prefix="/api/v1/log-transactions", tags=["logs-transaction"])

JOB_NAME = "LOG_TRANSACTION"


class PaginatedLogTransactionResponse(BaseModel):
    """Paginated response model for audit log list"""
    data: List[LogTransactionResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId fields to strings for JSON serialization"""
    if document and "_id" in document:
        document["_id"] = str(document["_id"])

    for field in ["actorId"]:
        if document and field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    return document


def generate_message_from_template(template: str, params: dict) -> str:
    """Generate message by replacing placeholders in template with parameter values"""
    try:
        return template.format(**params)
    except KeyError:
        result = template
        for key, value in params.items():
            result = result.replace(f"{{{key}}}", str(value))
        return result


async def validate_eventcode_and_get_master(db, eventcode: str):
    """Validate eventcode and return the master document from audit_log_master"""
    if not eventcode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                message="eventcode is required",
                status_code=400,
                error_code="ERR.CORE.VALIDATION.REQUIRED"
            )
        )

    master_doc = await db[Collections.LOG_MASTER].find_one({"eventCode": eventcode, "isDelete": False})
    if not master_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                message=f"eventcode '{eventcode}' not found in audit_log_master",
                status_code=404,
                error_code="ERR.CORE.LOG_CODE.NOT_FOUND"
            )
        )

    return master_doc


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    response_model=StandardResponse[LogTransactionResponseSchema],
    responses={
        201: {"description": "Audit log entry created successfully"},
        422: {"description": "Validation Error", "model": ValidationErrorResponse}
    }
)
async def create_log_entry(
    log: LogTransactionCreateSchema,
    request: Request,

):
    """Create a new audit log entry"""

    db = get_database()
    log_dict = log.model_dump()
    eventcode = log_dict.get("eventcode")

    try:
        master_doc = await validate_eventcode_and_get_master(db, eventcode)
    except HTTPException as e:
        await log_error(
            request=request,
            error_code=ErrorCodes.LOG_CODE_NOT_FOUND if e.status_code == 404 else ErrorCodes.VALIDATION_REQUIRED,
            parameters={"eventcode": eventcode, "errorMessage": str(e.detail)},
            actor_user_id=get_user_id_from_token(request)
        )
        raise e

    # Generate message from master's messageTemplate if not provided
    if not log_dict.get("message"):
        template_string = master_doc.get("messageTemplate", "")
        params = log_dict.get("parameters", {}) or {}
        log_dict["message"] = generate_message_from_template(template_string, params)

    result = await db[Collections.LOG_TRANSACTION].insert_one(log_dict)
    created_log = await db[Collections.LOG_TRANSACTION].find_one({"_id": result.inserted_id})

    # NOTE: We intentionally do NOT call log_transaction() here to avoid recursive calls.

    return success_response(
        data=convert_objectid_to_str(created_log),
        message="Audit log entry created successfully",
        status_code=201
    )


@router.get(
    "/list",
    response_model=StandardResponse[PaginatedResponse],
    responses={
        200: {"description": "Audit logs retrieved successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse}
    }
)
async def get_all_logs(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Items per page"),
    layer: Optional[str] = Query(None, description="Filter by layer"),
    actorId: Optional[str] = Query(None, description="Filter by actor/user ID"),
    eventcode: Optional[str] = Query(None, description="Filter by eventcode"),
    entityType: Optional[str] = Query(None, description="Filter by entityType"),
    entityId: Optional[str] = Query(None, description="Filter by entityId"),
    orgUnitId: Optional[str] = Query(None, description="Filter by orgUnitId"),
    endpoint: Optional[str] = Query(None, description="Filter by endpoint"),
    fromDate: Optional[datetime] = Query(None, description="Filter logs from this date"),
    toDate: Optional[datetime] = Query(None, description="Filter logs until this date"),
    search: Optional[str] = Query(None, description="Search in message"),

):
    """Get all audit logs with optional pagination and filters"""

    db = get_database()
    query = {}

    if layer:
        query["layer"] = layer

    if actorId:
        try:
            query["actorId"] = ObjectId(actorId)
        except Exception:
            await log_error(
                request=request,
                error_code=ErrorCodes.VALIDATION_INVALID_OBJECTID,
                parameters={"field": "actorId", "value": actorId},
                actor_user_id=get_user_id_from_token(request)
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    message="Invalid actorId format",
                    status_code=400,
                    error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
                )
            )

    if eventcode:
        query["eventcode"] = eventcode

    if entityType:
        query["entityType"] = entityType

    if entityId:
        query["entityId"] = entityId

    if orgUnitId:
        query["orgUnitId"] = orgUnitId

    if endpoint:
        query["endpoint"] = {"$regex": endpoint, "$options": "i"}

    if search:
        query["message"] = {"$regex": search, "$options": "i"}

    if fromDate or toDate:
        date_query = {}
        if fromDate:
            date_query["$gte"] = fromDate
        if toDate:
            date_query["$lte"] = toDate
        query["EventTimeStamp"] = date_query

    if page is not None:
        actual_page_size = page_size if page_size is not None else 10
        skip = (page - 1) * actual_page_size

        cursor = db[Collections.LOG_TRANSACTION].find(query).sort("EventTimeStamp", -1).skip(skip).limit(actual_page_size)
        logs_list = await cursor.to_list(length=actual_page_size)
        total = await db[Collections.LOG_TRANSACTION].count_documents(query)
        total_pages = (total + actual_page_size - 1) // actual_page_size

        logs_list = [convert_objectid_to_str(log) for log in logs_list]

        return success_response(
            data={
                "items": logs_list,
                "total": total,
                "page": page,
                "page_size": actual_page_size,
                "total_pages": total_pages
            },
            message="Audit logs retrieved successfully",
            status_code=200
        )
    else:
        cursor = db[Collections.LOG_TRANSACTION].find(query).sort("EventTimeStamp", -1).limit(10000)
        logs_list = await cursor.to_list(length=10000)
        total = len(logs_list)

        logs_list = [convert_objectid_to_str(log) for log in logs_list]

        return success_response(
            data={
                "items": logs_list,
                "total": total,
                "page": 1,
                "page_size": total,
                "total_pages": 1
            },
            message="Audit logs retrieved successfully",
            status_code=200
        )


@router.get(
    "/get",
    response_model=StandardResponse[LogTransactionResponseSchema],
    responses={
        200: {"description": "Audit log retrieved successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse},
        404: {"description": "Audit log not found", "model": ErrorResponse}
    }
)
async def get_log_by_id(
    request: Request,
    id: str = Query(..., description="Audit log ID"),

):
    """Get a specific audit log by ID"""

    db = get_database()

    try:
        object_id = ObjectId(id)
    except Exception:
        await log_error(
            request=request,
            error_code=ErrorCodes.VALIDATION_INVALID_OBJECTID,
            parameters={"field": "id", "value": id},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                message="Invalid id format",
                status_code=400,
                error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
            )
        )

    log = await db[Collections.LOG_TRANSACTION].find_one({"_id": object_id})

    if not log:
        await log_error(
            request=request,
            error_code=ErrorCodes.LOG_NOT_FOUND,
            parameters={"id": id},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                message="Audit log not found",
                status_code=404,
                error_code="ERR.CORE.LOG.NOT_FOUND"
            )
        )

    return success_response(
        data=convert_objectid_to_str(log),
        message="Audit log retrieved successfully",
        status_code=200
    )


@router.get(
    "/paginated",
    response_model=StandardResponse[PaginatedResponse],
    responses={
        200: {"description": "Paginated audit logs retrieved successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse}
    }
)
async def get_paginated_logs_for_dashboard(
    request: Request,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    layer: Optional[str] = Query(None, description="Filter by layer"),
    entityType: Optional[str] = Query(None, description="Filter by entityType"),

):
    """Get paginated audit logs for dashboard display"""

    db = get_database()

    query = {}
    if layer:
        query["layer"] = layer
    if entityType:
        query["entityType"] = entityType

    skip = (page - 1) * limit

    cursor = db[Collections.LOG_TRANSACTION].find(query).sort("EventTimeStamp", -1).skip(skip).limit(limit)
    logs_list = await cursor.to_list(length=limit)
    total = await db[Collections.LOG_TRANSACTION].count_documents(query)
    total_pages = (total + limit - 1) // limit

    logs_list = [convert_objectid_to_str(log) for log in logs_list]

    return success_response(
        data={
            "items": logs_list,
            "total": total,
            "page": page,
            "page_size": limit,
            "total_pages": total_pages
        },
        message="Paginated audit logs retrieved successfully",
        status_code=200
    )


@router.get(
    "/analytics",
    response_model=StandardResponse[AnalyticsResponse],
    responses={
        200: {"description": "Audit log analytics retrieved successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse}
    }
)
async def get_log_analytics(
    request: Request,
    fromDate: Optional[datetime] = Query(None, description="Filter logs from this date"),
    toDate: Optional[datetime] = Query(None, description="Filter logs until this date"),

):
    """Get analytics for audit log counts grouped by log level (via audit_log_master lookup)"""

    db = get_database()

    match_query = {}
    if fromDate or toDate:
        date_query = {}
        if fromDate:
            date_query["$gte"] = fromDate
        if toDate:
            date_query["$lte"] = toDate
        match_query["EventTimeStamp"] = date_query

    pipeline = []

    if match_query:
        pipeline.append({"$match": match_query})

    # Lookup audit_log_master to get logLevel for each transaction
    pipeline.append({
        "$lookup": {
            "from": Collections.LOG_MASTER,
            "localField": "eventcode",
            "foreignField": "eventCode",
            "as": "master"
        }
    })

    # Unwind master (use preserveNullAndEmptyArrays so transactions without a master still count)
    pipeline.append({
        "$unwind": {
            "path": "$master",
            "preserveNullAndEmptyArrays": True
        }
    })

    # Group by logLevel from master
    pipeline.append({
        "$group": {
            "_id": {"$toLower": {"$ifNull": ["$master.logLevel", "info"]}},
            "count": {"$sum": 1}
        }
    })

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    info_count = 0
    warning_count = 0
    error_count = 0
    total = 0

    for result in results:
        level = (result["_id"] or "info").lower()
        count = result["count"]
        total += count
        if level == "info":
            info_count += count
        elif level in ("warning", "warn"):
            warning_count += count
        elif level == "error":
            error_count += count
        else:
            info_count += count  # default unknown levels to info

    return success_response(
        data={
            "total": total,
            "infoCount": info_count,
            "warningCount": warning_count,
            "errorCount": error_count
        },
        message="Audit log analytics retrieved successfully",
        status_code=200
    )


@router.delete(
    "/cleanup",
    response_model=StandardResponse[CleanupResponse],
    responses={
        200: {"description": "Audit logs cleanup completed successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse}
    }
)
async def cleanup_old_logs(
    request: Request,

):
    """Delete old audit logs based on retention period defined in audit_log_master"""

    db = get_database()
    total_deleted = 0

    # Get all active audit log masters with their retention periods
    audit_log_masters = await db[Collections.LOG_MASTER].find({"isDelete": False}).to_list(length=None)

    for master in audit_log_masters:
        event_code = master.get("eventCode")
        retention_days = master.get("retentionPeriod", 365)

        cutoff_date = get_ist_now() - timedelta(days=retention_days)

        result = await db[Collections.LOG_TRANSACTION].delete_many({
            "eventcode": event_code,
            "EventTimeStamp": {"$lt": cutoff_date}
        })

        total_deleted += result.deleted_count

    return success_response(
        data={
            "deleted_count": total_deleted,
            "processed_templates": len(audit_log_masters)
        },
        message="Audit logs cleanup completed successfully",
        status_code=200
    )


# ---- Dashboard helper functions ----

def get_timeline_date_range(timeline: Optional[str]) -> tuple:
    """Get date range based on timeline selection"""
    if not timeline:
        return None, None

    now = get_ist_now()

    if timeline == "today":
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return today_start, now
    elif timeline == "thisMonth":
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return month_start, now
    elif timeline == "lastHour":
        return now - timedelta(hours=1), now
    elif timeline == "last24Hours":
        return now - timedelta(hours=24), now
    elif timeline == "last7Days":
        return now - timedelta(days=7), now
    elif timeline == "last30Days":
        return now - timedelta(days=30), now

    return None, None


async def build_filter_query(
    db,
    layer: Optional[str] = None,
    entityType: Optional[str] = None,
    eventcode: Optional[str] = None,
    search: Optional[str] = None,
    fromDate: Optional[datetime] = None,
    toDate: Optional[datetime] = None,
    timeline: Optional[str] = None,
    paramKey: Optional[str] = None,
    paramValue: Optional[str] = None,
    actorId: Optional[str] = None
) -> dict:
    """Build filter query for dashboard - shared across all aggregations"""
    query = {}

    if layer:
        query["layer"] = layer

    if entityType:
        query["entityType"] = entityType

    if eventcode:
        query["eventcode"] = eventcode

    if search:
        query["$or"] = [
            {"message": {"$regex": search, "$options": "i"}},
            {"endpoint": {"$regex": search, "$options": "i"}}
        ]

    if paramKey and paramValue:
        query[f"parameters.{paramKey}"] = {"$regex": paramValue, "$options": "i"}

    if actorId:
        query["actorId"] = actorId

    # Apply timeline-based date filter (takes priority if no explicit dates provided)
    timeline_from, timeline_to = get_timeline_date_range(timeline)

    effective_from = fromDate if fromDate else timeline_from
    effective_to = toDate if toDate else timeline_to

    if effective_from or effective_to:
        date_query = {}
        if effective_from:
            date_query["$gte"] = effective_from
        if effective_to:
            date_query["$lte"] = effective_to
        query["EventTimeStamp"] = date_query

    return query


async def get_analytics_counts(db, query: dict) -> dict:
    """Get audit log counts based on filter query, grouped by layer"""
    pipeline = []

    if query:
        pipeline.append({"$match": query})

    pipeline.append({
        "$group": {
            "_id": {"$toUpper": "$layer"},
            "count": {"$sum": 1}
        }
    })

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    layer_counts = {}
    total = 0
    for result in results:
        layer = result["_id"]
        count = result["count"]
        layer_counts[layer] = count
        total += count

    layer_counts["total"] = total
    return layer_counts


async def get_last_hour_trend(db, query: dict) -> list:
    """Get last hour trend grouped by minute"""
    now = get_ist_now()
    one_hour_ago = now - timedelta(hours=1)

    trend_query = query.copy()
    if "EventTimeStamp" in trend_query:
        existing_date_query = trend_query["EventTimeStamp"]
        trend_query["EventTimeStamp"] = {
            "$gte": max(existing_date_query.get("$gte", one_hour_ago), one_hour_ago),
            "$lte": existing_date_query.get("$lte", now)
        }
    else:
        trend_query["EventTimeStamp"] = {"$gte": one_hour_ago, "$lte": now}

    pipeline = [
        {"$match": trend_query},
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$EventTimeStamp"},
                    "month": {"$month": "$EventTimeStamp"},
                    "day": {"$dayOfMonth": "$EventTimeStamp"},
                    "hour": {"$hour": "$EventTimeStamp"},
                    "minute": {"$minute": "$EventTimeStamp"}
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1, "_id.minute": 1}}
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    trend_data = []
    for result in results:
        id_parts = result["_id"]
        minute_dt = datetime(
            id_parts["year"],
            id_parts["month"],
            id_parts["day"],
            id_parts["hour"],
            id_parts["minute"]
        )
        trend_data.append({
            "timestamp": minute_dt.isoformat(),
            "count": result["count"]
        })

    return trend_data


async def get_last_24_hours_trend(db, query: dict) -> list:
    """Get last 24 hours trend grouped by hour"""
    now = get_ist_now()
    twenty_four_hours_ago = now - timedelta(hours=24)

    trend_query = query.copy()
    if "EventTimeStamp" in trend_query:
        existing_date_query = trend_query["EventTimeStamp"]
        trend_query["EventTimeStamp"] = {
            "$gte": max(existing_date_query.get("$gte", twenty_four_hours_ago), twenty_four_hours_ago),
            "$lte": existing_date_query.get("$lte", now)
        }
    else:
        trend_query["EventTimeStamp"] = {"$gte": twenty_four_hours_ago, "$lte": now}

    pipeline = [
        {"$match": trend_query},
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$EventTimeStamp"},
                    "month": {"$month": "$EventTimeStamp"},
                    "day": {"$dayOfMonth": "$EventTimeStamp"},
                    "hour": {"$hour": "$EventTimeStamp"}
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1}}
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    trend_data = []
    for result in results:
        id_parts = result["_id"]
        hour_dt = datetime(
            id_parts["year"],
            id_parts["month"],
            id_parts["day"],
            id_parts["hour"]
        )
        trend_data.append({
            "timestamp": hour_dt.isoformat(),
            "count": result["count"]
        })

    return trend_data


async def get_last_7_days_trend(db, query: dict) -> list:
    """Get last 7 days trend grouped by day"""
    now = get_ist_now()
    seven_days_ago = now - timedelta(days=7)

    trend_query = query.copy()
    if "EventTimeStamp" in trend_query:
        existing_date_query = trend_query["EventTimeStamp"]
        trend_query["EventTimeStamp"] = {
            "$gte": max(existing_date_query.get("$gte", seven_days_ago), seven_days_ago),
            "$lte": existing_date_query.get("$lte", now)
        }
    else:
        trend_query["EventTimeStamp"] = {"$gte": seven_days_ago, "$lte": now}

    pipeline = [
        {"$match": trend_query},
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$EventTimeStamp"},
                    "month": {"$month": "$EventTimeStamp"},
                    "day": {"$dayOfMonth": "$EventTimeStamp"}
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}}
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    trend_data = []
    for result in results:
        id_parts = result["_id"]
        day_dt = datetime(
            id_parts["year"],
            id_parts["month"],
            id_parts["day"]
        )
        trend_data.append({
            "timestamp": day_dt.strftime("%Y-%m-%d"),
            "count": result["count"]
        })

    return trend_data


async def get_last_30_days_trend(db, query: dict) -> list:
    """Get last 30 days trend grouped by day"""
    now = get_ist_now()
    thirty_days_ago = now - timedelta(days=30)

    trend_query = query.copy()
    if "EventTimeStamp" in trend_query:
        existing_date_query = trend_query["EventTimeStamp"]
        trend_query["EventTimeStamp"] = {
            "$gte": max(existing_date_query.get("$gte", thirty_days_ago), thirty_days_ago),
            "$lte": existing_date_query.get("$lte", now)
        }
    else:
        trend_query["EventTimeStamp"] = {"$gte": thirty_days_ago, "$lte": now}

    pipeline = [
        {"$match": trend_query},
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$EventTimeStamp"},
                    "month": {"$month": "$EventTimeStamp"},
                    "day": {"$dayOfMonth": "$EventTimeStamp"}
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}}
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    trend_data = []
    for result in results:
        id_parts = result["_id"]
        day_dt = datetime(
            id_parts["year"],
            id_parts["month"],
            id_parts["day"]
        )
        trend_data.append({
            "timestamp": day_dt.strftime("%Y-%m-%d"),
            "count": result["count"]
        })

    return trend_data


async def get_trend_data(db, query: dict, timeline: Optional[str] = None) -> dict:
    """Get trend data based on selected timeline or all timelines if none specified"""

    if timeline:
        if timeline == "lastHour":
            data = await get_last_hour_trend(db, query)
            return {"lastHour": data, "last24Hours": [], "last7Days": [], "last30Days": []}
        elif timeline == "last24Hours":
            data = await get_last_24_hours_trend(db, query)
            return {"lastHour": [], "last24Hours": data, "last7Days": [], "last30Days": []}
        elif timeline == "last7Days":
            data = await get_last_7_days_trend(db, query)
            return {"lastHour": [], "last24Hours": [], "last7Days": data, "last30Days": []}
        elif timeline == "last30Days":
            data = await get_last_30_days_trend(db, query)
            return {"lastHour": [], "last24Hours": [], "last7Days": [], "last30Days": data}

    last_hour, last_24_hours, last_7_days, last_30_days = await asyncio.gather(
        get_last_hour_trend(db, query),
        get_last_24_hours_trend(db, query),
        get_last_7_days_trend(db, query),
        get_last_30_days_trend(db, query)
    )

    return {
        "lastHour": last_hour,
        "last24Hours": last_24_hours,
        "last7Days": last_7_days,
        "last30Days": last_30_days
    }


async def get_all_entity_types(db) -> list:
    """Get all distinct entityType values from audit_log collection"""
    values = await db[Collections.LOG_TRANSACTION].distinct("entityType")
    return sorted([v for v in values if v and v.strip()])


async def get_top_log_entities(db, query: dict, limit: int = 5) -> list:
    """
    Get top logged entity types based on filter query.
    Shows which entityTypes have the most audit log entries.
    """
    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {
            "$group": {
                "_id": "$entityType",
                "logCount": {"$sum": 1}
            }
        },
        {"$sort": {"logCount": -1}},
        {"$limit": limit}
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    return [
        {
            "entityType": r["_id"],
            "logCount": r["logCount"]
        }
        for r in results if r["_id"]
    ]


async def get_paginated_logs(db, query: dict, page: int, page_size: int, sort_field: str = "EventTimeStamp", sort_order: int = -1) -> dict:
    """Get paginated audit logs based on filter query, with personnel name lookup"""
    skip = (page - 1) * page_size

    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$sort": {sort_field: sort_order}},
        {"$skip": skip},
        {"$limit": page_size},
        {
            "$addFields": {
                "actorIdObj": {
                    "$cond": {
                        "if": {"$and": [{"$ne": ["$actorId", None]}, {"$ne": ["$actorId", ""]}]},
                        "then": {"$toObjectId": "$actorId"},
                        "else": None
                    }
                }
            }
        },
        {
            "$lookup": {
                "from": "personnel_master",
                "localField": "actorIdObj",
                "foreignField": "_id",
                "as": "personnel"
            }
        },
        {"$unwind": {"path": "$personnel", "preserveNullAndEmptyArrays": True}},
        {
            "$addFields": {
                "actorName": {"$ifNull": ["$personnel.name", None]}
            }
        },
        {"$project": {"personnel": 0, "actorIdObj": 0}}
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    logs_list = await cursor.to_list(length=page_size)
    total = await db[Collections.LOG_TRANSACTION].count_documents(query)
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

    logs_list = [convert_objectid_to_str(log) for log in logs_list]

    return {
        "items": logs_list,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


async def get_overview_counts(db, query: dict) -> dict:
    """Get overview summary counts: total, today, this week, total templates"""
    now = get_ist_now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {
            "$facet": {
                "total": [{"$count": "count"}],
                "today": [
                    {"$match": {"EventTimeStamp": {"$gte": today_start}}},
                    {"$count": "count"}
                ],
                "week": [
                    {"$match": {"EventTimeStamp": {"$gte": week_start}}},
                    {"$count": "count"}
                ]
            }
        }
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=1)
    facet = results[0] if results else {}

    total_templates = await db[Collections.LOG_MASTER].count_documents({"isDelete": False})

    return {
        "totalLogs": facet.get("total", [{}])[0].get("count", 0) if facet.get("total") else 0,
        "totalTemplates": total_templates,
        "todayLogs": facet.get("today", [{}])[0].get("count", 0) if facet.get("today") else 0,
        "weekLogs": facet.get("week", [{}])[0].get("count", 0) if facet.get("week") else 0
    }


async def get_level_breakdown(db, query: dict) -> dict:
    """Get log counts grouped by logLevel (via $lookup to audit_log_master)"""
    pipeline = []
    if query:
        pipeline.append({"$match": query})

    pipeline.extend([
        {
            "$lookup": {
                "from": Collections.LOG_MASTER,
                "localField": "eventcode",
                "foreignField": "eventCode",
                "as": "master"
            }
        },
        {"$unwind": {"path": "$master", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": {"$toLower": {"$ifNull": ["$master.logLevel", "info"]}},
                "count": {"$sum": 1}
            }
        }
    ])

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    breakdown = {"info": 0, "warning": 0, "error": 0}
    for r in results:
        level = (r["_id"] or "info").lower()
        if level in ("warning", "warn"):
            breakdown["warning"] += r["count"]
        elif level == "error":
            breakdown["error"] += r["count"]
        else:
            breakdown["info"] += r["count"]
    return breakdown


async def get_top_users(db, query: dict, limit: int = 10) -> list:
    """Get top users by audit log count with personnel name lookup"""
    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$group": {"_id": "$actorId", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": "personnel_master",
                "localField": "_id",
                "foreignField": "_id",
                "as": "personnel"
            }
        },
        {"$unwind": {"path": "$personnel", "preserveNullAndEmptyArrays": True}},
        {
            "$project": {
                "_id": 0,
                "actorId": {"$toString": "$_id"},
                "name": {"$ifNull": ["$personnel.name", "Unknown"]},
                "count": 1
            }
        }
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    return await cursor.to_list(length=None)


async def get_top_endpoints(db, query: dict, limit: int = 10) -> list:
    """Get top endpoints by audit log count"""
    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$match": {"endpoint": {"$ne": None, "$ne": ""}}},
        {"$group": {"_id": "$endpoint", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {"$project": {"_id": 0, "endpoint": "$_id", "count": 1}}
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    return await cursor.to_list(length=None)


async def get_most_repeated(db, query: dict, limit: int = 10) -> list:
    """Get most repeated log templates by eventcode"""
    pipeline = [
        {"$match": query} if query else {"$match": {}},
        {"$match": {"eventcode": {"$ne": None, "$ne": ""}}},
        {"$group": {"_id": "$eventcode", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {
            "$lookup": {
                "from": Collections.LOG_MASTER,
                "localField": "_id",
                "foreignField": "eventCode",
                "as": "master"
            }
        },
        {"$unwind": {"path": "$master", "preserveNullAndEmptyArrays": True}},
        {
            "$project": {
                "_id": 0,
                "eventcode": "$_id",
                "name": {"$ifNull": ["$master.name", "$_id"]},
                "logObject": {"$ifNull": ["$master.logObject", ""]},
                "count": 1
            }
        }
    ]

    cursor = db[Collections.LOG_TRANSACTION].aggregate(pipeline)
    return await cursor.to_list(length=None)


async def get_template_health(db) -> dict:
    """Get audit_log_master template health status"""
    pipeline = [
        {
            "$facet": {
                "total": [{"$count": "count"}],
                "active": [{"$match": {"isDelete": False, "isActive": True}}, {"$count": "count"}],
                "inactive": [{"$match": {"isDelete": False, "isActive": False}}, {"$count": "count"}],
                "deleted": [{"$match": {"isDelete": True}}, {"$count": "count"}]
            }
        }
    ]
    cursor = db[Collections.LOG_MASTER].aggregate(pipeline)
    results = await cursor.to_list(length=1)
    facet = results[0] if results else {}

    total = facet.get("total", [{}])[0].get("count", 0) if facet.get("total") else 0
    active = facet.get("active", [{}])[0].get("count", 0) if facet.get("active") else 0
    inactive = facet.get("inactive", [{}])[0].get("count", 0) if facet.get("inactive") else 0
    deleted = facet.get("deleted", [{}])[0].get("count", 0) if facet.get("deleted") else 0

    # Check which active templates have log entries (fast: use distinct instead of $lookup)
    used_eventcodes = set(await db[Collections.LOG_TRANSACTION].distinct("eventcode"))
    active_masters_cursor = db[Collections.LOG_MASTER].find(
        {"isDelete": False, "isActive": True}, {"eventCode": 1}
    )
    active_masters_list = await active_masters_cursor.to_list(length=None)
    active_with_logs = sum(1 for m in active_masters_list if m.get("eventCode") in used_eventcodes)

    return {
        "total": total,
        "activeWithLogs": active_with_logs,
        "activeNoLogs": active - active_with_logs,
        "inactive": inactive,
        "deleted": deleted
    }


@router.get(
    "/dashboard",
    response_model=StandardResponse[DashboardResponse],
    responses={
        200: {"description": "Dashboard data retrieved successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse}
    }
)
async def get_dashboard_data(
    request: Request,
    page: int = Query(1, ge=1, description="Page number for logs list"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page for logs list"),
    layer: Optional[str] = Query(None, description="Filter by layer"),
    entityType: Optional[str] = Query(None, description="Filter by entityType"),
    eventcode: Optional[str] = Query(None, description="Filter by eventcode"),
    search: Optional[str] = Query(None, description="Search in message"),
    fromDate: Optional[datetime] = Query(None, description="Filter logs from this date"),
    toDate: Optional[datetime] = Query(None, description="Filter logs until this date"),
    timeline: Optional[str] = Query(None, description="Timeline filter (lastHour, last24Hours, last7Days, last30Days)"),
    paramKey: Optional[str] = Query(None, description="Parameter key to filter by (e.g. vehicleId)"),
    paramValue: Optional[str] = Query(None, description="Parameter value to search for"),
    actorId: Optional[str] = Query(None, description="Filter by actor/user ID"),
    sortField: Optional[str] = Query("EventTimeStamp", description="Field to sort by"),
    sortOrder: Optional[int] = Query(-1, description="Sort order: 1=asc, -1=desc"),
    tab: Optional[str] = Query(None, description="Tab to fetch data for: overview, activity, or None for all"),

):
    """
    Get combined dashboard data including:
    - Analytics (layer counts)
    - Log volume trend (based on selected timeline or all timelines)
    - Top logged entity types
    - Paginated audit logs list
    """

    db = get_database()

    query = await build_filter_query(
        db,
        layer=layer,
        entityType=entityType,
        eventcode=eventcode,
        search=search,
        fromDate=fromDate,
        toDate=toDate,
        timeline=timeline,
        paramKey=paramKey,
        paramValue=paramValue,
        actorId=actorId
    )

    # Fetch only what the active tab needs
    empty_trend = {"lastHour": [], "last24Hours": [], "last7Days": [], "last30Days": []}

    if tab == "activity":
        # Activity Log tab: logs + overview counts (for header cards) + allEntityTypes for filter
        logs, overview, by_level, all_entity_types = await asyncio.gather(
            get_paginated_logs(db, query, page, page_size, sortField or "EventTimeStamp", sortOrder or -1),
            get_overview_counts(db, query),
            get_level_breakdown(db, query),
            get_all_entity_types(db)
        )
        return success_response(
            data={
                "analytics": {"total": 0},
                "trend": empty_trend,
                "topLogModules": [],
                "logs": logs,
                "overview": overview,
                "byLevel": by_level,
                "topUsers": [],
                "topEndpoints": [],
                "mostRepeated": [],
                "templateHealth": {"total": 0, "activeWithLogs": 0, "activeNoLogs": 0, "inactive": 0, "deleted": 0},
                "allEntityTypes": all_entity_types
            },
            message="Activity log data retrieved successfully",
            status_code=200
        )

    elif tab == "overview":
        # Overview tab: everything except paginated logs and trend (trend not used in UI)
        (analytics, top_log_entities, overview, by_level,
         top_users, top_endpoints, most_repeated, template_health,
         all_entity_types) = await asyncio.gather(
            get_analytics_counts(db, query),
            get_top_log_entities(db, query),
            get_overview_counts(db, query),
            get_level_breakdown(db, query),
            get_top_users(db, query),
            get_top_endpoints(db, query),
            get_most_repeated(db, query),
            get_template_health(db),
            get_all_entity_types(db)
        )
        return success_response(
            data={
                "analytics": analytics,
                "trend": empty_trend,
                "topLogModules": top_log_entities,
                "logs": {"items": [], "total": 0, "page": 1, "page_size": page_size, "total_pages": 0},
                "overview": overview,
                "byLevel": by_level,
                "topUsers": top_users,
                "topEndpoints": top_endpoints,
                "mostRepeated": most_repeated,
                "templateHealth": template_health,
                "allEntityTypes": all_entity_types
            },
            message="Overview data retrieved successfully",
            status_code=200
        )

    else:
        # Default: fetch everything
        (analytics, trend, top_log_entities, logs, overview, by_level,
         top_users, top_endpoints, most_repeated, template_health,
         all_entity_types) = await asyncio.gather(
            get_analytics_counts(db, query),
            get_trend_data(db, query, timeline),
            get_top_log_entities(db, query),
            get_paginated_logs(db, query, page, page_size, sortField or "EventTimeStamp", sortOrder or -1),
            get_overview_counts(db, query),
            get_level_breakdown(db, query),
            get_top_users(db, query),
            get_top_endpoints(db, query),
            get_most_repeated(db, query),
            get_template_health(db),
            get_all_entity_types(db)
        )
        return success_response(
            data={
                "analytics": analytics,
                "trend": trend,
                "topLogModules": top_log_entities,
                "logs": logs,
                "overview": overview,
                "byLevel": by_level,
                "topUsers": top_users,
                "topEndpoints": top_endpoints,
                "mostRepeated": most_repeated,
                "templateHealth": template_health,
                "allEntityTypes": all_entity_types
            },
            message="Dashboard data retrieved successfully",
            status_code=200
        )


@router.get(
    "/all-users",
    response_model=StandardResponse,
    responses={
        200: {"description": "All distinct users retrieved successfully"}
    }
)
async def get_all_users(request: Request):
    """Get all personnel from personnel_master for user filter dropdown"""
    db = get_database()

    cursor = db["personnel_master"].find(
        {"isDelete": {"$ne": True}},
        {"_id": 1, "name": 1}
    ).sort("name", 1)
    personnel_list = await cursor.to_list(length=None)

    results = [
        {"actorId": str(p["_id"]), "name": p.get("name", "Unknown")}
        for p in personnel_list if p.get("name")
    ]

    return success_response(
        data=results,
        message="All users retrieved successfully",
        status_code=200
    )


@router.get(
    "/all-templates",
    response_model=StandardResponse,
    responses={
        200: {"description": "All log templates retrieved successfully"}
    }
)
async def get_all_templates(request: Request):
    """Get all audit log master templates for filter dropdown"""
    db = get_database()

    cursor = db[Collections.LOG_MASTER].find(
        {"isDelete": False},
        {"eventCode": 1, "name": 1, "logObject": 1, "logLevel": 1, "isActive": 1, "keyFields": 1}
    ).sort("eventCode", 1)
    templates = await cursor.to_list(length=None)

    results = []
    for t in templates:
        results.append({
            "eventCode": t.get("eventCode", ""),
            "name": t.get("name", ""),
            "logObject": t.get("logObject", ""),
            "logLevel": t.get("logLevel", ""),
            "isActive": t.get("isActive", True),
            "keyFields": t.get("keyFields", "")
        })

    return success_response(
        data=results,
        message="All templates retrieved successfully",
        status_code=200
    )


@router.get(
    "/export",
    responses={
        200: {"description": "CSV export of audit logs", "content": {"text/csv": {}}},
    }
)
async def export_logs_csv(
    request: Request,
    layer: Optional[str] = Query(None, description="Filter by layer"),
    actorId: Optional[str] = Query(None, description="Filter by actor/user ID"),
    eventcode: Optional[str] = Query(None, description="Filter by eventcode"),
    entityType: Optional[str] = Query(None, description="Filter by entityType"),
    endpoint: Optional[str] = Query(None, description="Filter by endpoint"),
    search: Optional[str] = Query(None, description="Search in message"),
    fromDate: Optional[datetime] = Query(None, description="Filter logs from this date"),
    toDate: Optional[datetime] = Query(None, description="Filter logs until this date"),
):
    """Export filtered audit logs as CSV (max 10,000 records)"""
    db = get_database()

    query = {}
    if layer:
        query["layer"] = layer
    if actorId:
        try:
            query["actorId"] = ObjectId(actorId)
        except Exception:
            pass
    if eventcode:
        query["eventcode"] = eventcode
    if entityType:
        query["entityType"] = entityType
    if endpoint:
        query["endpoint"] = {"$regex": endpoint, "$options": "i"}
    if search:
        query["message"] = {"$regex": search, "$options": "i"}
    if fromDate or toDate:
        date_query = {}
        if fromDate:
            date_query["$gte"] = fromDate
        if toDate:
            date_query["$lte"] = toDate
        query["EventTimeStamp"] = date_query

    cursor = db[Collections.LOG_TRANSACTION].find(query).sort("EventTimeStamp", -1).limit(10000)
    logs = await cursor.to_list(length=10000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "Layer", "Event Code", "Message", "Actor Role", "Endpoint", "Entity Type", "Entity ID", "Org Unit ID"])

    for log in logs:
        writer.writerow([
            str(log.get("EventTimeStamp", "")),
            log.get("layer", ""),
            log.get("eventcode", ""),
            log.get("message", ""),
            log.get("actorRole", ""),
            log.get("endpoint", ""),
            log.get("entityType", ""),
            log.get("entityId", ""),
            log.get("orgUnitId", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs_export.csv"}
    )
