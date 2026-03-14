"""
Response Helpers
Standardized response formatting for API endpoints
"""
from typing import Any, Optional


def success_response(
    data: Any = None,
    message: str = "Success",
    code: int = 200
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
        "code": code,
        "message": message,
        "data": data
    }


def error_response(
    error_code: str,
    message: str,
    code: int = 400,
    details: Optional[Any] = None
) -> dict:
    """
    Create a standardized error response

    Args:
        error_code: Error code identifier (e.g., "ERR.PERMISSION.DENIED")
        message: Human-readable error message
        code: HTTP status code
        details: Additional error details (optional)

    Returns:
        Standardized error response dict
    """
    response = {
        "success": False,
        "code": code,
        "errorCode": error_code,
        "message": message
    }
    if details is not None:
        response["details"] = details
    return response
