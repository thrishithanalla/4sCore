"""
Standard Response Utility
Provides standardized API response format for all endpoints
"""
from typing import Any, Optional, List, Union
from pydantic import BaseModel, Field
from fastapi import status
from fastapi.responses import JSONResponse


class ErrorDetail(BaseModel):
    """Error detail model"""
    errorCode: str = Field(..., description="Error code identifier")
    details: Optional[Union[str, List[str]]] = Field(None, description="Error details")


class PaginationInfo(BaseModel):
    """Pagination information model"""
    page: int = Field(..., description="Current page number")
    pageSize: int = Field(..., description="Number of items per page")
    totalItems: int = Field(..., description="Total number of items")
    totalPages: int = Field(..., description="Total number of pages")


class StandardResponse(BaseModel):
    """Standard API response model"""
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code")
    message: str = Field(..., description="Response message")
    data: Optional[Any] = Field(None, description="Response data")
    pagination: Optional[PaginationInfo] = Field(None, description="Pagination info")
    errors: Optional[ErrorDetail] = Field(None, description="Error details")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "code": 200,
                "message": "Request successful",
                "data": {"id": "123", "name": "Example"},
                "pagination": None,
                "errors": None
            }
        }


class ResponseBuilder:
    """Builder class for creating standard responses"""

    @staticmethod
    def success(
        data: Any = None,
        message: str = "Request successful",
        code: int = status.HTTP_200_OK,
        pagination: Optional[dict] = None
    ) -> dict:
        """
        Create a success response

        Args:
            data: Response data (can be dict, list, or None)
            message: Success message
            code: HTTP status code
            pagination: Pagination info dict with page, pageSize, total, totalPages

        Returns:
            Standard success response dict
        """
        response = {
            "success": True,
            "code": code,
            "message": message,
            "data": data,
            "errors": None
        }

        if pagination:
            response["pagination"] = pagination

        return response

    @staticmethod
    def created(
        data: Any = None,
        message: str = "Created successfully"
    ) -> dict:
        """Create a 201 Created response"""
        return ResponseBuilder.success(
            data=data,
            message=message,
            code=status.HTTP_201_CREATED
        )

    @staticmethod
    def error(
        message: str,
        error_code: str,
        code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Union[str, List[str]]] = None
    ) -> dict:
        """
        Create an error response

        Args:
            message: Error message
            error_code: Error code identifier (e.g., "ERR.VALIDATION")
            code: HTTP status code
            details: Additional error details (string or list of strings)

        Returns:
            Standard error response dict
        """
        error_obj = {"errorCode": error_code}
        if details is not None:
            error_obj["details"] = details

        return {
            "success": False,
            "code": code,
            "message": message,
            "data": None,
            "errors": error_obj
        }

    @staticmethod
    def not_found(
        message: str = "Resource not found",
        error_code: str = "ERR.NOT_FOUND",
        details: Optional[str] = None
    ) -> dict:
        """Create a 404 Not Found response"""
        return ResponseBuilder.error(
            message=message,
            error_code=error_code,
            code=status.HTTP_404_NOT_FOUND,
            details=details
        )

    @staticmethod
    def unauthorized(
        message: str = "Unauthorized",
        error_code: str = "ERR.UNAUTHORIZED",
        details: Optional[str] = None
    ) -> dict:
        """Create a 401 Unauthorized response"""
        return ResponseBuilder.error(
            message=message,
            error_code=error_code,
            code=status.HTTP_401_UNAUTHORIZED,
            details=details
        )

    @staticmethod
    def forbidden(
        message: str = "Permission denied",
        error_code: str = "ERR.PERMISSION.DENIED",
        details: Optional[str] = None
    ) -> dict:
        """Create a 403 Forbidden response"""
        return ResponseBuilder.error(
            message=message,
            error_code=error_code,
            code=status.HTTP_403_FORBIDDEN,
            details=details
        )

    @staticmethod
    def bad_request(
        message: str = "Bad request",
        error_code: str = "ERR.BAD_REQUEST",
        details: Optional[Union[str, List[str]]] = None
    ) -> dict:
        """Create a 400 Bad Request response"""
        return ResponseBuilder.error(
            message=message,
            error_code=error_code,
            code=status.HTTP_400_BAD_REQUEST,
            details=details
        )

    @staticmethod
    def conflict(
        message: str = "Resource already exists",
        error_code: str = "ERR.CONFLICT",
        details: Optional[Union[str, List[str]]] = None
    ) -> dict:
        """Create a 409 Conflict response"""
        return ResponseBuilder.error(
            message=message,
            error_code=error_code,
            code=status.HTTP_409_CONFLICT,
            details=details
        )

    @staticmethod
    def server_error(
        message: str = "Internal server error",
        error_code: str = "ERR.INTERNAL",
        details: Optional[str] = None
    ) -> dict:
        """Create a 500 Internal Server Error response"""
        return ResponseBuilder.error(
            message=message,
            error_code=error_code,
            code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            details=details
        )

    @staticmethod
    def bulk_response(
        total_processed: int,
        success_count: int,
        failed_count: int,
        successful: List[dict],
        failed: List[dict],
        message: Optional[str] = None
    ) -> dict:
        """
        Create a bulk operation response

        Success is determined by ratio:
        - All success: success=True
        - All failed: success=False
        - Partial: success=True (partial success)

        Args:
            total_processed: Total number of items processed
            success_count: Number of successful operations
            failed_count: Number of failed operations
            successful: List of successful items
            failed: List of failed items
            message: Optional custom message

        Returns:
            Standard bulk response dict
        """
        if failed_count == 0:
            is_success = True
            default_message = "Bulk operation completed successfully"
            code = status.HTTP_201_CREATED
        elif success_count == 0:
            is_success = False
            default_message = "Bulk operation failed"
            code = status.HTTP_400_BAD_REQUEST
        else:
            is_success = True
            default_message = f"Bulk operation partially completed ({success_count}/{total_processed} succeeded)"
            code = status.HTTP_201_CREATED

        response = {
            "success": is_success,
            "code": code,
            "message": message or default_message,
            "data": {
                "totalProcessed": total_processed,
                "successCount": success_count,
                "failedCount": failed_count,
                "successful": successful,
                "failed": failed
            },
            "errors": None
        }

        return response

    @staticmethod
    def paginated(
        data: List[Any],
        total: int,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        message: str = "Data fetched successfully"
    ) -> dict:
        """
        Create a paginated response

        Args:
            data: List of items
            total: Total count of items
            page: Current page number (optional)
            page_size: Items per page (optional)
            message: Success message

        Returns:
            Standard paginated response dict
        """
        response = {
            "success": True,
            "code": status.HTTP_200_OK,
            "message": message,
            "data": data,
            "errors": None
        }

        if page is not None and page_size is not None:
            total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
            response["pagination"] = {
                "page": page,
                "pageSize": page_size,
                "totalItems": total,
                "totalPages": total_pages
            }

        return response


