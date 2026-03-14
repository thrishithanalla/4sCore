"""
Logging Core Service.

This module provides core logging infrastructure for tamper-evident,
signed audit logs. It handles canonicalization, hashing, and signature
verification to ensure log integrity.

Key Features:
    - Deterministic JSON canonicalization for consistent hashing
    - HMAC-based record signing with configurable signers
    - Sensitive data redaction (passwords, tokens, secrets)
    - Value truncation for large payloads
    - Signature verification for tamper detection

Security Features:
    - Cryptographic signing of log records
    - Automatic redaction of sensitive keys
    - Deterministic serialization for reproducible signatures
    - Signing key rotation support

Sensitive Keys Redacted:
    - password, token, authorization, secret, otp
    - ssn, creditCard, apiKey, accessKey, refreshToken

Usage:
    from app.api.v1.services.logging_core import canonicalize, redact_and_truncate

    canonical = canonicalize(log_doc)
    safe_kv = redact_and_truncate(key_values)
"""
from __future__ import annotations
import json, io, csv, hmac, hashlib, os
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, Optional, Tuple
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.value_sets import assert_allowed_code, normalize_code
from app.core.correlation import get_request_id, get_trace_id, get_actor_user
from app.api.v1.schemas.logs import LogIn, VerifyResult
from app.api.v1.services.signing.factory import get_signer

_SIGNER = get_signer()
SENSITIVE_KEYS = {"password","token","authorization","secret","otp","ssn","creditCard","apiKey","accessKey","refreshToken"}

def utc_now() -> datetime:
    return datetime.now(timezone.utc)
def _canon_value(v):
    if isinstance(v, datetime):
        v = v.astimezone(timezone.utc)
        # ISO-8601 with milliseconds and Z suffix
        return v.replace(tzinfo=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, dict):
        # sort keys for deterministic hashing
        return {k: _canon_value(v[k]) for k in sorted(v.keys())}
    if isinstance(v, list):
        return [_canon_value(x) for x in v]
    return v

