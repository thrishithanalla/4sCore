"""
Error Logger Service for centralized error logging.

This module provides functions to log errors to the error_logs collection
in MongoDB. It can be used throughout the application to record errors
with full context including stack traces, parameters, and user information.

Usage:
    from app.api.v1.services.error_logger import log_error, log_error_with_exception
    from app.constants.error_codes import ErrorCodes

    # Basic error logging
    await log_error(
        request=request,
        error_code=ErrorCodes.UNIT_CREATE_FAILED,
        parameters={"unitName": "Test Unit", "reason": "Database error"},
        actor_user_id=current_user.id
    )

    # Error logging with exception (auto-extracts stack trace)
    try:
        # some operation
    except Exception as e:
        await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"unitName": "Test Unit"},
            exception=e,
            actor_user_id=current_user.id
        )
"""
from __future__ import annotations

import logging
import re
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.core.database import get_database
from app.constants.collections import Collections
from app.utils.time_utils import get_ist_now
from app.utils.sanitize import sanitize_parameters


# Module logger for internal logging
logger = logging.getLogger(__name__)

# Source identification for error logs
SOURCE_TYPE = "api"
SOURCE_NAME = "CoreService"

# Collection names
ERROR_LOGS_COLLECTION = Collections.ERROR_LOGS
ERROR_MASTER_COLLECTION = Collections.ERROR_MASTER

# Placeholder pattern for message templates
PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z][a-zA-Z0-9_]*)\}")

# Environment mapping to normalize environment values
# Error Log API accepts: DEV, PROD, QA (case-insensitive)
ENVIRONMENT_MAP = {
    "development": "DEV",
    "dev": "DEV",
    "production": "PROD",
    "prod": "PROD",
    "qa": "QA",
    "test": "QA",
    "testing": "QA",
    "staging": "QA",
}

def normalize_environment(env: str) -> str:
    """Normalize environment value for Error Log API.

    The Error Log API only accepts: DEV, PROD, QA (case-insensitive).
    This function maps common environment names to these valid values.
    """
    if not env:
        return "DEV"
    env_lower = env.lower().strip()
    return ENVIRONMENT_MAP.get(env_lower, env.upper())

