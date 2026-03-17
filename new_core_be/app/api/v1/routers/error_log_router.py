"""
Error Log Router.

This module provides FastAPI endpoints for managing error log records.
Error logs capture runtime errors, exceptions, and issues that occur
throughout the application for monitoring, debugging, and analytics.

Key Features:
    - Create error log entries with severity levels
    - Search and filter error logs with pagination
    - CSV export for error log data
    - Dashboard analytics with statistics and trends
    - Archive support for historical data

Endpoints:
    POST /create - Create a new error log entry
    GET /list - Search error logs with filters and pagination
    GET /export - Export error logs as CSV stream
    GET /dashboard - Get dashboard statistics and analytics

Collections Used:
    - error_logs: Hot/active error log storage
    - error_logs_archive: Archived historical error logs
    - error_master: Error code definitions and metadata

Usage:
    from app.api.v1.routers.error_log_router import router

    app.include_router(router)
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Request, HTTPException, status
from fastapi.responses import StreamingResponse, JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.error_log_schema import (
    ErrorLogCreateSchema,
    ErrorLogResponseSchema,
    ErrorLogSearchParams,
    PaginatedErrorLogs,
    ErrorLogListPaginatedResponse,
)
from app.api.v1.schemas.error_log_dashboard_schema import (
    TimeRangeEnum,
    ErrorLogDashboardResponse,
    DashboardRequestSchema,
)
from app.api.v1.services.error_log_service import (
    ensure_error_log_indexes,
    export_error_logs_csv_stream,
    log_error_occurrence,
    run_error_log_archive_job,
    search_error_logs
)
from app.api.v1.services.error_log_dashboard_service import get_dashboard_data, get_user_analytics
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.collections import Collections
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CoreErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/error-logs", tags=["error-logs"])

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.ERROR_LOGS

# Module configuration
MODULE_PREFIX = ModulePrefixes.ERROR_LOGS
ENTITY_NAME = "Error Log"
ENTITY_NAME_PLURAL = "Error Logs"

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create error log entry",
    description="Creates a new error log entry in the transaction table."
)
async def create_error_log(
    body: ErrorLogCreateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Create an error log entry.

    This endpoint logs an error occurrence to the error_logs transaction table.
    Unlike master tables, error logs don't have isActive flag as they are
    immutable transaction records.

    **Request Body (ErrorLogCreateSchema):**
    - `errorCode` (required): Reference to error_master errorCode
    - `parameters` (optional): Key-value pairs for message placeholder resolution
    - `sourceType` (optional): Source type (API, UI, SCREEN)
    - `sourceName` (optional): Source name/endpoint
    - `actorUserId` (optional): User ID who triggered the error
    - `stackTrace` (optional): Error stack trace
    - `environment` (optional): Environment (dev, staging, prod)

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Error Log created successfully"
    - `data`: Created error log object with resolved message

    **Error Responses:**
    - 403: Permission denied (CREATE permission required)
    - 500: Internal server error
    """
    try:


        await ensure_error_log_indexes(db)  # safe & idempotent
        created = await log_error_occurrence(db, body)

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=created.model_dump(mode="json"),
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME),
                code=201
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("create_error_log failed")
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_CREATE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_CREATE_FAILED
            )
        )

