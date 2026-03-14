"""
Error Handler Decorator
Provides consistent error handling and logging for all endpoints.

This replaces the repetitive try-except blocks in every endpoint.

Usage:
    from app.api.v1.decorators import handle_errors

    @router.post("/create")
    @handle_errors(ErrorCodes.UNIT_CREATE_FAILED, "Unit")
    async def create_unit(request: Request, current_user: TokenDataSchema, ...):
        # Just business logic - errors are handled automatically
        pass
"""

from functools import wraps
from typing import Optional, Callable, Any
import logging

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.utils.standard_response import ResponseBuilder
from app.constants.api_constants import ErrorMessages


logger = logging.getLogger(__name__)


def handle_errors(
    error_code: str,
    entity_name: str = "Record",
    log_validation_errors: bool = True
):
    """
    Decorator to handle all exceptions consistently.

    This decorator wraps an endpoint function and provides:
    - Consistent error logging to error_logs collection
    - Proper error response formatting
    - Different handling for HTTPException, ValueError, and generic Exception

    Args:
        error_code: The error code for logging (e.g., ErrorCodes.UNIT_CREATE_FAILED)
        entity_name: Human-readable entity name for error messages
        log_validation_errors: Whether to log ValueError as errors (default: True)

    Usage:
        @router.post("/create")
        @handle_errors(ErrorCodes.UNIT_CREATE_FAILED, "Unit")
        async def create_unit(request: Request, current_user: TokenDataSchema, unit: UnitCreateSchema):
            # Your business logic here
            # Any exception will be caught and handled properly
            created = await unit_service.create_unit(unit, current_user.id)
            return JSONResponse(status_code=201, content=api_success(data=created))

    Error Handling:
        - HTTPException: Re-raises (let FastAPI's exception handler deal with it)
        - ValueError: Returns 400 Bad Request with error message
        - Exception: Returns 500 Internal Server Error, logs stack trace
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

            # Get user ID for logging
            user_id = None
            if current_user:
                user_id = getattr(current_user, "id", None)

            try:
                # Execute the endpoint function
                return await func(*args, **kwargs)

            except HTTPException:
                # Re-raise HTTP exceptions - they'll be handled by FastAPI's
                # exception handler in main.py which already logs them
                raise

            except ValueError as e:
                # Validation/business logic errors - 400 Bad Request
                if log_validation_errors and request:
                    error_log = await log_error(
                        request=request,
                        error_code=error_code,
                        parameters={
                            "errorMessage": str(e),
                            "entity": entity_name
                        },
                        actor_user_id=user_id
                    )
                    error_message = (error_log or {}).get("resolvedMessage") or str(e)
                else:
                    error_message = str(e)

                logger.warning(f"Validation error in {func.__name__}: {e}")

                return JSONResponse(
                    status_code=400,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=error_code
                    )
                )

            except Exception as e:
                # Unexpected errors - 500 Internal Server Error
                logger.exception(f"Unexpected error in {func.__name__}: {e}")

                if request:
                    error_log = await log_error_with_exception(
                        request=request,
                        error_code=error_code,
                        parameters={
                            "entity": entity_name,
                            "function": func.__name__
                        },
                        exception=e,
                        actor_user_id=user_id
                    )
                    error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
                else:
                    error_message = ErrorMessages.UNEXPECTED_ERROR

                return JSONResponse(
                    status_code=500,
                    content=ResponseBuilder.server_error(
                        message=error_message,
                        error_code=error_code
                    )
                )

        return wrapper
    return decorator


def handle_not_found(
    error_code: str,
    entity_name: str = "Record"
):
    """
    Specialized decorator for endpoints that may return 404 Not Found.

    Similar to handle_errors but also handles None returns as 404.

    Usage:
        @router.get("/get/{id}")
        @handle_not_found(ErrorCodes.UNIT_GET_NOT_FOUND, "Unit")
        async def get_unit(id: str, request: Request, ...):
            unit = await unit_service.get_unit(id)
            if not unit:
                return None  # Will be converted to 404
            return JSONResponse(content=api_success(data=unit))
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            request: Optional[Request] = kwargs.get("request")
            current_user = kwargs.get("current_user")

            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            user_id = None
            if current_user:
                user_id = getattr(current_user, "id", None)

            try:
                result = await func(*args, **kwargs)

                # Handle None as 404
                if result is None:
                    if request:
                        error_log = await log_error(
                            request=request,
                            error_code=error_code,
                            parameters={
                                "errorMessage": f"{entity_name} not found",
                                "entity": entity_name
                            },
                            actor_user_id=user_id
                        )
                        error_message = (error_log or {}).get("resolvedMessage") or f"{entity_name} not found"
                    else:
                        error_message = f"{entity_name} not found"

                    return JSONResponse(
                        status_code=404,
                        content=ResponseBuilder.not_found(
                            message=error_message,
                            error_code=error_code
                        )
                    )

                return result

            except HTTPException:
                raise

            except ValueError as e:
                if request:
                    error_log = await log_error(
                        request=request,
                        error_code=error_code,
                        parameters={"errorMessage": str(e), "entity": entity_name},
                        actor_user_id=user_id
                    )
                    error_message = (error_log or {}).get("resolvedMessage") or str(e)
                else:
                    error_message = str(e)

                return JSONResponse(
                    status_code=400,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=error_code
                    )
                )

            except Exception as e:
                logger.exception(f"Unexpected error in {func.__name__}: {e}")

                if request:
                    error_log = await log_error_with_exception(
                        request=request,
                        error_code=error_code,
                        parameters={"entity": entity_name},
                        exception=e,
                        actor_user_id=user_id
                    )
                    error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
                else:
                    error_message = ErrorMessages.UNEXPECTED_ERROR

                return JSONResponse(
                    status_code=500,
                    content=ResponseBuilder.server_error(
                        message=error_message,
                        error_code=error_code
                    )
                )

        return wrapper
    return decorator
