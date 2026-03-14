"""
Transaction Logger Service for centralized activity/audit logging.

This module provides integration with the Log Transaction API for centralized
activity logging across microservices.
"""
import httpx
from typing import Optional, Dict, Any, Literal
from fastapi import Request
from datetime import datetime, timezone, timedelta

from app.core.config import settings
from app.core.logger import logger


# Source identification for transaction logs
SOURCE_NAME = "AuditLogService"

# IST Timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))


# Layer types for log transactions
LayerType = Literal["screen", "function", "api", "config"]

# Level types for log transactions
LevelType = Literal["error", "warning", "info"]


def get_ist_now() -> str:
    """Get current datetime in IST as ISO format string."""
    return datetime.now(IST).isoformat()


async def log_transaction(
    request: Request,
    log_code: str,
    json_values: Dict[str, Any],
    layer: LayerType = "api",
    level: LevelType = "info",
    endpoint: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Log a transaction to the centralized Log Transaction API.

    Args:
        request: FastAPI Request object for extracting headers.
        log_code: LogMaster name/code (e.g., "LOG.CORE.LOG.CREATE_SUCCESS").
        json_values: Values to replace template {placeholders}.
        layer: Where the action occurred: "screen", "function", "api", "config".
        level: Severity level: "error", "warning", "info".
        endpoint: Optional API endpoint or route (max 500 chars).

    Returns:
        Dict containing the API response or None if logging failed.

    Example:
        await log_transaction(
            request=request,
            log_code="LOG.CORE.LOG.CREATE_SUCCESS",
            json_values={
                "logCode": "test.log",
                "userName": "Inspector Sharma",
                "createdAt": get_ist_now()
            },
            layer="api",
            level="info",
            endpoint="/api/v1/log-transactions/create"
        )
    """
    if not getattr(settings, 'LOG_TRANSACTION_API_URL', None):
        logger.warning("Log Transaction API URL not configured, skipping transaction logging")
        return None

    # Extract authorization token for API call
    auth_header = request.headers.get("Authorization", "")

    # Use provided endpoint or extract from request
    if not endpoint:
        endpoint = str(request.url.path)

    payload = {
        "logCode": log_code,
        "json": json_values if json_values else {},
        "layer": layer,
        "level": level
    }

    if endpoint:
        payload["endpoint"] = endpoint[:500]  # Max 500 chars

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.LOG_TRANSACTION_API_URL}/api/v1/log-transactions/create",
                json=payload,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json"
                }
            )
            if response.status_code == 201:
                logger.debug(f"Transaction logged successfully: {log_code}")
                return response.json()
            else:
                logger.warning(
                    f"Failed to log transaction {log_code}: "
                    f"Status {response.status_code}, Response: {response.text}"
                )
                return None

    except httpx.TimeoutException:
        logger.warning(f"Timeout while logging transaction {log_code}")
        return None
    except Exception as e:
        logger.warning(f"Exception while logging transaction {log_code}: {str(e)}")
        return None


def get_user_info_for_log(request: Request) -> Dict[str, Any]:
    """
    Extract user information from JWT token for logging purposes.

    Args:
        request: FastAPI Request object.

    Returns:
        Dict with user info or empty dict if not available.
    """
    from jose import jwt, JWTError

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {}

    token = auth_header.split(" ")[1]

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return {
            "userId": payload.get("id") or payload.get("sub"),
            "userName": payload.get("fullName", ""),
            "userRole": payload.get("roleName", ""),
            "unitId": payload.get("unitId", ""),
            "unitName": payload.get("unitName", ""),
            "districtId": payload.get("districtId", ""),
            "districtName": payload.get("districtName", "")
        }
    except JWTError:
        return {}


def get_client_ip(request: Request) -> Optional[str]:
    """
    Extract client IP address from request headers.

    Args:
        request: FastAPI Request object.

    Returns:
        str: Client IP address or None if unavailable.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


# Log code constants for Audit Log Service
class LogCodes:
    """Log codes for the Audit Log Service transaction logging."""

    # Log Transaction Operations (Write)
    LOG_CREATE_SUCCESS = "LOG.CORE.LOG.CREATE_SUCCESS"
    LOG_CLEANUP_SUCCESS = "LOG.CORE.LOG.CLEANUP_SUCCESS"

    # Log Transaction Operations (Read)
    LOG_FETCH_SUCCESS = "LOG.CORE.LOG.FETCH_SUCCESS"
    LOG_LIST_SUCCESS = "LOG.CORE.LOG.LIST_SUCCESS"
    LOG_PAGINATED_SUCCESS = "LOG.CORE.LOG.PAGINATED_SUCCESS"
    LOG_ANALYTICS_SUCCESS = "LOG.CORE.LOG.ANALYTICS_SUCCESS"

    # Log Master Operations (Write)
    LOG_MASTER_CREATE_SUCCESS = "LOG.CORE.LOG_MASTER.CREATE_SUCCESS"
    LOG_MASTER_BULK_CREATE_SUCCESS = "LOG.CORE.LOG_MASTER.BULK_CREATE_SUCCESS"
    LOG_MASTER_UPDATE_SUCCESS = "LOG.CORE.LOG_MASTER.UPDATE_SUCCESS"
    LOG_MASTER_DELETE_SUCCESS = "LOG.CORE.LOG_MASTER.DELETE_SUCCESS"

    # Log Master Operations (Read)
    LOG_MASTER_FETCH_SUCCESS = "LOG.CORE.LOG_MASTER.FETCH_SUCCESS"
    LOG_MASTER_LIST_SUCCESS = "LOG.CORE.LOG_MASTER.LIST_SUCCESS"

    # Auth Operations (Write/Security)
    AUTH_LOGIN_SUCCESS = "LOG.CORE.AUTH.LOGIN_SUCCESS"
    AUTH_TOKEN_GENERATED = "LOG.CORE.AUTH.TOKEN_GENERATED"

    # Auth Operations (Read)
    AUTH_USER_INFO_SUCCESS = "LOG.CORE.AUTH.USER_INFO_SUCCESS"
    AUTH_DECODE_TOKEN_SUCCESS = "LOG.CORE.AUTH.DECODE_TOKEN_SUCCESS"
    AUTH_PERMISSIONS_SUCCESS = "LOG.CORE.AUTH.PERMISSIONS_SUCCESS"

    # Chain/Seal Operations
    CHAIN_SEAL_SUCCESS = "LOG.CORE.CHAIN.SEAL_SUCCESS"
    CHAIN_VERIFY_SUCCESS = "LOG.CORE.CHAIN.VERIFY_SUCCESS"
    CHAIN_FETCH_SUCCESS = "LOG.CORE.CHAIN.FETCH_SUCCESS"

    # Database Operations
    DB_CONNECT_SUCCESS = "LOG.CORE.DATABASE.CONNECT_SUCCESS"
    DB_DISCONNECT_SUCCESS = "LOG.CORE.DATABASE.DISCONNECT_SUCCESS"
    DB_INDEX_CREATE_SUCCESS = "LOG.CORE.DATABASE.INDEX_CREATE_SUCCESS"

    # System Operations
    SYSTEM_STARTUP = "LOG.CORE.SYSTEM.STARTUP"
    SYSTEM_SHUTDOWN = "LOG.CORE.SYSTEM.SHUTDOWN"


# Template definitions for LogMaster (for reference when creating LogMaster entries)
LOG_TEMPLATES = {
    "LOG.CORE.LOG.CREATE_SUCCESS": {
        "purpose": "Log successful log transaction creation",
        "template": "Log '{logCode}' created by {userName} at {createdAt}.",
        "json": {
            "logCode": "",
            "userName": "",
            "createdAt": "",
            "clientIp": ""
        }
    },
    "LOG.CORE.LOG_MASTER.CREATE_SUCCESS": {
        "purpose": "Log successful log master entry creation",
        "template": "Log Master '{name}' (ID: {logMasterId}) created by {userName}.",
        "json": {
            "logMasterId": "",
            "name": "",
            "userName": "",
            "createdAt": "",
            "clientIp": ""
        }
    },
    "LOG.CORE.CHAIN.SEAL_SUCCESS": {
        "purpose": "Log successful chain sealing",
        "template": "Chain sealed for date {sealDate} by {userName}. Hash: {rootHash}",
        "json": {
            "sealDate": "",
            "rootHash": "",
            "logCount": "",
            "userName": "",
            "sealedAt": "",
            "clientIp": ""
        }
    },
    "LOG.CORE.DATABASE.CONNECT_SUCCESS": {
        "purpose": "Log successful database connection",
        "template": "Connected to database {database}.",
        "json": {
            "database": "",
            "connectedAt": ""
        }
    },
    "LOG.CORE.DATABASE.INDEX_CREATE_SUCCESS": {
        "purpose": "Log successful database index creation",
        "template": "Database indexes created successfully.",
        "json": {
            "createdAt": ""
        }
    }
}