@router.get(
    "/list",
    response_model=ErrorLogListPaginatedResponse,
    responses={
        200: {
            "description": "List of error logs",
            "model": ErrorLogListPaginatedResponse,
        },
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def list_error_logs_endpoint(
    request: Request,
    q: Optional[str] = Query(None, description="Full-text search on resolvedMessage"),
    errorCode: Optional[str] = Query(None, description="Filter by error code"),
    errorSeverity: Optional[str] = Query(None, description="Filter by severity: CRITICAL, HIGH, MEDIUM, LOW"),
    sourceType: Optional[str] = Query(None, description="Filter by source type: API, UI, SCREEN"),
    sourceName: Optional[str] = Query(None, description="Filter by source name/endpoint"),
    actorUserId: Optional[str] = Query(None, description="Filter by user ID"),
    environment: Optional[str] = Query(None, description="Filter by environment"),
    fromDate: Optional[datetime] = Query(None, description="Filter from this date"),
    toDate: Optional[datetime] = Query(None, description="Filter until this date"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    pageSize: Optional[int] = Query(None, ge=1, le=2000, description="Number of records per page. Required when page is provided."),
    includeArchive: bool = Query(False, description="Include archived error logs"),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    List error logs with optional pagination and filters.

    This endpoint retrieves error log entries with comprehensive filtering
    and optional pagination. Supports searching archived logs.

    **Query Parameters:**
    - `q` (optional): Full-text search on resolvedMessage (regex, case-insensitive)
    - `errorCode` (optional): Filter by specific error code
    - `errorSeverity` (optional): Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
    - `sourceType` (optional): Filter by source type (API, UI, SCREEN)
    - `sourceName` (optional): Filter by source name/endpoint
    - `actorUserId` (optional): Filter by user ID who triggered the error
    - `environment` (optional): Filter by environment
    - `fromDate` (optional): Filter from this date (ISO 8601)
    - `toDate` (optional): Filter until this date (ISO 8601)
    - `page` (optional): Page number (1-indexed), omit for all records
    - `pageSize` (optional): Records per page (1-2000, default: 50)
    - `includeArchive` (optional): Include archived error logs (default: false)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Error Log list fetched successfully"
    - `data`: Array of error log objects
    - `pagination`: { page, pageSize, total, totalPages } (when page provided)

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:


        # Default pageSize to 50 when pagination is requested
        effective_page_size = pageSize if pageSize is not None else 50

        params = ErrorLogSearchParams(
            q=q,
            errorCode=errorCode,
            errorSeverity=errorSeverity,
            sourceType=sourceType,
            sourceName=sourceName,
            actorUserId=actorUserId,
            environment=environment,
            fromDate=fromDate,
            toDate=toDate,
            page=page if page is not None else 1,
            page_size=effective_page_size if page is not None else 10000,
        )
        result = await search_error_logs(db, params, include_archive=includeArchive)

        # Convert to dict for response
        data_list = [item.model_dump(mode="json") for item in result.data]

        # Use paginated response only when pagination is requested
        if page is not None:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_paginated(
                    data=data_list,
                    total=result.total,
                    page=page,
                    page_size=effective_page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )

        # Return simple list response without pagination
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("list_error_logs_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED
            )
        )

@router.get(
    "/export",
    status_code=status.HTTP_200_OK,
    summary="Export error logs to CSV",
    description="Streams error logs as a CSV file download with the same filters as list endpoint."
)
async def export_csv_endpoint(
    request: Request,
    q: Optional[str] = Query(None, description="Full-text search on resolvedMessage"),
    errorCode: Optional[str] = Query(None, description="Filter by error code"),
    errorSeverity: Optional[str] = Query(None, description="Filter by severity"),
    sourceType: Optional[str] = Query(None, description="Filter by source type"),
    sourceName: Optional[str] = Query(None, description="Filter by source name"),
    actorUserId: Optional[str] = Query(None, description="Filter by user ID"),
    environment: Optional[str] = Query(None, description="Filter by environment"),
    fromDate: Optional[datetime] = Query(None, description="Filter from this date"),
    toDate: Optional[datetime] = Query(None, description="Filter until this date"),
    includeArchive: bool = Query(False, description="Include archived error logs"),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Export error logs to CSV.

    This endpoint streams error logs as a CSV file download. Uses the same
    filtering options as the list endpoint but returns all matching records
    in CSV format.

    **Query Parameters:**
    - `q` (optional): Full-text search on resolvedMessage
    - `errorCode` (optional): Filter by specific error code
    - `errorSeverity` (optional): Filter by severity (CRITICAL, HIGH, MEDIUM, LOW)
    - `sourceType` (optional): Filter by source type (API, UI, SCREEN)
    - `sourceName` (optional): Filter by source name/endpoint
    - `actorUserId` (optional): Filter by user ID
    - `environment` (optional): Filter by environment
    - `fromDate` (optional): Filter from this date (ISO 8601)
    - `toDate` (optional): Filter until this date (ISO 8601)
    - `includeArchive` (optional): Include archived error logs (default: false)

    **Response:**
    - Content-Type: text/csv
    - Content-Disposition: attachment; filename="error-logs.csv"
    - Streaming CSV data with headers

    **CSV Columns:**
    - _id, errorCode, resolvedMessage, errorSeverity, sourceType, sourceName,
      actorUserId, environment, createdAt, etc.

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:


        params = ErrorLogSearchParams(
            q=q,
            errorCode=errorCode,
            errorSeverity=errorSeverity,
            sourceType=sourceType,
            sourceName=sourceName,
            actorUserId=actorUserId,
            environment=environment,
            fromDate=fromDate,
            toDate=toDate,
            page=1,
            page_size=10,  # ignored by exporter
        )
        stream = export_error_logs_csv_stream(db, params, include_archive=includeArchive)
        return StreamingResponse(
            stream,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="error-logs.csv"'},
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("export_csv_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED
            )
        )


@router.post(
    "/search",
    responses={
        200: {"description": "Search results"},
        500: {"description": "Internal server error"},
    },
)
async def search_error_logs_post(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Search error logs via POST with pagination. Accepts JSON body with filters:
    errorCode, errorSeverity, sourceType, sourceName, actorUserId, environment,
    endpoint, page, pageSize, sort_by, sort_order, q
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}

        logger.info(f"POST /search body keys: {list(body.keys()) if body else 'empty'}")

        import re as _re
        q: Dict[str, Any] = {}
        if body.get("errorCode"):
            q["errorCode"] = {"$regex": _re.escape(body["errorCode"]), "$options": "i"}
        if body.get("errorSeverity"):
            q["errorSeverity"] = body["errorSeverity"]
        if body.get("sourceType"):
            q["sourceType"] = body["sourceType"]
        if body.get("sourceName"):
            q["sourceName"] = {"$regex": _re.escape(body["sourceName"]), "$options": "i"}
        if body.get("actorUserId"):
            # Try both ObjectId and string match to handle mixed storage
            try:
                from bson import ObjectId
                oid = ObjectId(body["actorUserId"])
                q["actorUserId"] = {"$in": [oid, body["actorUserId"]]}
            except Exception:
                q["actorUserId"] = body["actorUserId"]
        if body.get("environment"):
            q["environment"] = {"$regex": _re.escape(body["environment"]), "$options": "i"}
        if body.get("endpoint"):
            q["endpoint"] = {"$regex": _re.escape(body["endpoint"]), "$options": "i"}
        if body.get("q"):
            escaped_q = _re.escape(body["q"])
            q["$or"] = [
                {"resolvedMessage": {"$regex": escaped_q, "$options": "i"}},
                {"errorCode": {"$regex": escaped_q, "$options": "i"}},
            ]

        logger.info(f"POST /search query: {q}")

        # Pagination
        page = int(body.get("page", 1))
        page_size = int(body.get("pageSize", 50))
        page_size = min(page_size, 500)  # cap at 500
        skip = (page - 1) * page_size

        # Sorting
        sort_by = body.get("sort_by", "eventDateTime")
        sort_order = -1 if body.get("sort_order", "desc") == "desc" else 1

        collections = [Collections.ERROR_LOGS]
        if body.get("includeArchive"):
            collections.append("error_logs_archive")

        # Get total count + unique error codes + unique users
        total = 0
        unique_codes: set = set()
        unique_users: set = set()
        for col_name in collections:
            total += await db[col_name].count_documents(q)
            codes = await db[col_name].distinct("errorCode", q)
            unique_codes.update(c for c in codes if c)
            users = await db[col_name].distinct("actorUserId", q)
            unique_users.update(str(u) for u in users if u)

        # Get paginated results
        all_docs = []
        for col_name in collections:
            cursor = db[col_name].find(q).sort(sort_by, sort_order).skip(skip).limit(page_size)
            docs = await cursor.to_list(length=page_size)
            all_docs.extend(docs)

        logger.info(f"POST /search found: {total} total, returning {len(all_docs)} records (page {page})")

        data_list = []
        for d in all_docs:
            def _serialize(v):
                if v is None:
                    return None
                if hasattr(v, "isoformat"):
                    return v.isoformat()
                if type(v).__name__ == "ObjectId":
                    return str(v)
                if isinstance(v, dict):
                    return {k: _serialize(vv) for k, vv in v.items()}
                if isinstance(v, list):
                    return [_serialize(item) for item in v]
                return v

            row: Dict[str, Any] = {"id": str(d["_id"])}
            for key, val in d.items():
                if key == "_id":
                    continue
                row[key] = _serialize(val)
            data_list.append(row)

        total_pages = max((total + page_size - 1) // page_size, 1)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "code": 200,
                "message": "Search completed",
                "data": data_list,
                "pagination": {
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": total,
                    "totalPages": total_pages,
                    "hasNextPage": page < total_pages,
                    "hasPrevPage": page > 1,
                    "uniqueErrorCodes": len(unique_codes),
                    "uniqueUsers": len(unique_users),
                },
            }
        )
    except Exception as exc:
        logger.exception("search_error_logs_post failed")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "code": 500,
                "message": str(exc),
                "data": [],
            }
        )


@router.post(
    "/user-analytics",
    responses={
        200: {"description": "User analytics data"},
        500: {"description": "Internal server error"},
    },
)
async def get_user_analytics_endpoint(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Get analytics for a specific user: total errors, breakdown by severity/environment/errorCode,
    and recent records. Server-side aggregation for performance.
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}

        actor_user_id = body.get("actorUserId")
        if not actor_user_id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"success": False, "code": 400, "message": "actorUserId is required", "data": None}
            )

        include_archive = body.get("includeArchive", False)

        result = await get_user_analytics(db, actor_user_id, include_archive=include_archive)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "code": 200,
                "message": "User analytics retrieved successfully",
                "data": result,
            }
        )
    except Exception as exc:
        logger.exception("get_user_analytics_endpoint failed")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "code": 500, "message": str(exc), "data": None}
        )


