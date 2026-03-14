"""
Response Helpers
Standardized response formatting for API endpoints

All responses follow this format:
{
    "success": bool,
    "code": int,
    "message": str,
    "data": { ... } or null
}
"""
from typing import Any, Optional


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200
) -> dict:
    """
    Create a standardized success response

    Args:
        data: Response data
        message: Success message
        code: HTTP status code

    Returns:
        Standardized success response dict
    """
    return {
        "success": True,
        "code": status_code,
        "message": message,
        "data": data
    }


def error_response(
    message: str,
    status_code: int = 400,
    error_code: Optional[str] = None,
    data: Optional[Any] = None
) -> dict:
    """
    Create a standardized error response

    Args:
        message: Human-readable error message
        code: HTTP status code
        error_code: Error code identifier (e.g., "ERR.PERMISSION.DENIED") - optional
        data: Additional error details (optional)

    Returns:
        Standardized error response dict
    """
    response = {
        "success": False,
        "code": status_code,
        "message": message,
        "data": data
    }
    if error_code is not None:
        response["error_code"] = error_code
    return response
