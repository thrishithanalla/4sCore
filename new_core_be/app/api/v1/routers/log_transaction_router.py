"""
Audit Log Router
CRUD operations for audit log entry management.
"""
from typing import List, Optional
from datetime import datetime, timedelta
import asyncio

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Query, Request
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

    if timeline == "lastHour":
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
    timeline: Optional[str] = None
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
        query["message"] = {"$regex": search, "$options": "i"}

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
            "_id": "$layer",
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


async def get_paginated_logs(db, query: dict, page: int, page_size: int) -> dict:
    """Get paginated audit logs based on filter query"""
    skip = (page - 1) * page_size

    cursor = db[Collections.LOG_TRANSACTION].find(query).sort("EventTimeStamp", -1).skip(skip).limit(page_size)
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
        timeline=timeline
    )

    analytics_task = get_analytics_counts(db, query)
    trend_task = get_trend_data(db, query, timeline)
    top_entities_task = get_top_log_entities(db, query)
    logs_task = get_paginated_logs(db, query, page, page_size)

    analytics, trend, top_log_entities, logs = await asyncio.gather(
        analytics_task,
        trend_task,
        top_entities_task,
        logs_task
    )

    return success_response(
        data={
            "analytics": analytics,
            "trend": trend,
            "topLogModules": top_log_entities,
            "logs": logs
        },
        message="Dashboard data retrieved successfully",
        status_code=200
    )
