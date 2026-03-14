"""
Error Log Service.

This module provides the business logic layer for error log management.
It handles the lifecycle of error logs from creation to archival, including
message resolution, severity snapshots, and data export.

Key Features:
    - Append-only hot log storage for active error tracking
    - String normalization via valueSets for consistent error codes
    - Severity snapshot from errorMaster at log-time for historical accuracy
    - CSV streaming exporter for bulk data export
    - Nightly archive job moving old logs from hot to archive collection

Architecture:
    - Hot Collection: Active error logs for real-time monitoring
    - Archive Collection: Historical error logs for compliance and analysis
    - Error Master: Error code definitions with message templates

Functions:
    - log_error_occurrence: Create a new error log entry
    - search_error_logs: Query logs with filters and pagination
    - export_error_logs_csv_stream: Stream error logs as CSV
    - run_error_log_archive_job: Move old logs to archive
    - ensure_error_log_indexes: Create MongoDB indexes

Usage:
    from app.api.v1.services.error_log_service import log_error_occurrence

    await log_error_occurrence(db, error_data)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import AsyncIterator, Dict, Optional, Any, List

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
import csv
import io
import re

from app.core.value_sets import normalize_code      # your existing util
from app.utils.mongo import parse_object_id         # your existing util
from app.utils.time_utils import get_ist_now        # use IST for consistency

from app.api.v1.schemas.error_log_schema import (
    ErrorLogCreateSchema,
    ErrorLogResponseSchema,
    ErrorLogSearchParams,
    PaginatedErrorLogs,
)
from app.utils.sanitize import sanitize_parameters
from app.constants.collections import Collections

# Use centralized collection names
HOT_COL = Collections.ERROR_LOGS
ARCHIVE_COL = "error_logs_archive"
MASTER_COL = Collections.ERROR_MASTER

PLACEHOLDER_RE = re.compile(r"\{([a-z][a-zA-Z0-9]*)\}")

# ---------- Indexes ----------
async def ensure_error_log_indexes(db: AsyncIOMotorDatabase) -> None:
    # Hot
    await db[HOT_COL].create_index([("eventDateTime", -1)], name="idx_eventDateTime_desc")
    await db[HOT_COL].create_index("errorCode", name="idx_errorCode")
    await db[HOT_COL].create_index("errorSeverity", name="idx_errorSeverity")
    await db[HOT_COL].create_index("sourceType", name="idx_sourceType")
    await db[HOT_COL].create_index("sourceName", name="idx_sourceName")
    await db[HOT_COL].create_index("actorUserId", name="idx_actorUserId")
    await db[HOT_COL].create_index("environment", name="idx_environment")
    await db[HOT_COL].create_index([("resolvedMessage", "text")], name="text_resolvedMessage")
    # Archive mirrors
    await db[ARCHIVE_COL].create_index([("eventDateTime", -1)], name="idx_eventDateTime_desc")
    await db[ARCHIVE_COL].create_index("errorCode", name="idx_errorCode")
    await db[ARCHIVE_COL].create_index("errorSeverity", name="idx_errorSeverity")
    await db[ARCHIVE_COL].create_index("sourceType", name="idx_sourceType")
    await db[ARCHIVE_COL].create_index("sourceName", name="idx_sourceName")
    await db[ARCHIVE_COL].create_index("actorUserId", name="idx_actorUserId")
    await db[ARCHIVE_COL].create_index("environment", name="idx_environment")
    await db[ARCHIVE_COL].create_index([("resolvedMessage", "text")], name="text_resolvedMessage")

# ---------- Master lookup & templating ----------
async def _load_error_master(db: AsyncIOMotorDatabase, error_code: str) -> Dict[str, Any]:
    doc = await db[MASTER_COL].find_one({"errorCode": error_code})
    if not doc:
        # as per constraints: error_code must exist in master at log-time
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="errorCode does not exist in master")
    return doc

def _pick_template(messages: List[Dict[str, Any]], lang: str) -> Optional[str]:
    if not messages:
        return None
    lang = (lang or "en").lower()
    # exact
    for m in messages:
        if (m.get("language") or "").lower() == lang:
            return m.get("template")
    # fallback to en
    for m in messages:
        if (m.get("language") or "").lower() == "en":
            return m.get("template")
    # else first available
    return messages[0].get("template")

def _format_template(t: Optional[str], params: Dict[str, Any]) -> Optional[str]:
    if not t:
        return None

    def repl(match):
        key = match.group(1)
        return str(params.get(key, "{" + key + "}"))

    return PLACEHOLDER_RE.sub(repl, t)

# ---------- Create ----------
async def log_error_occurrence(db: AsyncIOMotorDatabase, payload: ErrorLogCreateSchema) -> ErrorLogResponseSchema:
    # Normalize via valueSets for fields that are code-driven
    # src_type = await normalize_code(db, "sourceType", payload.sourceType) if payload.sourceType else None
    # env = await normalize_code(db, "environment", payload.environment) if payload.environment else None
    src_type = (
    await safe_normalize(db, "sourceType", payload.sourceType)
    if payload.sourceType else None
)

    env = (
        await safe_normalize(db, "environment", payload.environment)
        if payload.environment else None
    )

    # Load master and snapshot severity
    master = await _load_error_master(db, payload.errorCode)
    severity = (master.get("errorSeverity") or "LOW")          # UPPERCASE expected in master

    # Sanitize inputs
    params_s = sanitize_parameters(payload.parametersJson or {})

    # Resolve message (if master.log == true)
    language = payload.language or "en"
    resolved: Optional[str] = None
    if master.get("log", False):
        template = _pick_template(master.get("messages", []), language)
        resolved = _format_template(template, params_s)
        if not resolved:
            # as per constraints: if master.log=true, resolvedMessage must be non-empty
            raise HTTPException(status_code=400, detail="Resolved message empty while master.log=true")

    # Build append-only document
    doc: Dict[str, Any] = {
        "errorCode": payload.errorCode,
        "errorSeverity": severity,
        "eventDateTime": get_ist_now(),  # IST time for consistency
        "actorUserId": parse_object_id(payload.actorUserId) if payload.actorUserId else None,
        "sourceType": src_type,
        "sourceName": payload.sourceName,
        "userAgent": payload.userAgent,
        "environment": env,
        "resolvedMessage": resolved,
        "parameters": [p.model_dump() for p in (payload.parameters or [])],
        "parametersJson": params_s,
    }

    res = await db[HOT_COL].insert_one(doc)
    return ErrorLogResponseSchema(
        id=str(res.inserted_id),
        errorCode=doc["errorCode"],
        errorSeverity=doc["errorSeverity"],
        eventDateTime=doc["eventDateTime"],
        actorUserId=str(doc["actorUserId"]) if doc.get("actorUserId") else None,
        sourceType=doc["sourceType"],
        sourceName=doc["sourceName"],
        userAgent=doc.get("userAgent"),
        environment=doc.get("environment"),
        resolvedMessage=doc.get("resolvedMessage"),
        parameters=doc.get("parameters"),
    )

# ---------- Search ----------
async def _build_query(p: ErrorLogSearchParams) -> Dict[str, Any]:
    q: Dict[str, Any] = {}
    if p.errorCode: q["errorCode"] = p.errorCode
    if p.errorSeverity: q["errorSeverity"] = p.errorSeverity
    if p.sourceType: q["sourceType"] = p.sourceType
    if p.sourceName: q["sourceName"] = p.sourceName
    if p.actorUserId:
        # Accept either hex or plain; try to parse as ObjectId
        try:
            q["actorUserId"] = parse_object_id(p.actorUserId)
        except Exception:
            q["actorUserId"] = p.actorUserId
    if p.environment: q["environment"] = p.environment
    if p.fromDate or p.toDate:
        q["eventDateTime"] = {}
        if p.fromDate:
            q["eventDateTime"]["$gte"] = p.fromDate
        if p.toDate:
            q["eventDateTime"]["$lte"] = p.toDate
    if p.q:
        # text search on resolvedMessage (text index required)
        q["$text"] = {"$search": p.q}
    return q

async def search_error_logs(
    db: AsyncIOMotorDatabase,
    params: ErrorLogSearchParams,
    include_archive: bool = False
) -> PaginatedErrorLogs:
    q = await _build_query(params)

    hot_cur = db[HOT_COL].find(q, sort=[("eventDateTime", -1)])
    if include_archive:
        arc_cur = db[ARCHIVE_COL].find(q, sort=[("eventDateTime", -1)])
        hot = [doc async for doc in hot_cur]
        arc = [doc async for doc in arc_cur]
        combined = sorted(hot + arc, key=lambda d: d.get("eventDateTime", datetime.min), reverse=True)
        total = len(combined)
        start = (params.page - 1) * params.page_size
        end = start + params.page_size
        page_docs = combined[start:end]
    else:
        total = await db[HOT_COL].count_documents(q)
        start = (params.page - 1) * params.page_size
        page_docs = [doc async for doc in hot_cur.skip(start).limit(params.page_size)]

    data = [
        ErrorLogResponseSchema(
            id=str(d["_id"]),
            errorCode=d["errorCode"],
            errorSeverity=d["errorSeverity"],
            eventDateTime=d["eventDateTime"],
            actorUserId=(str(d["actorUserId"]) if d.get("actorUserId") else None),
            sourceType=d["sourceType"],
            sourceName=d["sourceName"],
            userAgent=d.get("userAgent"),
            environment=d.get("environment"),
            resolvedMessage=d.get("resolvedMessage"),
            parameters=d.get("parameters"),
        )
        for d in page_docs
    ]

    return PaginatedErrorLogs(
        data=data, totalItems=total, page=params.page, page_size=params.page_size
    )
from fastapi import HTTPException

async def safe_normalize(db, key: str, value: str):
    """
    Wraps normalize_code() and returns a clean API 422 instead of crashing with 500.
    """
    try:
        return await normalize_code(db, key, value)
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "validation_error",
                "field": key,
                "message": str(e),
            }
        )

# ---------- CSV Export ----------
async def export_error_logs_csv_stream(
    db: AsyncIOMotorDatabase,
    params: ErrorLogSearchParams,
    include_archive: bool = False
) -> AsyncIterator[bytes]:
    q = await _build_query(params)

    header = [
        "id", "eventDateTime", "errorCode", "errorSeverity",
        "sourceType", "sourceName", "actorUserId",
        "environment", "userAgent", "resolvedMessage",
    ]

    def _row(doc: Dict[str, Any]) -> List[str]:
        return [
            str(doc.get("_id")),
            (doc.get("eventDateTime") or "").isoformat() if doc.get("eventDateTime") else "",
            doc.get("errorCode", ""),
            doc.get("errorSeverity", ""),
            doc.get("sourceType", ""),
            doc.get("sourceName", ""),
            (str(doc.get("actorUserId")) if doc.get("actorUserId") else ""),
            doc.get("environment", "") or "",
            doc.get("userAgent", "") or "",
            (doc.get("resolvedMessage") or "").replace("\n", " ").replace("\r", " "),
        ]

    async def _emit_cursor(cur):
        buf = io.StringIO()
        writer = csv.writer(buf)
        wrote_header = False
        async for d in cur:
            if not wrote_header:
                writer.writerow(header)
                wrote_header = True
            writer.writerow(_row(d))
            yield buf.getvalue().encode("utf-8")
            buf.seek(0)
            buf.truncate(0)
        if not wrote_header:
            writer.writerow(header)
            yield buf.getvalue().encode("utf-8")

    if include_archive:
        hot_cur = db[HOT_COL].find(q, sort=[("eventDateTime", -1)])
        async for chunk in _emit_cursor(hot_cur):
            yield chunk
        arc_cur = db[ARCHIVE_COL].find(q, sort=[("eventDateTime", -1)])
        async for chunk in _emit_cursor(arc_cur):
            yield chunk
    else:
        cur = db[HOT_COL].find(q, sort=[("eventDateTime", -1)])
        async for chunk in _emit_cursor(cur):
            yield chunk

# ---------- Archive Job ----------
async def run_error_log_archive_job(
    db: AsyncIOMotorDatabase,
    cutoff: Optional[datetime] = None
) -> Dict[str, Any]:
    """
    Moves batches from hot to archive; idempotent by _id.
    Default cutoff = now - 90 days.
    """
    cutoff = cutoff or (utc_now() - timedelta(days=90))
    q = {"eventDateTime": {"$lte": cutoff}}
    moved = 0
    async for d in db[HOT_COL].find(q, projection=None):
        try:
            await db[ARCHIVE_COL].update_one({"_id": d["_id"]}, {"$setOnInsert": d}, upsert=True)
            await db[HOT_COL].delete_one({"_id": d["_id"]})
            moved += 1
        except Exception:
            # best effort
            continue
    return {"moved": moved, "cutoff": cutoff.isoformat()}