@router.post(
    "/dashboard",
    response_model=ErrorLogDashboardResponse,
    responses={
        200: {
            "description": "Dashboard data with statistics and analytics",
            "model": ErrorLogDashboardResponse,
        },
        400: {"description": "Bad request (invalid time range)"},
        403: {"description": "Permission denied"},
        500: {"description": "Internal server error"},
    },
)
async def get_error_logs_dashboard(
    request: Request,
    body: DashboardRequestSchema,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Get error logs dashboard with statistics, trends, patterns, and impact analysis.

    **Request Body:**
    - `timeRange`: Time range filter (all, 1h, 24h, 7d, 30d) - default: all
    - `fromDate`: Optional start date for custom date range filtering
    - `toDate`: Optional end date for custom date range filtering
    - `sourceType`: Filter by source type (validated against 'sourceType' valueSet)
    - `errorSeverity`: Filter by severity (validated against 'errorSeverity' valueSet)
    - `errorCode`: Filter by specific error code (e.g., ERR.CORE.DEPARTMENT.CREATE.DUPLICATE_NAME)
    - `moduleId`: Filter by module ID (shows only error logs whose error codes belong to this module via error_master)
    - `includeArchive`: Include archived error logs - default: false
    - `page`: Page number for error groups - default: 1
    - `limit`: Items per page for error groups (1-200) - default: 50

    **Response includes:**
    - `summary`: Total errors, unique errors, affected users
    - `byType`: Statistics grouped by sourceType (dynamic keys from valueSet)
    - `bySeverity`: Statistics grouped by severity (dynamic keys from valueSet)
    - `trends`: Hourly trend data for the selected time range
    - `errorGroups`: Paginated error groups sorted by occurrences
    - `pagination`: Pagination info for error groups
    - `patterns`: Error pattern analysis (Database issues, Auth issues, etc.)
    - `impact`: Impact analysis for critical and high severity errors
    """
    try:

        # Get dashboard data
        dashboard_data = await get_dashboard_data(
            db=db,
            time_range=body.timeRange,
            from_date=body.fromDate,
            to_date=body.toDate,
            source_type=body.sourceType,
            error_severity=body.errorSeverity,
            error_code=body.errorCode,
            module_id=body.moduleId,
            include_archive=body.includeArchive,
            page=body.page,
            limit=body.limit,
        )

        # Use exclude_none=True to remove null values (e.g., hour: null in daily trends)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=dashboard_data.model_dump(mode="json", exclude_none=True),
                message="Dashboard data retrieved successfully"
            )
        )

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=str(e),
                error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_error_logs_dashboard failed")
        error_log = await log_error(
            request=request,
            error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CoreErrorCodes.ERROR_LOG_SEARCH_FAILED
            )
        )