async def log_error(
    request: Optional[Request],
    error_code: str,
    parameters: Optional[Dict[str, Any]] = None,
    actor_user_id: Optional[str] = None,
    environment: Optional[str] = None,
    language: str = "en",
    source_type: Optional[str] = None,
    source_name: Optional[str] = None,
    db: Optional[AsyncIOMotorDatabase] = None
) -> Optional[Dict[str, Any]]:
    """
    Log an error to the error_logs collection in MongoDB.

    This function creates an error log entry with all relevant context
    including the error code, parameters, user information, and optional
    stack trace.

    Args:
        request: FastAPI Request object for extracting headers and IP.
                 Can be None for background tasks or non-request contexts.
        error_code: Error code from ErrorCodes class (e.g., "ERR.CORE.UNIT.CREATE.FAILED").
        parameters: Dictionary of values to replace template {placeholders} in error message.
        actor_user_id: User ID who triggered the error (ObjectId hex string).
        environment: Environment name (e.g., "production", "development").
                     Defaults to settings.ENVIRONMENT if not provided.
        stack: Stack trace string for debugging.
        language: ISO-639-1 language code for message template (default: "en").
        source_type: Override source type (default: "api").
        source_name: Override source name (default: "CoreService").
        db: Optional database instance. If not provided, uses get_database().

    Returns:
        Dict containing the created error log document with 'id' field,
        or None if logging failed.

    Example:
        await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"unitName": "Test Unit", "reason": "Database connection failed"},
            actor_user_id="507f1f77bcf86cd799439011"
        )
    """
    try:
        # Get database connection
        if db is None:
            db = get_database()

        if db is None:
            logger.warning("Database not available for error logging")
            return None

        # Extract request information
        user_agent: Optional[str] = None
        endpoint: Optional[str] = None
        method: Optional[str] = None

        if request is not None:
            user_agent = request.headers.get("User-Agent", "")[:512]  # Max 512 chars
            endpoint = str(request.url.path) if request.url else None
            method = request.method

        # Resolve environment
        env = environment or getattr(settings, 'ENVIRONMENT', None)

        # Sanitize inputs
        params_sanitized = sanitize_parameters(parameters or {})

        # Try to load error master and resolve message
        error_severity = "MEDIUM"  # Default severity
        resolved_message: Optional[str] = None

        try:
            master = await db[ERROR_MASTER_COLLECTION].find_one({"errorCode": error_code})
            if master:
                error_severity = master.get("errorSeverity", "MEDIUM")
                # Try to resolve message template
                if master.get("log", True):  # Default to logging if not specified
                    template = _pick_template(master.get("messages", []), language)
                    resolved_message = _format_template(template, params_sanitized)
        except Exception as e:
            logger.debug(f"Could not load error master for {error_code}: {e}")
            # Continue without master data - we still want to log the error

        # Convert parameters to list format for storage
        parameters_list: List[Dict[str, str]] = []
        if parameters:
            for key, value in parameters.items():
                parameters_list.append({
                    "name": str(key),
                    "value": str(value) if value is not None else ""
                })

        # Build error log document
        doc: Dict[str, Any] = {
            "errorCode": error_code,
            "errorSeverity": error_severity,
            "eventDateTime": get_ist_now(),
            "actorUserId": _parse_object_id_safe(actor_user_id),
            "sourceType": source_type or SOURCE_TYPE,
            "sourceName": source_name or SOURCE_NAME,
            "userAgent": user_agent,
            "environment": env,
            "endpoint": endpoint,
            "method": method,
            "resolvedMessage": resolved_message,
            "parameters": parameters_list,
            "parametersJson": params_sanitized,
            "createdAt": get_ist_now(),
        }

        # Insert into database
        result = await db[ERROR_LOGS_COLLECTION].insert_one(doc)

        logger.debug(f"Error logged successfully: {error_code} (ID: {result.inserted_id})")

        return {
            "id": str(result.inserted_id),
            "errorCode": error_code,
            "errorSeverity": error_severity,
            "eventDateTime": doc["eventDateTime"],
            "resolvedMessage": resolved_message
        }

    except Exception as e:
        # Don't let error logging failures crash the application
        logger.warning(f"Failed to log error {error_code}: {str(e)}")
        return None


async def log_error_with_exception(
    request: Optional[Request],
    error_code: str,
    parameters: Optional[Dict[str, Any]],
    exception: Exception,
    actor_user_id: Optional[str] = None,
    environment: Optional[str] = None,
    language: str = "en",
    source_type: Optional[str] = None,
    source_name: Optional[str] = None,
    db: Optional[AsyncIOMotorDatabase] = None
) -> Optional[Dict[str, Any]]:
    """
    Log an error with automatic stack trace extraction from an exception.

    This is a convenience wrapper around log_error() that automatically
    extracts the stack trace from the provided exception.

    Args:
        request: FastAPI Request object.
        error_code: Error code from ErrorCodes class.
        parameters: Values to replace template {placeholders}.
        exception: The exception that was raised.
        actor_user_id: User ID who triggered the error.
        environment: Environment name.
        language: ISO-639-1 language code.
        source_type: Override source type.
        source_name: Override source name.
        db: Optional database instance.

    Returns:
        Dict containing the API response or None if logging failed.

    Example:
        try:
            await create_unit(data)
        except Exception as e:
            await log_error_with_exception(
                request=request,
                error_code=ErrorCodes.UNIT_CREATE_FAILED,
                parameters={"unitName": data.get("name"), "reason": str(e)},
                exception=e,
                actor_user_id=current_user.id
            )
            raise
    """
    # Add exception message to parameters if not already present
    params = dict(parameters) if parameters else {}
    if "exceptionType" not in params:
        params["exceptionType"] = type(exception).__name__
    if "exceptionMessage" not in params:
        params["exceptionMessage"] = str(exception)

    return await log_error(
        request=request,
        error_code=error_code,
        parameters=params,
        actor_user_id=actor_user_id,
        environment=environment,
        language=language,
        source_type=source_type,
        source_name=source_name,
        db=db
    )