# Convenience function aliases
def api_success(data: Any = None, message: str = "Request successful", code: int = 200, pagination: dict = None) -> dict:
    """Alias for ResponseBuilder.success"""
    return ResponseBuilder.success(data=data, message=message, code=code, pagination=pagination)


def api_error(message: str, error_code: str, code: int = 400, details: Union[str, List[str]] = None) -> dict:
    """Alias for ResponseBuilder.error"""
    return ResponseBuilder.error(message=message, error_code=error_code, code=code, details=details)


def api_created(data: Any = None, message: str = "Created successfully") -> dict:
    """Alias for ResponseBuilder.created"""
    return ResponseBuilder.created(data=data, message=message)


def api_paginated(data: List[Any], total: int, page: int = None, page_size: int = None, message: str = "Data fetched successfully") -> dict:
    """Alias for ResponseBuilder.paginated"""
    return ResponseBuilder.paginated(data=data, total=total, page=page, page_size=page_size, message=message)


def api_bulk(total: int, success_count: int, failed_count: int, successful: List[dict], failed: List[dict], message: str = None) -> dict:
    """Alias for ResponseBuilder.bulk_response"""
    return ResponseBuilder.bulk_response(
        total_processed=total,
        success_count=success_count,
        failed_count=failed_count,
        successful=successful,
        failed=failed,
        message=message
    )
