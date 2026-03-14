# Client IP Capture Implementation Guide

This guide explains how to capture the real client IP address in a FastAPI application deployed behind Cloudflare CDN and Azure Kubernetes.

## Architecture

```
User (Browser) → Cloudflare CDN → Azure Kubernetes (Ingress) → FastAPI App
```

When requests pass through proxies/CDNs, the original client IP gets replaced with the proxy's IP. To get the real user IP, we need to read specific HTTP headers that proxies add.

---

## Step 1: Create the Request Helpers File

Create file: `app/utils/request_helpers.py`

```python
"""
Request Helpers
Utility functions for extracting information from HTTP requests
"""
from fastapi import Request
from typing import Optional


def _is_ipv4(ip: str) -> bool:
    """Check if an IP address is IPv4 format"""
    if not ip:
        return False
    # IPv4: contains dots and no colons (e.g., 192.168.1.1)
    # IPv6: contains colons (e.g., 2001:0db8::1 or ::ffff:192.168.1.1)
    return "." in ip and ":" not in ip


def _extract_ipv4_from_mapped(ip: str) -> Optional[str]:
    """
    Extract IPv4 from IPv6-mapped IPv4 address if present

    IPv6-mapped IPv4 format: ::ffff:192.168.1.1
    """
    if ip and ip.lower().startswith("::ffff:"):
        return ip[7:]  # Remove "::ffff:" prefix
    return None


def _get_ip_from_header(request: Request, header_name: str, split_first: bool = False) -> Optional[str]:
    """Get IP from a specific header"""
    value = request.headers.get(header_name)
    if value:
        if split_first:
            return value.split(",")[0].strip()
        return value.strip()
    return None


def _normalize_ip(ip: str) -> str:
    """
    Normalize IP address - extract IPv4 from mapped format if present
    """
    if not ip:
        return ip
    # Check if it's an IPv6-mapped IPv4 (::ffff:x.x.x.x)
    mapped_ipv4 = _extract_ipv4_from_mapped(ip)
    if mapped_ipv4:
        return mapped_ipv4
    return ip


def get_client_ip(request: Request) -> str:
    """
    Extract real client IP address from request (Cloudflare + Azure Kubernetes deployment)

    Priority order (returns first available):
    1. CF-Connecting-IP (Cloudflare) - MOST TRUSTED
    2. True-Client-IP (Enterprise Cloudflare)
    3. X-Forwarded-For (first IP)
    4. X-Real-IP
    5. X-Original-Forwarded-For (Azure)
    6. Direct connection IP (pod/container IP - LEAST TRUSTED)

    Args:
        request: FastAPI Request object

    Returns:
        Client IP address string (IPv4 or IPv6 - whichever the user has)

    Notes:
        Your setup: User → Cloudflare CDN → Azure Kubernetes → FastAPI
        Cloudflare sets CF-Connecting-IP header with the real user IP
    """
    # Priority 1: CF-Connecting-IP (Cloudflare's trusted header for real client IP)
    cf_ip = _get_ip_from_header(request, "CF-Connecting-IP")
    if cf_ip:
        return _normalize_ip(cf_ip)

    # Priority 2: True-Client-IP (Enterprise Cloudflare or some CDNs)
    true_ip = _get_ip_from_header(request, "True-Client-IP")
    if true_ip:
        return _normalize_ip(true_ip)

    # Priority 3: X-Forwarded-For (Standard proxy header)
    xff_ip = _get_ip_from_header(request, "X-Forwarded-For", split_first=True)
    if xff_ip:
        return _normalize_ip(xff_ip)

    # Priority 4: X-Real-IP (Alternative proxy header)
    real_ip = _get_ip_from_header(request, "X-Real-IP")
    if real_ip:
        return _normalize_ip(real_ip)

    # Priority 5: X-Original-Forwarded-For (Azure-specific)
    orig_xff_ip = _get_ip_from_header(request, "X-Original-Forwarded-For", split_first=True)
    if orig_xff_ip:
        return _normalize_ip(orig_xff_ip)

    # Priority 6: Direct connection IP (pod/container IP in K8s)
    if request.client and request.client.host:
        return _normalize_ip(request.client.host)

    return "unknown"
```

---

## Step 2: Usage in Router/Service

### Option A: Direct Usage in Router

```python
from fastapi import APIRouter, Request
from app.utils.request_helpers import get_client_ip

router = APIRouter()

@router.post("/create")
async def create_item(request: Request, data: CreateSchema):
    # Get client IP
    client_ip = get_client_ip(request)

    # Use in your document
    document = {
        "name": data.name,
        "createdBy": current_user.id,
        "createdIp": client_ip,  # Store the IP
        "createdAt": datetime.utcnow()
    }

    await db.collection.insert_one(document)
    return {"success": True}
```

### Option B: Pass to Service Layer

**Router:**
```python
from fastapi import APIRouter, Request, Depends
from app.utils.request_helpers import get_client_ip
from app.services.my_service import create_item

router = APIRouter()

@router.post("/create")
async def create_item_endpoint(
    request: Request,
    data: CreateSchema,
    current_user = Depends(get_current_user)
):
    client_ip = get_client_ip(request)

    result = await create_item(
        data=data,
        user_id=current_user.id,
        client_ip=client_ip  # Pass IP to service
    )

    return result
```

