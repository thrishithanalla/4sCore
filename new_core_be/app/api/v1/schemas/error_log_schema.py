from __future__ import annotations

import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

UUID_V4_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)
ISO_LANG2_RE = re.compile(r"^[a-z]{2}$")


class ParamKV(BaseModel):
    name: str = Field(min_length=1)
    value: str = Field(min_length=1)


class ErrorLogCreateSchema(BaseModel):
    """
    Inputs for POST /error-logs (service-to-service and UI/client).
    All enum-ish fields are plain strings; normalized in the service.
    """
    errorCode: str
    parametersJson: dict = Field(default_factory=dict)
    language: Optional[str] = Field(default="en", description="ISO-639-1 (e.g., en, hi)")
    actorUserId: Optional[str] = None  # ObjectId hex, parsed in service
    sourceType: str                     # normalize_code(db, "sourceType", ...)
    sourceName: str = Field(max_length=200)
    userAgent: Optional[str] = Field(default=None, max_length=512)
    environment: Optional[str] = Field(default=None, description="normalize_code(db, 'environment', ...)")
    parameters: Optional[List[ParamKV]] = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("language")
    @classmethod
    def _v_language(cls, v: Optional[str]) -> str:
        v = (v or "en").lower()
        if not ISO_LANG2_RE.match(v):
            raise ValueError("language must be ISO-639-1 (e.g., en, hi)")
        return v


class ErrorLogResponseSchema(BaseModel):
    id: str
    errorCode: str
    errorSeverity: str           # SNAPSHOT from errorMaster (UPPERCASE)
    eventDateTime: datetime
    actorUserId: Optional[str] = None
    sourceType: str
    sourceName: str
    userAgent: Optional[str] = None
    environment: Optional[str] = None
    resolvedMessage: Optional[str] = None
    parameters: Optional[List[ParamKV]] = None


class ErrorLogSearchParams(BaseModel):
    q: Optional[str] = None                 # full-text search on resolvedMessage
    errorCode: Optional[str] = None
    errorSeverity: Optional[str] = None
    sourceType: Optional[str] = None
    sourceName: Optional[str] = None
    actorUserId: Optional[str] = None       # string or ObjectId (service handles)
    environment: Optional[str] = None
    fromDate: Optional[datetime] = None
    toDate: Optional[datetime] = None
    page: int = 1
    page_size: int = 50


class PaginatedErrorLogs(BaseModel):
    data: List[ErrorLogResponseSchema]
    totalItems: int
    page: int
    page_size: int


# =============================================================================
# API Response Wrapper Schemas (for OpenAPI documentation)
# =============================================================================

class ErrorDetail(BaseModel):
    """Error detail for API responses"""
    errorCode: str = Field(..., description="Error code identifier")
    details: Optional[str] = Field(None, description="Error details")


class PaginationInfo(BaseModel):
    """Pagination metadata"""
    page: int = Field(..., description="Current page number")
    pageSize: int = Field(..., description="Number of items per page")
    totalItems: int = Field(..., description="Total number of items")
    totalPages: int = Field(..., description="Total number of pages")


class ErrorLogListResponse(BaseModel):
    """Response schema for GET /api/v1/error-logs/list (non-paginated)"""
    success: bool = Field(True, description="Whether the request was successful")
    code: int = Field(200, description="HTTP status code")
    message: str = Field(..., description="Response message")
    data: List[ErrorLogResponseSchema] = Field(..., description="List of error logs")
    errors: Optional[ErrorDetail] = Field(None, description="Error details if any")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Error Log list fetched successfully",
                "data": [
                    {
                        "id": "507f1f77bcf86cd799439011",
                        "errorCode": "ERR.DB.CONNECTION",
                        "errorSeverity": "HIGH",
                        "eventDateTime": "2025-12-16T10:30:00Z",
                        "actorUserId": "507f1f77bcf86cd799439012",
                        "sourceType": "API",
                        "sourceName": "/api/v1/users/list",

                        "userAgent": "Mozilla/5.0",
                        "environment": "PRODUCTION",
                        "resolvedMessage": "Database connection failed: timeout after 30s",
                        "parameters": [{"name": "timeout", "value": "30s"}]
                    }
                ],
                "errors": None
            }
        }
    )


class ErrorLogListPaginatedResponse(BaseModel):
    """Response schema for GET /api/v1/error-logs/list (paginated)"""
    success: bool = Field(True, description="Whether the request was successful")
    code: int = Field(200, description="HTTP status code")
    message: str = Field(..., description="Response message")
    data: List[ErrorLogResponseSchema] = Field(..., description="List of error logs")
    pagination: PaginationInfo = Field(..., description="Pagination information")
    errors: Optional[ErrorDetail] = Field(None, description="Error details if any")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Error Log list fetched successfully",
                "data": [
                    {
                        "id": "507f1f77bcf86cd799439011",
                        "errorCode": "ERR.DB.CONNECTION",
                        "errorSeverity": "HIGH",
                        "eventDateTime": "2025-12-16T10:30:00Z",
                        "actorUserId": "507f1f77bcf86cd799439012",
                        "sourceType": "API",
                        "sourceName": "/api/v1/users/list",

                        "userAgent": "Mozilla/5.0",
                        "environment": "PRODUCTION",
                        "resolvedMessage": "Database connection failed",
                        "parameters": []
                    }
                ],
                "pagination": {
                    "page": 1,
                    "pageSize": 50,
                    "total": 150,
                    "totalPages": 3
                },
                "errors": None
            }
        }
    )