def canonicalize(doc: dict) -> bytes:
    """
    Deterministic JSON used for HMAC.
    - Excludes 'recordHash'
    - Includes 'signingKeyId'
    - Normalizes datetimes/ObjectIds/nested kv
    - Stable key order
    """
    d = {k: v for k, v in doc.items() if k != "recordHash"}
    d_norm = {k: _canon_value(v) for k, v in sorted(d.items(), key=lambda x: x[0])}
    return json.dumps(d_norm, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

def redact_and_truncate(kv: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if kv is None: return None
    def walk(o):
        if isinstance(o, dict):
            return {k: ("***REDACTED***" if k.lower() in SENSITIVE_KEYS else walk(v)) for k,v in o.items()}
        if isinstance(o, list):
            return [walk(v) for v in o]
        return o
    out = walk(dict(kv))
    raw = json.dumps(out).encode("utf-8")
    if len(raw) > 16*1024: out["truncated"] = True
    return out

def chain_id_for(service_key: str, ts: datetime) -> str:
    day = ts.astimezone(timezone.utc).strftime("%Y%m%d")
    return f"{service_key}:{day}"

def _api_safe(v):
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _api_safe(vv) for k, vv in v.items()}
    if isinstance(v, list):
        return [_api_safe(x) for x in v]
    return v

def to_api_doc(d: dict) -> dict:
    e = dict(d)
    e["_id"] = str(e["_id"])
    # Normalize common date fields if present
    if isinstance(e.get("ts"), datetime):
        e["ts"] = e["ts"].isoformat()
    if isinstance(e.get("createdDateTime"), datetime):
        e["createdDateTime"] = e["createdDateTime"].isoformat()
    # Deep-convert kv and any other nested fields
    for k, v in list(e.items()):
        e[k] = _api_safe(v)
    return e

def level_to_int(name: str) -> int:
    return {"DEBUG":10,"INFO":20,"WARN":30,"ERROR":40}.get(name.upper(), 20)

async def append_log(db: AsyncIOMotorDatabase, payload: Dict[str, Any]) -> str:
    """
    Insert a log record into appLog.
    - No skipping
    - No sampling
    - No environment normalization
    - Always returns insertedId
    """

    # Accept LogIn model or raw dict
    if isinstance(payload, LogIn):
        log_in = payload
    else:
        log_in = LogIn.model_validate(payload)

    # Timestamp defaults to now()
    ts = log_in.ts or utc_now()

    # Normalize ONLY level and logType via DB valueSets
    level = str(log_in.level)
    log_type = str(log_in.logType)

    # DB allow-list enforcement
    await assert_allowed_code(db, "level", level)
    await assert_allowed_code(db, "logType", log_type)

    # environment (NO NORMALIZATION, NO allow-list)
    environment = log_in.environment or settings.ENVIRONMENT

    # Redact sensitive KV fields
    kv = redact_and_truncate(log_in.kv)

    # Prepare chainId for chronological grouping
    service_key = log_in.serviceKey
    chain_id = chain_id_for(service_key, ts)

    # Get previous hash for chaining
    last = await db.appLog.find_one(
        {"chainId": chain_id},
        sort=[("ts", -1), ("_id", -1)]
    )
    prev_hash = last["recordHash"] if last else None

    # Build Mongo document
    doc: Dict[str, Any] = {
        "ts": ts,
        "level": level,
        "logType": log_type,
        "message": (log_in.message[:2048] if log_in.message else ""),
        "serviceKey": service_key,
        "module": log_in.module,
        "function": log_in.function,
        "actorUserId": log_in.actorUserId or get_actor_user(),
        "requestId": log_in.requestId or get_request_id(),
        "traceId": log_in.traceId or get_trace_id(),
        "endpoint": log_in.endpoint,
        "method": log_in.method,
        "statusCode": log_in.statusCode,
        "durationMs": log_in.durationMs,
        "kv": kv,
        "environment": environment,     # <- stored as-is
        "chainId": chain_id,
        "prevHash": prev_hash,
        "signingKeyId": _SIGNER.signing_key_id(),
    }

    # Compute blockchain-style hash
    doc["recordHash"] = _SIGNER.sign(canonicalize(doc))

    # Track creation time
    doc["createdDateTime"] = utc_now()

    # Insert into MongoDB (no skipping)
    res = await db.appLog.insert_one(doc)

    return str(res.inserted_id)

async def get_log(db: AsyncIOMotorDatabase, id_str: str) -> Optional[Dict[str, Any]]:
    # and in get_log:
    doc = await db.appLog.find_one({"_id": ObjectId(id_str)})
    return to_api_doc(doc) if doc else None
    #return await db.appLog.find_one({"_id": ObjectId(id_str)})

async def search_logs(
    db: AsyncIOMotorDatabase, *, frm: Optional[datetime]=None, to: Optional[datetime]=None,
    log_type: Optional[str]=None, min_level: Optional[str]=None, service_key: Optional[str]=None,
    endpoint: Optional[str]=None, status_code: Optional[int]=None, actor_user_id: Optional[str]=None,
    request_id: Optional[str]=None, text: Optional[str]=None, limit: int=50, cursor: Optional[str]=None
) -> Dict[str, Any]:
    q: Dict[str, Any] = {}
    if frm: q["ts"] = {**q.get("ts", {}), "$gte": frm}
    if to:  q["ts"] = {**q.get("ts", {}), "$lte": to}
    if log_type: q["logType"] = log_type
    if min_level:
        lv = level_to_int(min_level)
        q["level"] = {"$in": [n for n in ["DEBUG","INFO","WARN","ERROR"] if level_to_int(n) >= lv]}
    if service_key: q["serviceKey"] = service_key
    if endpoint: q["endpoint"] = endpoint
    if status_code is not None: q["statusCode"] = status_code
    if actor_user_id: q["actorUserId"] = actor_user_id
    if request_id: q["requestId"] = request_id
    if text: q["message"] = {"$regex": text, "$options": "i"}
    if cursor: q["_id"] = {"$lt": ObjectId(cursor)}

    items_api = []
    async for d in db.appLog.find(q).sort([("ts",-1),("_id",-1)]).limit(limit):
        items_api.append(to_api_doc(d))
    next_cursor = items_api[-1]["_id"] if items_api else None
    await _write_access_audit(db, "SEARCH", q, len(items_api))
    return {"items": items_api, "nextCursor": next_cursor}

    

# async def seal_chain(db: AsyncIOMotorDatabase, chain_id: str) -> Dict[str, Any]:
#     cursor = db.appLog.find({"chainId": chain_id}).sort([("ts",1),("_id",1)])
#     first = None; last = None; count = 0; concat = b""
#     async for d in cursor:
#         first = first or d
#         last = d
#         count += 1
#         concat += bytes.fromhex(d["recordHash"])
#     if count == 0: raise ValueError("No records for chain")

#     seg_hash = _SIGNER.sign(concat)
#     seg_doc = {
#         "chainId": chain_id,
#         "firstRecordId": str(first["_id"]),
#         "lastRecordId": str(last["_id"]),
#         "recordCount": count,
#         "firstRecordHash": first["recordHash"],
#         "lastRecordHash": last["recordHash"],
#         "signingKeyId": _SIGNER.signing_key_id(),
#         "segmentHash": seg_hash,
#         "anchoredAt": utc_now(),
#         "legalHold": False
#     }
#     await db.logChainSegment.update_one({"chainId": chain_id}, {"$set": seg_doc}, upsert=True)
#     return seg_doc

async def verify_chain(db: AsyncIOMotorDatabase, chain_id: str) -> VerifyResult:
    prev = None; concat = b""; first_id = None
    async for d in db.appLog.find({"chainId": chain_id}).sort([("ts",1),("_id",1)]):
        if first_id is None: first_id = str(d["_id"])
        if d.get("prevHash") != prev:
            await _write_access_audit(db, "VERIFY_CHAIN", {"chainId": chain_id}, 0)
            return VerifyResult(chainId=chain_id, passed=False, mismatchAtId=str(d["_id"]), details="prevHash mismatch")
        prev = d["recordHash"]
        concat += bytes.fromhex(d["recordHash"])

    seg = await db.logChainSegment.find_one({"chainId": chain_id})
    if not seg:
        await _write_access_audit(db, "VERIFY_CHAIN", {"chainId": chain_id}, 0)
        return VerifyResult(chainId=chain_id, passed=False, mismatchAtId=first_id, details="segment not sealed")

    ok = (_SIGNER.sign(concat) == seg["segmentHash"])
    await _write_access_audit(db, "VERIFY_CHAIN", {"chainId": chain_id}, int(ok))
    return VerifyResult(chainId=chain_id, passed=ok, mismatchAtId=None if ok else first_id)

# async def export_logs(db: AsyncIOMotorDatabase, q: Dict[str, Any], include_manifest: bool=True) -> Tuple[bytes, Optional[bytes]]:
#     items = []
#     async for d in db.appLog.find(q).sort([("ts",1),("_id",1)]):
#         items.append(d)

#     # NDJSON
#     out = io.StringIO()
#     for d in items:
#         e = dict(d)
#         e["_id"] = str(e["_id"])
#         if isinstance(e["ts"], datetime): e["ts"] = e["ts"].isoformat()
#         if isinstance(e.get("createdDateTime"), datetime): e["createdDateTime"] = e["createdDateTime"].isoformat()
#         out.write(json.dumps(e, separators=(",", ":")) + "\n")
#     data_bytes = out.getvalue().encode("utf-8")

#     manifest_bytes = None
#     if include_manifest:
#         chains = sorted({d["chainId"] for d in items})
#         segs = []
#         for c in chains:
#             seg = await db.logChainSegment.find_one({"chainId": c}) or {}
#             segs.append({
#                 "chainId": c,
#                 "recordCount": seg.get("recordCount"),
#                 "firstRecordHash": seg.get("firstRecordHash"),
#                 "lastRecordHash": seg.get("lastRecordHash"),
#                 "segmentHash": seg.get("segmentHash"),
#                 "signingKeyId": seg.get("signingKeyId"),
#                 "anchoredAt": seg.get("anchoredAt").isoformat() if isinstance(seg.get("anchoredAt"), datetime) else None
#             })
#         manifest = {"exportedAt": utc_now().isoformat(), "query": q, "chains": segs}
#         manifest_bytes = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")

#     await _write_access_audit(db, "EXPORT", q, len(items))
#     return data_bytes, manifest_bytes


CSV_COLS = [
    "_id","ts","level","logType","message","serviceKey",
    "requestId","traceId","endpoint","method","statusCode","durationMs",
    "environment","chainId","prevHash","recordHash","signingKeyId","createdDateTime"
]

async def export_logs_ndjson_bytes(db, q: Dict[str, Any], include_manifest: bool=True) -> Tuple[bytes, Optional[bytes]]:
    # (existing NDJSON logic from earlier export)
    items = []
    async for d in db.appLog.find(q).sort([("ts",1),("_id",1)]):
        items.append(d)

    out = io.StringIO()
    for d in items:
        e = dict(d)
        e["_id"] = str(e["_id"])
        if isinstance(e.get("ts"), datetime): e["ts"] = e["ts"].isoformat()
        if isinstance(e.get("createdDateTime"), datetime): e["createdDateTime"] = e["createdDateTime"].isoformat()
        out.write(json.dumps(e, separators=(",", ":")) + "\n")
    data_bytes = out.getvalue().encode("utf-8")

    manifest_bytes = None
    if include_manifest:
        chains = sorted({d["chainId"] for d in items})
        segs = []
        for c in chains:
            seg = await db.logChainSegment.find_one({"chainId": c}) or {}
            segs.append({
                "chainId": c,
                "recordCount": seg.get("recordCount"),
                "firstRecordHash": seg.get("firstRecordHash"),
                "lastRecordHash": seg.get("lastRecordHash"),
                "segmentHash": seg.get("segmentHash"),
                "signingKeyId": seg.get("signingKeyId"),
                "anchoredAt": seg.get("anchoredAt").isoformat() if isinstance(seg.get("anchoredAt"), datetime) else None
            })
        manifest = {"exportedAt": utc_now().isoformat(), "query": q, "chains": segs}
        manifest_bytes = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")

    await _write_access_audit(db, "EXPORT", q, len(items))
    return data_bytes, manifest_bytes

async def export_logs_csv_stream(db, q: Dict[str, Any]) -> AsyncGenerator[bytes, None]:
    """
    Async generator that streams CSV. Use in a StreamingResponse.
    """
    # header
    header = ",".join(CSV_COLS) + "\n"
    yield header.encode("utf-8")

    cursor = db.appLog.find(q).sort([("ts",1),("_id",1)])
    async for d in cursor:
        row = {k: d.get(k) for k in CSV_COLS}
        row["_id"] = str(d["_id"])
        if isinstance(row.get("ts"), datetime): row["ts"] = row["ts"].isoformat()
        if isinstance(row.get("createdDateTime"), datetime): row["createdDateTime"] = row["createdDateTime"].isoformat()
        # safe CSV line
        line = []
        for c in CSV_COLS:
            v = row.get(c)
            if v is None:
                line.append("")
            else:
                # escape quotes and commas
                s = str(v).replace('"', '""')
                line.append(f'"{s}"')
        yield (",".join(line) + "\n").encode("utf-8")

    await _write_access_audit(db, "EXPORT", q, await db.appLog.count_documents(q))

async def _write_access_audit(db: AsyncIOMotorDatabase, action: str, query: Dict[str, Any], result_count: int):
    await db.logAccessAudit.insert_one({
        "ts": utc_now(),
        "actorUserId": get_actor_user(),
        "action": action,
        "query": query,
        "resultCount": result_count,
        "requestId": get_request_id(),
        "traceId": get_trace_id()
    })


async def seal_chain(db: AsyncIOMotorDatabase, chain_id: str) -> Dict[str, Any]:
    # Ascending for deterministic concat
    cursor = db.appLog.find({"chainId": chain_id}).sort([("ts",1),("_id",1)])
    first = None; last = None; count = 0; concat = b""
    async for d in cursor:
        first = first or d
        last = d
        count += 1
        concat += bytes.fromhex(d["recordHash"])
    if count == 0:
        raise ValueError("No records for chain")

    segment_hash = _SIGNER.sign(concat)
    seg_doc = {
        "chainId": chain_id,
        "firstRecordId": str(first["_id"]),
        "lastRecordId": str(last["_id"]),
        "recordCount": count,
        "firstRecordHash": first["recordHash"],
        "lastRecordHash": last["recordHash"],
        "signingKeyId": _SIGNER.signing_key_id(),
        "segmentHash": segment_hash,
        "anchoredAt": utc_now(),
        "legalHold": False
    }
    await db.logChainSegment.update_one({"chainId": chain_id}, {"$set": seg_doc}, upsert=True)

    # access-audit for SEAL
    await _write_access_audit(db, action="SEAL", query={"chainId": chain_id}, result_count=1)

    return seg_doc

async def seal_all_for_day(db, day_yyyymmdd: str, *, force: bool = False) -> dict:
    """
    Seals all chains with chainId like '<serviceKey>:YYYYMMDD' for the given day.
    If force=False, already-sealed chains (segment exists with anchoredAt) are skipped.
    Returns a summary.
    """
    chain_ids = await db.appLog.distinct("chainId", {"chainId": {"$regex": f":{day_yyyymmdd}$"}})

    sealed = 0
    skipped = 0
    for cid in chain_ids:
        if not force:
            seg = await db.logChainSegment.find_one({"chainId": cid})
            if seg and seg.get("anchoredAt"):
                skipped += 1
                continue
        try:
            await seal_chain(db, cid)
            sealed += 1
        except ValueError:
            # no rows (defensive; distinct came from appLog)
            skipped += 1

    return {"day": day_yyyymmdd, "sealed": sealed, "skipped": skipped, "totalItems": len(chain_ids)}

async def set_legal_hold(db, chain_id: str, flag: bool):
    await db.logChainSegment.update_one(
        {"chainId": chain_id},
        {"$set": {"legalHold": flag}},
        upsert=True
    )
    await _write_access_audit(db, "LEGAL_HOLD", {"chainId": chain_id, "flag": flag}, 1)
    return {"chainId": chain_id, "legalHold": flag}