**Service:**
```python
from datetime import datetime

async def create_item(data, user_id: str, client_ip: str):
    document = {
        "name": data.name,
        "createdBy": user_id,
        "createdIp": client_ip,
        "createdAt": datetime.utcnow()
    }

    result = await db.collection.insert_one(document)
    return {"id": str(result.inserted_id)}
```

---

## Step 3: For Update Operations

```python
@router.patch("/update/{item_id}")
async def update_item(
    request: Request,
    item_id: str,
    data: UpdateSchema,
    current_user = Depends(get_current_user)
):
    client_ip = get_client_ip(request)

    update_data = {
        "$set": {
            **data.dict(exclude_unset=True),
            "updatedBy": current_user.id,
            "updatedIp": client_ip,
            "updatedAt": datetime.utcnow()
        }
    }

    await db.collection.update_one(
        {"_id": ObjectId(item_id)},
        update_data
    )

    return {"success": True}
```

---

## Step 4: Database Schema

Ensure your MongoDB documents have IP fields:

```python
# Example document structure
{
    "_id": ObjectId("..."),
    "name": "Example",

    # Created audit fields
    "createdBy": "user_id_string",
    "createdIp": "192.168.1.1",  # or IPv6: "2001:0db8::1"
    "createdAt": ISODate("2024-01-01T00:00:00Z"),

    # Updated audit fields
    "updatedBy": "user_id_string",
    "updatedIp": "192.168.1.1",
    "updatedAt": ISODate("2024-01-02T00:00:00Z"),

    # Soft delete
    "isActive": True,
    "isDelete": False
}
```

**Note:** IPv6 addresses can be up to 45 characters long. Ensure your IP fields can store at least 45 characters.

---

## Step 5: Cloudflare Configuration

For the `CF-Connecting-IP` header to work:

1. Your domain must be proxied through Cloudflare (orange cloud enabled)
2. In Cloudflare Dashboard → DNS → ensure the record has the orange cloud icon

### Headers Cloudflare Adds:
| Header | Description |
|--------|-------------|
| `CF-Connecting-IP` | Real client IP (most reliable) |
| `True-Client-IP` | Enterprise feature, same as above |
| `X-Forwarded-For` | Standard proxy header (may have multiple IPs) |

---

## Step 6: Testing Locally

When testing locally, you'll get `127.0.0.1` because there's no Cloudflare. To simulate:

```bash
# Using curl with fake header
curl -X POST http://localhost:8000/api/v1/items/create \
  -H "CF-Connecting-IP: 203.0.113.50" \
  -H "Content-Type: application/json" \
  -d '{"name": "test"}'
```

---

## Complete Example: Jobs Router

```python
"""
Jobs Router - Complete example with IP capture
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Request, Depends, HTTPException, status
from bson import ObjectId

from app.schemas.jobs_schema import JobsCreateSchema, JobsUpdateSchema
from app.utils.dependencies import get_current_user
from app.utils.request_helpers import get_client_ip
from app.core.database import get_database
from app.constants.collections import Collections

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.post("/create")
async def create_job(
    request: Request,
    job_data: JobsCreateSchema,
    current_user = Depends(get_current_user)
):
    """Create a new job"""
    db = get_database()
    client_ip = get_client_ip(request)

    # Prepare document
    job_dict = job_data.dict()
    job_dict.update({
        "createdBy": current_user.id,
        "createdIp": client_ip,
        "createdAt": datetime.utcnow(),
        "updatedBy": None,
        "updatedIp": None,
        "updatedAt": None,
        "isActive": True,
        "isDelete": False
    })

    result = await db[Collections.JOBS].insert_one(job_dict)

    return {
        "success": True,
        "data": {"id": str(result.inserted_id)},
        "message": "Job created successfully"
    }


@router.patch("/update/{job_id}")
async def update_job(
    request: Request,
    job_id: str,
    job_data: JobsUpdateSchema,
    current_user = Depends(get_current_user)
):
    """Update an existing job"""
    db = get_database()
    client_ip = get_client_ip(request)

    # Build update data
    update_fields = job_data.dict(exclude_unset=True)
    update_fields.update({
        "updatedBy": current_user.id,
        "updatedIp": client_ip,
        "updatedAt": datetime.utcnow()
    })

    result = await db[Collections.JOBS].update_one(
        {"_id": ObjectId(job_id), "isDelete": False},
        {"$set": update_fields}
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    return {
        "success": True,
        "message": "Job updated successfully"
    }


@router.delete("/delete/{job_id}")
async def delete_job(
    request: Request,
    job_id: str,
    current_user = Depends(get_current_user)
):
    """Soft delete a job"""
    db = get_database()
    client_ip = get_client_ip(request)

    result = await db[Collections.JOBS].update_one(
        {"_id": ObjectId(job_id), "isDelete": False},
        {
            "$set": {
                "isDelete": True,
                "isActive": False,
                "updatedBy": current_user.id,
                "updatedIp": client_ip,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    return {
        "success": True,
        "message": "Job deleted successfully"
    }
```

---

## Summary

| File | Purpose |
|------|---------|
| `app/utils/request_helpers.py` | Contains `get_client_ip()` function |
| Router files | Import and use `get_client_ip(request)` |
| Service files | Receive `client_ip` as parameter |

### Key Points:
1. Always pass `Request` object to your endpoint
2. Call `get_client_ip(request)` to get the real IP
3. Store IP in `createdIp` / `updatedIp` fields
4. IPv6 addresses need at least 45 character storage
5. Cloudflare must have orange cloud enabled for `CF-Connecting-IP` to work
