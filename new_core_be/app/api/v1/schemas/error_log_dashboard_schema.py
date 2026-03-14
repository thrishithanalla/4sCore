# =============================================================================
# Error Log Dashboard Schemas
# Response schemas for GET /api/v1/error-logs/dashboard endpoint
# =============================================================================
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class TimeRangeEnum(str, Enum):
    """Supported time ranges for dashboard"""
    ALL = "all"
    HOUR_1 = "1h"
    HOUR_24 = "24h"
    DAY_7 = "7d"
    DAY_30 = "30d"


# ---------- Request Schema ----------
class DashboardRequestSchema(BaseModel):
    """Request body schema for POST /api/v1/error-logs/dashboard"""
    timeRange: TimeRangeEnum = Field(
        default=TimeRangeEnum.ALL,
        description="Time range for dashboard data: all (default), 1h, 24h, 7d, 30d"
    )
    fromDate: Optional[datetime] = Field(
        None,
        description="Start date for filtering (optional)"
    )
    toDate: Optional[datetime] = Field(
        None,
        description="End date for filtering (optional)"
    )
    sourceType: Optional[str] = Field(
        None,
        description="Filter by source type (validated against 'sourceType' valueSet)"
    )
    errorSeverity: Optional[str] = Field(
        None,
        description="Filter by severity (validated against 'errorSeverity' valueSet)"
    )
    errorCode: Optional[str] = Field(
        None,
        description="Filter by specific error code (e.g., ERR.CORE.DEPARTMENT.CREATE.DUPLICATE_NAME)"
    )
    moduleId: Optional[str] = Field(
        None,
        description="Filter by module ID (from error_master.moduleId). Shows only error logs whose error codes belong to this module."
    )
    includeArchive: bool = Field(
        default=False,
        description="Include archived error logs"
    )
    page: int = Field(
        default=1,
        ge=1,
        description="Page number for error groups pagination"
    )
    limit: int = Field(
        default=5,
        ge=1,
        le=200,
        description="Number of error groups per page"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "timeRange": "all",
                "sourceType": None,
                "errorSeverity": None,
                "errorCode": None,
                "moduleId": None,
                "includeArchive": False,
                "page": 1,
                "limit": 5
            }
        }


# ---------- Summary ----------
class DashboardSummary(BaseModel):
    """Overall error summary"""
    totalErrors: int = Field(..., description="Total error count in time range")
    totalUniqueErrors: int = Field(..., description="Count of unique error codes")
    totalAffectedUsers: int = Field(..., description="Count of unique affected users")


# ---------- By Type ----------
class TypeStats(BaseModel):
    """Statistics for a single source type"""
    count: int = Field(..., description="Total errors of this type")
    unique: int = Field(..., description="Unique error codes of this type")
    affectedUsers: int = Field(..., description="Unique users affected by this type")


# ByTypeStats is now a Dict[str, TypeStats] - keys are dynamic from valueSet (sourceType)
# Example: {"API": {...}, "SCREEN": {...}, "THIRDPARTY": {...}, "FUNCTION": {...}}


# ---------- By Severity ----------
class SeverityStats(BaseModel):
    """Statistics for a single severity level"""
    count: int = Field(..., description="Total errors of this severity")
    affectedUsers: int = Field(..., description="Unique users affected")


# BySeverityStats is now a Dict[str, SeverityStats] - keys are dynamic from valueSet (errorSeverity)
# Example: {"CRITICAL": {...}, "HIGH": {...}, "MEDIUM": {...}, "LOW": {...}}


# ---------- Trends ----------
class TrendDataPoint(BaseModel):
    """Single data point in trend chart - sourceType keys are dynamic from valueSet.

    Always returns hourly format (hours 0-23) for all time ranges.
    """
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    bySourceType: Dict[str, int] = Field(
        default_factory=dict,
        description="Error counts by source type (keys are dynamic from 'sourceType' valueSet)"
    )
    # Example: {"hour": 14, "bySourceType": {"API": 10, "SCREEN": 5}}


# ---------- Error Groups ----------
class ErrorGroupItem(BaseModel):
    """Single error group (grouped by errorCode)"""
    errorCode: str = Field(..., description="Error code identifier")
    sourceType: Optional[str] = Field(None, description="Primary source type")
    severity: Optional[str] = Field(None, description="Error severity")
    occurrences: int = Field(..., description="Total occurrences")
    affectedUsers: int = Field(..., description="Unique users affected")
    firstSeen: Optional[datetime] = Field(None, description="First occurrence timestamp")
    lastSeen: Optional[datetime] = Field(None, description="Last occurrence timestamp")
    sourceName: Optional[str] = Field(None, description="Primary source name/endpoint")
    resolvedMessage: Optional[str] = Field(None, description="Sample resolved message")


# ---------- Patterns ----------
class PatternItem(BaseModel):
    """Error pattern analysis item"""
    pattern: str = Field(..., description="Pattern name")
    frequency: int = Field(..., description="Errors per day")
    trend: str = Field(..., description="Trend direction: increasing, decreasing, stable")
    peakHours: str = Field(..., description="Peak hours (e.g., '14:00-16:00')")
    affectedModules: int = Field(..., description="Number of affected modules")


# ---------- Impact ----------
class ImpactLevel(BaseModel):
    """Impact statistics for a severity level"""
    errorGroups: int = Field(..., description="Number of unique error groups")
    totalErrors: int = Field(..., description="Total error count")
    affectedUsers: int = Field(..., description="Unique users affected")
    errorRate: float = Field(..., description="Errors of this severity as % of total")


