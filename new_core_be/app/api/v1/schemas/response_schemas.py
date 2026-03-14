"""
Common response schemas for API endpoints.
Provides standardized response wrappers for success, error, and paginated responses.
"""
from typing import Any, Generic, TypeVar, Optional, Dict, List
from pydantic import BaseModel, Field, ConfigDict

T = TypeVar('T')


class StandardResponse(BaseModel, Generic[T]):
    """Standard API response wrapper"""
    success: bool = Field(..., description="Indicates if the request was successful")
    code: int = Field(..., description="HTTP status code")
    message: str = Field(..., description="Human-readable message")
    data: Optional[T] = Field(None, description="Response data payload")
    error_code: Optional[str] = Field(None, description="Error code (only present in error responses)")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Operation successful",
                "data": {}
            }
        }
    )


class ErrorResponse(BaseModel):
    """Standard error response"""
    success: bool = Field(False, description="Always false for errors")
    code: int = Field(..., description="HTTP status code")
    message: str = Field(..., description="Error message")
    error_code: Optional[str] = Field(None, description="Specific error code")
    data: Optional[Any] = Field(None, description="Additional error data")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": False,
                "code": 404,
                "message": "Resource not found",
                "error_code": "ERR.RESOURCE.NOT_FOUND",
                "data": None
            }
        }
    )


class ErrorDetail(BaseModel):
    """Error detail for validation errors"""
    loc: list[str | int] = Field(..., description="Location of the error in the request")
    msg: str = Field(..., description="Error message")
    type: str = Field(..., description="Error type")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "loc": ["body", "retentionPeriod"],
                "msg": "ensure this value is greater than 0",
                "type": "value_error.number.not_gt"
            }
        }
    )


class ValidationErrorResponse(BaseModel):
    """Response for validation errors (422)"""
    success: bool = Field(False, description="Always false for errors")
    code: int = Field(422, description="HTTP status code")
    message: str = Field(..., description="Error message")
    data: dict[str, list[ErrorDetail]] = Field(..., description="Validation error details")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": False,
                "code": 422,
                "message": "Validation error",
                "data": {
                    "detail": [
                        {
                            "loc": ["body", "retentionPeriod"],
                            "msg": "ensure this value is greater than 0",
                            "type": "value_error.number.not_gt"
                        }
                    ]
                }
            }
        }
    )


class TokenPayloadResponse(BaseModel):
    """Token payload decoded response"""
    payload: Dict[str, Any] = Field(..., description="Decoded JWT payload")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "payload": {
                    "sub": "674a2c3d5e6f7a8b9c0d1e2f",
                    "id": "674a2c3d5e6f7a8b9c0d1e2f",
                    "unitId": "674a2c3d5e6f7a8b9c0d1e3c",
                    "roleId": "674a2c3d5e6f7a8b9c0d1e3a",
                    "exp": 1735123456
                }
            }
        }
    )


class PermissionsResponse(BaseModel):
    """Response for user permissions"""
    id: str = Field(..., description="User ID")
    unitId: str = Field(..., description="Unit ID")
    roleId: str = Field(..., description="Role ID")
    permissions: List[Any] = Field(..., description="Consolidated permissions array")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "674a2c3d5e6f7a8b9c0d1e2f",
                "unitId": "674a2c3d5e6f7a8b9c0d1e3c",
                "roleId": "674a2c3d5e6f7a8b9c0d1e3a",
                "permissions": []
            }
        }
    )


class PaginatedResponse(BaseModel):
    """Generic paginated response wrapper"""
    items: List[Any] = Field(..., description="List of items")
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Items per page")
    total_pages: int = Field(..., description="Total number of pages")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [],
                "total": 100,
                "page": 1,
                "page_size": 10,
                "total_pages": 10
            }
        }
    )


class AnalyticsResponse(BaseModel):
    """Response for audit log analytics grouped by layer"""
    total: int = Field(0, description="Total number of logs")

    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "APPLICATION": 150,
                "DATABASE": 30,
                "total": 180
            }
        }
    )