def get_user_id_from_token(request: Request) -> Optional[str]:
    """
    Extract user ID from JWT token in request for error logging.

    This is a utility function to get the user ID when the current_user
    dependency is not available (e.g., in exception handlers).

    Args:
        request: FastAPI Request object.

    Returns:
        User ID string or None if not available.
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
    except Exception:
        return None


def get_user_id_from_request(request: Request) -> Optional[str]:
    """
    Try to get user ID from request state or token.

    Args:
        request: FastAPI Request object.

    Returns:
        User ID string or None if not available.
    """
    # First try to get from request state (set by auth middleware)
    if hasattr(request.state, "user_id"):
        return request.state.user_id

    if hasattr(request.state, "current_user"):
        user = request.state.current_user
        if hasattr(user, "id"):
            return user.id

    # Fall back to extracting from token
    return get_user_id_from_token(request)


# =============================================================================
# Helper Functions (Private)
# =============================================================================

def _pick_template(messages: List[Dict[str, Any]], lang: str) -> Optional[str]:
    """
    Pick the appropriate message template based on language.

    Args:
        messages: List of message templates with 'language' and 'template' keys.
        lang: Desired language code.

    Returns:
        Template string or None if not found.
    """
    if not messages:
        return None

    lang = (lang or "en").lower()

    # Try exact match
    for m in messages:
        if (m.get("language") or "").lower() == lang:
            return m.get("template")

    # Fall back to English
    for m in messages:
        if (m.get("language") or "").lower() == "en":
            return m.get("template")

    # Return first available
    return messages[0].get("template") if messages else None


def _format_template(template: Optional[str], params: Dict[str, Any]) -> Optional[str]:
    """
    Format a message template with parameters.

    Args:
        template: Template string with {placeholders}.
        params: Dictionary of parameter values.

    Returns:
        Formatted string or None if template is None.
    """
    if not template:
        return None

    def repl(match):
        key = match.group(1)
        value = params.get(key)
        if value is not None:
            return str(value)
        return "{" + key + "}"  # Keep placeholder if no value

    return PLACEHOLDER_RE.sub(repl, template)


def _parse_object_id_safe(value: Optional[str]) -> Optional[ObjectId]:
    """
    Safely parse a string to ObjectId.

    Args:
        value: String to parse.

    Returns:
        ObjectId or None if parsing fails.
    """
    if not value:
        return None
    try:
        return ObjectId(value)
    except Exception:
        return None

# Error code constants for Audit Log Service
class ErrorCodes:
    """Error codes for the Audit Log Service."""

    # Log operation errors
    LOG_CREATE_FAILED = "ERR.CORE.LOG.CREATE_FAILED"
    LOG_NOT_FOUND = "ERR.CORE.LOG.NOT_FOUND"
    LOG_INVALID_OBJECTID = "ERR.CORE.LOG.INVALID_OBJECTID"
    LOG_VALIDATION_FAILED = "ERR.CORE.LOG.VALIDATION_FAILED"
    LOG_FETCH_FAILED = "ERR.CORE.LOG.FETCH_FAILED"
    LOG_UPDATE_FAILED = "ERR.CORE.LOG.UPDATE_FAILED"
    LOG_DELETE_FAILED = "ERR.CORE.LOG.DELETE_FAILED"

    # Log Code errors
    LOG_CODE_NOT_FOUND = "ERR.CORE.LOG_CODE.NOT_FOUND"

    # Log Master errors
    LOG_MASTER_CREATE_FAILED = "ERR.CORE.LOG_MASTER.CREATE_FAILED"
    LOG_MASTER_NOT_FOUND = "ERR.CORE.LOG_MASTER.NOT_FOUND"
    LOG_MASTER_DUPLICATE = "ERR.CORE.LOG_MASTER.DUPLICATE"
    LOG_MASTER_UPDATE_FAILED = "ERR.CORE.LOG_MASTER.UPDATE_FAILED"
    LOG_MASTER_DELETE_FAILED = "ERR.CORE.LOG_MASTER.DELETE_FAILED"
    LOG_MASTER_BULK_CREATE_FAILED = "ERR.CORE.LOG_MASTER.BULK_CREATE_FAILED"

    # Chain/Seal errors
    CHAIN_SEAL_FAILED = "ERR.CORE.CHAIN.SEAL_FAILED"
    CHAIN_VERIFY_FAILED = "ERR.CORE.CHAIN.VERIFY_FAILED"
    CHAIN_NOT_FOUND = "ERR.CORE.CHAIN.NOT_FOUND"

    # Authentication errors
    AUTH_TOKEN_MISSING = "ERR.CORE.AUTH.TOKEN_MISSING"
    AUTH_TOKEN_INVALID = "ERR.CORE.AUTH.TOKEN_INVALID"
    AUTH_TOKEN_EXPIRED = "ERR.CORE.AUTH.TOKEN_EXPIRED"
    AUTH_INVALID_CREDENTIALS = "ERR.CORE.AUTH.INVALID_CREDENTIALS"
    AUTH_INVALID_TOKEN = "ERR.CORE.AUTH.INVALID_TOKEN"
    AUTH_ACCESS_DENIED = "ERR.CORE.AUTH.ACCESS_DENIED"
    AUTH_INCOMPLETE_TOKEN = "ERR.CORE.AUTH.INCOMPLETE_TOKEN"

    # Permission errors
    PERMISSION_DENIED = "ERR.CORE.PERMISSION.DENIED"
    PERMISSION_ADMIN_REQUIRED = "ERR.CORE.PERMISSION.ADMIN_REQUIRED"
    PERMISSION_NOT_FOUND = "ERR.CORE.PERMISSION.NOT_FOUND"

    # Database errors
    DATABASE_CONNECTION_FAILED = "ERR.CORE.DATABASE.CONNECTION_FAILED"
    DATABASE_OPERATION_FAILED = "ERR.CORE.DATABASE.OPERATION_FAILED"

    # Validation errors
    VALIDATION_FAILED = "ERR.CORE.VALIDATION.FAILED"
    VALIDATION_INVALID_OBJECTID = "ERR.CORE.VALIDATION.INVALID_OBJECTID"
    VALIDATION_REQUIRED = "ERR.CORE.VALIDATION.REQUIRED"
    VALIDATION_DUPLICATE = "ERR.CORE.VALIDATION.DUPLICATE"
    VALIDATION_NO_FIELDS = "ERR.CORE.VALIDATION.NO_FIELDS"
    VALIDATION_INVALID_USER_ID = "ERR.CORE.VALIDATION.INVALID_USER_ID"

    # HTTP errors
    HTTP_UNAUTHORIZED = "ERR.CORE.HTTP.UNAUTHORIZED"
    HTTP_FORBIDDEN = "ERR.CORE.HTTP.FORBIDDEN"
    HTTP_NOT_FOUND = "ERR.CORE.HTTP.NOT_FOUND"
    HTTP_VALIDATION_FAILED = "ERR.CORE.HTTP.VALIDATION_FAILED"

    # Server errors
    SERVER_INTERNAL_ERROR = "ERR.CORE.SERVER.INTERNAL_ERROR"

    # Foreign Key errors
    FK_NOT_FOUND = "ERR.CORE.FK.NOT_FOUND"
    FK_DELETED = "ERR.CORE.FK.DELETED"

    # Module errors
    MODULE_NOT_FOUND = "ERR.CORE.MODULE.NOT_FOUND"
    MODULE_DELETED = "ERR.CORE.MODULE.DELETED"

    # Resource errors
    RESOURCE_NOT_FOUND = "ERR.CORE.RESOURCE.NOT_FOUND"
    ROLE_NOT_FOUND = "ERR.CORE.ROLE.NOT_FOUND"
    USER_NOT_FOUND = "ERR.CORE.USER.NOT_FOUND"

    # Request/Response errors
    REQUEST_VALIDATION_FAILED = "ERR.CORE.REQUEST.VALIDATION_FAILED"
    RESPONSE_VALIDATION_FAILED = "ERR.CORE.RESPONSE.VALIDATION_FAILED"