class ImpactAnalysis(BaseModel):
    """Impact analysis summary - severity keys are dynamic from 'errorSeverity' valueSet"""
    bySeverity: Dict[str, ImpactLevel] = Field(
        default_factory=dict,
        description="Impact stats by severity level (keys are dynamic from 'errorSeverity' valueSet)"
    )
    # Example: {"CRITICAL": {...}, "HIGH": {...}, "MEDIUM": {...}, "LOW": {...}}
    totalAffectedUsers: int = Field(..., description="Total unique affected users across all severities")


# ---------- Pagination ----------
class PaginationInfo(BaseModel):
    """Pagination information for error groups"""
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    totalItems: int = Field(..., description="Total number of error groups")
    totalPages: int = Field(..., description="Total number of pages")
    hasNextPage: bool = Field(..., description="Whether there is a next page")
    hasPrevPage: bool = Field(..., description="Whether there is a previous page")


# ---------- Main Response ----------
class DashboardData(BaseModel):
    """Complete dashboard data"""
    sourceTypes: List[str] = Field(default_factory=list, description="Available source types from valueSet")
    severityLevels: List[str] = Field(default_factory=list, description="Available severity levels from valueSet")
    summary: DashboardSummary
    byType: Dict[str, TypeStats] = Field(default_factory=dict)
    bySeverity: Dict[str, SeverityStats] = Field(default_factory=dict)
    trends: List[TrendDataPoint] = Field(default_factory=list)
    errorGroups: List[ErrorGroupItem] = Field(default_factory=list)
    pagination: Optional[PaginationInfo] = Field(None, description="Pagination info for error groups")
    patterns: List[PatternItem] = Field(default_factory=list)
    impact: ImpactAnalysis


# =============================================================================
# API Response Wrapper Schema (for OpenAPI documentation)
# =============================================================================

class ErrorDetail(BaseModel):
    """Error detail for API responses"""
    errorCode: str = Field(..., description="Error code identifier")
    details: Optional[str] = Field(None, description="Error details")


class ErrorLogDashboardResponse(BaseModel):
    """Response schema for GET /api/v1/error-logs/dashboard"""
    success: bool = Field(True, description="Whether the request was successful")
    code: int = Field(200, description="HTTP status code")
    message: str = Field("Dashboard data retrieved successfully", description="Response message")
    data: DashboardData = Field(..., description="Dashboard data")
    errors: Optional[ErrorDetail] = Field(None, description="Error details if any")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "code": 200,
                "message": "Dashboard data retrieved successfully",
                "data": {
                    "sourceTypes": ["API", "FUNCTION", "SCREEN", "THIRDPARTY"],
                    "severityLevels": ["CRITICAL", "HIGH", "LOW", "MEDIUM"],
                    "summary": {
                        "totalErrors": 1250,
                        "totalUniqueErrors": 45,
                        "totalAffectedUsers": 128
                    },
                    "byType": {
                        "API": {"count": 800, "unique": 30, "affectedUsers": 85},
                        "SCREEN": {"count": 350, "unique": 12, "affectedUsers": 45},
                        "THIRDPARTY": {"count": 100, "unique": 3, "affectedUsers": 20},
                        "FUNCTION": {"count": 50, "unique": 5, "affectedUsers": 10}
                    },
                    "bySeverity": {
                        "CRITICAL": {"count": 50, "affectedUsers": 25},
                        "HIGH": {"count": 200, "affectedUsers": 60},
                        "MEDIUM": {"count": 500, "affectedUsers": 80},
                        "LOW": {"count": 500, "affectedUsers": 40}
                    },
                    "trends": [
                        {"hour": 0, "bySourceType": {"API": 10, "SCREEN": 5, "THIRDPARTY": 2, "FUNCTION": 1}},
                        {"hour": 1, "bySourceType": {"API": 8, "SCREEN": 3, "THIRDPARTY": 1, "FUNCTION": 0}},
                        {"hour": 2, "bySourceType": {"API": 5, "SCREEN": 2, "THIRDPARTY": 0, "FUNCTION": 0}},
                        {"hour": 3, "bySourceType": {"API": 3, "SCREEN": 1, "THIRDPARTY": 0, "FUNCTION": 0}}
                    ],
                    "errorGroups": [
                        {
                            "errorCode": "ERR.DB.CONNECTION",
                            "sourceType": "API",
                            "severity": "HIGH",
                            "occurrences": 150,
                            "affectedUsers": 45,
                            "firstSeen": "2025-12-15T08:00:00Z",
                            "lastSeen": "2025-12-16T10:30:00Z",
                            "sourceName": "/api/v1/users/list",
                            "resolvedMessage": "Database connection failed"
                        }
                    ],
                    "patterns": [
                        {
                            "pattern": "Database Connection Issues",
                            "frequency": 50,
                            "trend": "increasing",
                            "peakHours": "14:00-16:00",
                            "affectedModules": 5
                        }
                    ],
                    "impact": {
                        "bySeverity": {
                            "CRITICAL": {"errorGroups": 5, "totalErrors": 50, "affectedUsers": 25, "errorRate": 4.0},
                            "HIGH": {"errorGroups": 15, "totalErrors": 200, "affectedUsers": 60, "errorRate": 16.0},
                            "MEDIUM": {"errorGroups": 25, "totalErrors": 500, "affectedUsers": 80, "errorRate": 40.0},
                            "LOW": {"errorGroups": 20, "totalErrors": 500, "affectedUsers": 40, "errorRate": 40.0}
                        },
                        "totalAffectedUsers": 205
                    }
                },
                "errors": None
            }
        }
