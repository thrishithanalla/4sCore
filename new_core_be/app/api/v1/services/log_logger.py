"""
Log Logger Service for centralized activity/audit logging.

This module provides direct database integration for log transactions,
similar to the uc2_core_auditlog_be service.
"""
import logging
from typing import Optional, Dict, Any, Literal
from fastapi import Request
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.core.config import settings
from app.core.database import get_database
from app.constants.collections import Collections

logger = logging.getLogger(__name__)



# IST Timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))


# Layer types for log transactions
LayerType = Literal["screen", "function", "api", "config"]

# Level types for log transactions
LevelType = Literal["error", "warning", "info"]


def get_ist_now() -> datetime:
    """Get current datetime in IST."""
    return datetime.now(IST)


def get_client_ip(request: Request) -> str:
    """
    Extract client IP address from request headers.

    Args:
        request: FastAPI Request object.

    Returns:
        str: Client IP address.
    """
    # First check X-Client-IP header (custom header from frontend)
    client_ip = request.headers.get("X-Client-IP")
    if client_ip:
        return client_ip.strip()

    # Then check X-Forwarded-For (standard proxy header)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    # Finally fallback to direct client host
    return request.client.host if request.client else "0.0.0.0"


def get_user_id_from_token(request: Request) -> Optional[str]:
    """
    Extract user ID from JWT token in request headers.

    Args:
        request: FastAPI Request object.

    Returns:
        str: User ID or None if not available.
    """
    from jose import jwt, JWTError

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ")[1]

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload.get("id") or payload.get("sub")
    except JWTError:
        return None


def generate_message_from_template(template: str, json_values: dict) -> str:
    """
    Generate message by replacing placeholders in template with json values.

    Args:
        template: Template string with placeholders like {key}
        json_values: Dict with values to replace placeholders

    Returns:
        Generated message with placeholders replaced
    """
    try:
        return template.format(**json_values)
    except KeyError:
        # Fallback: manual replacement for missing keys
        result = template
        for key, value in json_values.items():
            result = result.replace(f"{{{key}}}", str(value))
        return result


async def log_transaction(
    request: Request,
    log_code: str,
    json_values: Dict[str, Any],
    layer: LayerType = "api",
    level: LevelType = "info",
    endpoint: Optional[str] = None,
    actor_user_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Log a transaction directly to the database.

    Args:
        request: FastAPI Request object for extracting headers.
        log_code: LogMaster name/code (e.g., "LOG.CORE.PERSONNEL.CREATED").
        json_values: Values to replace template {placeholders}.
        layer: Where the action occurred: "screen", "function", "api", "config".
        level: Severity level: "error", "warning", "info".
        endpoint: Optional API endpoint or route (max 500 chars).
        actor_user_id: Optional user ID performing the action.

    Returns:
        Dict containing the created log document or None if logging failed.
    """
    try:
        db = get_database()
        if db is None:
            logger.warning("Database not connected, skipping transaction logging")
            return None

        # Get actor user ID from token if not provided
        if not actor_user_id:
            actor_user_id = get_user_id_from_token(request)

        # Use provided endpoint or extract from request
        if not endpoint:
            endpoint = str(request.url.path)

        # Get client IP
        client_ip = get_client_ip(request)

        # Validate log code and get template from log_master
        template_doc = await db[Collections.LOG_MASTER].find_one({
            "name": log_code,
            "isDelete": False
        })

        if not template_doc:
            logger.warning(f"Log code '{log_code}' not found in log_master, skipping logging")
            return None

        # Generate message from template
        template_string = template_doc.get("template", "")
        generated_message = generate_message_from_template(template_string, json_values)

        # Build log document
        log_doc = {
            "layer": layer,
            "level": level,
            "message": generated_message,
            "json": json_values,
            "templateId": template_doc["_id"],
            "createdAt": get_ist_now(),
            "createdIp": client_ip
        }

        # Add endpoint if provided
        if endpoint:
            log_doc["endpoint"] = endpoint[:500]

        # Add actor ID if available
        if actor_user_id:
            try:
                log_doc["actorId"] = ObjectId(actor_user_id)
            except Exception:
                log_doc["actorId"] = actor_user_id

        # Insert into database
        result = await db[Collections.LOG_TRANSACTION].insert_one(log_doc)
        print(f"[OK] LOG TRANSACTION INSERTED: {log_code} -> ID: {result.inserted_id}")

        # Fetch the created document
        created_log = await db[Collections.LOG_TRANSACTION].find_one({"_id": result.inserted_id})

        if created_log:
            # Convert ObjectIds to strings for response
            created_log["_id"] = str(created_log["_id"])
            if "actorId" in created_log and isinstance(created_log["actorId"], ObjectId):
                created_log["actorId"] = str(created_log["actorId"])
            if "templateId" in created_log and isinstance(created_log["templateId"], ObjectId):
                created_log["templateId"] = str(created_log["templateId"])
            created_log["logCode"] = log_code

            logger.debug(f"Transaction logged successfully: {log_code}")
            return created_log

        return None

    except Exception as e:
        logger.warning(f"Exception while logging transaction {log_code}: {str(e)}")
        return None


async def log_activity(
    request: Request,
    log_code: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    action: str = "UNKNOWN",
    details: Optional[Dict[str, Any]] = None,
    level: LevelType = "info",
    actor_user_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Simplified activity logger for common CRUD operations.

    Args:
        request: FastAPI Request object.
        log_code: LogMaster name/code.
        entity_type: Type of entity (e.g., "PERSONNEL", "UNIT").
        entity_id: ID of the entity being acted upon.
        action: Action performed (e.g., "CREATE", "UPDATE", "DELETE").
        details: Additional details about the action.
        level: Log level: "error", "warning", "info".
        actor_user_id: User performing the action.

    Returns:
        Dict containing the API response or None if logging failed.
    """
    # Get user info from token if not provided
    if not actor_user_id:
        actor_user_id = get_user_id_from_token(request)

    # Build json values
    json_values = {
        "entityType": entity_type,
        "action": action,
        "actorUserId": actor_user_id or "SYSTEM"
    }

    if entity_id:
        json_values["entityId"] = entity_id

    if details:
        json_values.update(details)

    return await log_transaction(
        request=request,
        log_code=log_code,
        json_values=json_values,
        layer="api",
        level=level,
        actor_user_id=actor_user_id
    )