class CleanupResponse(BaseModel):
    """Response for cleanup operations"""
    deleted_count: int = Field(..., description="Number of records deleted")
    processed_templates: int = Field(..., description="Number of templates processed")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "deleted_count": 1234,
                "processed_templates": 15
            }
        }
    )


class TrendItem(BaseModel):
    """Single trend data point"""
    timestamp: str = Field(..., description="Timestamp in ISO format")
    count: int = Field(..., description="Log count for that time period")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "timestamp": "2025-01-16T10:00:00",
                "count": 1500
            }
        }
    )


class TrendData(BaseModel):
    """Trend data with multiple time ranges"""
    lastHour: List[TrendItem] = Field(..., description="Last hour trend grouped by minute")
    last24Hours: List[TrendItem] = Field(..., description="Last 24 hours trend grouped by hour")
    last7Days: List[TrendItem] = Field(..., description="Last 7 days trend grouped by day")
    last30Days: List[TrendItem] = Field(..., description="Last 30 days trend grouped by day")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "lastHour": [
                    {"timestamp": "2025-01-16T10:30:00", "count": 25},
                    {"timestamp": "2025-01-16T10:31:00", "count": 30}
                ],
                "last24Hours": [
                    {"timestamp": "2025-01-16T10:00:00", "count": 1500},
                    {"timestamp": "2025-01-16T11:00:00", "count": 1800}
                ],
                "last7Days": [
                    {"timestamp": "2025-01-10", "count": 15000},
                    {"timestamp": "2025-01-11", "count": 18000}
                ],
                "last30Days": [
                    {"timestamp": "2024-12-17", "count": 45000},
                    {"timestamp": "2024-12-18", "count": 48000}
                ]
            }
        }
    )


class TopLogModule(BaseModel):
    """Top logged entity type data"""
    entityType: Optional[str] = Field(None, description="Entity type")
    logCount: int = Field(..., description="Log count for this entity type")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "entityType": "User",
                "logCount": 4230
            }
        }
    )


class DashboardAnalytics(BaseModel):
    """Analytics counts for dashboard grouped by layer"""
    total: int = Field(0, description="Total number of logs")

    model_config = ConfigDict(
        extra="allow",
        json_schema_extra={
            "example": {
                "APPLICATION": 484889,
                "DATABASE": 121,
                "total": 485010
            }
        }
    )


class DashboardLogsData(BaseModel):
    """Paginated logs data for dashboard"""
    items: List[Any] = Field(..., description="List of log items")
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Items per page")
    total_pages: int = Field(..., description="Total number of pages")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [],
                "total": 485100,
                "page": 1,
                "page_size": 10,
                "total_pages": 48510
            }
        }
    )


class DashboardResponse(BaseModel):
    """Combined dashboard response with all data"""
    analytics: DashboardAnalytics = Field(..., description="Log level counts")
    trend: TrendData = Field(..., description="Log trend data for multiple time ranges")
    topLogModules: List[TopLogModule] = Field(..., description="Top log-prone modules")
    logs: DashboardLogsData = Field(..., description="Paginated logs list")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "analytics": {
                    "APPLICATION": 484889,
                    "DATABASE": 121,
                    "total": 485010
                },
                "trend": {
                    "lastHour": [
                        {"timestamp": "2025-01-16T10:30:00", "count": 25},
                        {"timestamp": "2025-01-16T10:31:00", "count": 30}
                    ],
                    "last24Hours": [
                        {"timestamp": "2025-01-16T10:00:00", "count": 1500},
                        {"timestamp": "2025-01-16T11:00:00", "count": 1800}
                    ],
                    "last7Days": [
                        {"timestamp": "2025-01-10", "count": 15000},
                        {"timestamp": "2025-01-11", "count": 18000}
                    ],
                    "last30Days": [
                        {"timestamp": "2024-12-17", "count": 45000},
                        {"timestamp": "2024-12-18", "count": 48000}
                    ]
                },
                "topLogModules": [
                    {"entityType": "User", "logCount": 4230}
                ],
                "logs": {
                    "items": [],
                    "total": 485100,
                    "page": 1,
                    "page_size": 10,
                    "total_pages": 48510
                }
            }
        }
    )
