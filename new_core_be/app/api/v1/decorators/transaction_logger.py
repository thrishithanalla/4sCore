"""
Transaction Logger Decorator
Provides automatic transaction logging for successful operations.

PERFORMANCE NOTE:
- Transaction logging is done in the BACKGROUND (non-blocking)
- Uses asyncio.create_task() to avoid adding latency to response
- Logging failures don't affect the response

Usage:
    from app.api.v1.decorators import log_operation

    @router.post("/create")
    @log_operation(LogCodes.UNIT_CREATED, ["_id", "name"])
    async def create_unit(request: Request, current_user: TokenDataSchema, ...):
        created = await unit_service.create_unit(...)
        return JSONResponse(status_code=201, content=api_success(data=created))
"""

from functools import wraps
from typing import Optional, Callable, Any, List, Dict, Union
import logging
import json
import asyncio

from fastapi import Request
from fastapi.responses import JSONResponse

from app.api.v1.services.log_logger import log_transaction


logger = logging.getLogger(__name__)


async def _safe_log_transaction(request: Request, log_code: str, json_values: dict, level: str):
    """
    Background-safe transaction logging wrapper.
    Catches any errors to prevent unhandled exceptions in background tasks.
    """
    try:
        await log_transaction(
            request=request,
            log_code=log_code,
            json_values=json_values,
            level=level
        )
    except Exception as e:
        logger.warning(f"Background log_transaction failed for {log_code}: {e}")


def log_operation(
    log_code: str,
    extract_fields: Optional[List[str]] = None,
    level: str = "info",
    log_on_success_only: bool = True
):
    """
    Decorator to automatically log successful operations.

    This decorator wraps an endpoint and logs the transaction after
    successful execution (2xx response).

    Args:
        log_code: The log code for the transaction (e.g., LogCodes.UNIT_CREATED)
        extract_fields: List of field names to extract from response data for logging
                       (e.g., ["_id", "name"] will log {"_id": "...", "name": "..."})
        level: Log level ("info", "warning", "error")
        log_on_success_only: Only log for 2xx responses (default: True)

    Usage:
        @router.post("/create")
        @log_operation(LogCodes.UNIT_CREATED, ["_id", "name"])
        async def create_unit(request: Request, current_user: TokenDataSchema, unit: UnitCreateSchema):
            created = await unit_service.create_unit(unit, current_user.id, client_ip)
            return JSONResponse(
                status_code=201,
                content=api_success(data=created, message="Unit created successfully")
            )

    Note:
        The decorator extracts data from the JSON response body to include in logs.
        It looks for response.data or the response itself for field extraction.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Extract request and current_user from kwargs
            request: Optional[Request] = kwargs.get("request")
            current_user = kwargs.get("current_user")

            # If request not in kwargs, try to find it in args
            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            # Execute the endpoint function
            response = await func(*args, **kwargs)

            # Log on success (2xx responses)
            if request and isinstance(response, JSONResponse):
                status_code = response.status_code

                should_log = (
                    (log_on_success_only and 200 <= status_code < 300) or
                    (not log_on_success_only)
                )

                if should_log:
                    try:
                        # Extract json_values for logging
                        json_values = _extract_log_values(
                            response=response,
                            current_user=current_user,
                            extract_fields=extract_fields
                        )

                        # Log the transaction in BACKGROUND (non-blocking)
                        # This ensures logging doesn't add latency to the response
                        asyncio.create_task(
                            _safe_log_transaction(request, log_code, json_values, level)
                        )

                    except Exception as e:
                        # Don't fail the request if logging fails
                        logger.warning(f"Failed to log transaction {log_code}: {e}")

            return response

        return wrapper
    return decorator


def _extract_log_values(
    response: JSONResponse,
    current_user: Any,
    extract_fields: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Extract values from response for logging.

    Args:
        response: The JSONResponse object
        current_user: The current user object
        extract_fields: List of field names to extract from response data

    Returns:
        Dictionary of values to log
    """
    json_values = {}

    # Add user info if available
    if current_user:
        user_id = getattr(current_user, "id", None)
        if user_id:
            json_values["userId"] = user_id
            json_values["actorUserId"] = user_id

    # Try to extract data from response body
    if extract_fields:
        try:
            # Get response body
            body = response.body
            if isinstance(body, bytes):
                body = body.decode("utf-8")

            response_data = json.loads(body)

            # Try to get data from standard response format
            data = response_data.get("data") or response_data

            # Extract specified fields
            if isinstance(data, dict):
                for field in extract_fields:
                    if field in data:
                        json_values[field] = data[field]

        except Exception as e:
            logger.debug(f"Could not extract fields from response: {e}")

    return json_values


# Convenience decorators for common operations
def log_create(log_code: str, entity_id_field: str = "_id", entity_name_field: str = "name"):
    """Log a CREATE operation, extracting ID and name from response."""
    return log_operation(log_code, [entity_id_field, entity_name_field])


def log_update(log_code: str, entity_id_field: str = "_id"):
    """Log an UPDATE operation, extracting ID from response."""
    return log_operation(log_code, [entity_id_field])


def log_delete(log_code: str):
    """Log a DELETE operation."""
    return log_operation(log_code, [])
