# =============================================================================
# Prompt Execution Dashboard Schemas
# Response schemas for GET /api/v1/prompt-executions/dashboard endpoint
# =============================================================================
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class TimeRangeEnum(str, Enum):
    """Supported time ranges for dashboard"""
    HOUR_1 = "1h"
    HOUR_24 = "24h"
    DAY_7 = "7d"
    DAY_30 = "30d"
    CUSTOM = "custom"


# ---------- Summary ----------
class DashboardSummary(BaseModel):
    """Overall execution summary"""
    totalCalls: int = Field(..., description="Total AI calls in time range")
    totalTokens: int = Field(..., description="Total tokens (input + output)")
    totalInputTokens: int = Field(..., description="Total input tokens")
    totalOutputTokens: int = Field(..., description="Total output tokens")
    totalCost: float = Field(..., description="Total cost in time range")
    avgAccuracy: Optional[float] = Field(None, description="Average accuracy score (0-100)")
    avgResponseTime: float = Field(..., description="Average response time in seconds")
    totalUsers: int = Field(..., description="Unique users who made calls")


# ---------- By Model ----------
class ModelStats(BaseModel):
    """Statistics for a single LLM model"""
    model: str = Field(..., description="LLM model name")
    calls: int = Field(..., description="Total calls using this model")
    tokens: int = Field(..., description="Total tokens (input + output)")
    inputTokens: int = Field(..., description="Total input tokens")
    outputTokens: int = Field(..., description="Total output tokens")
    cost: float = Field(..., description="Total cost for this model")
    avgAccuracy: Optional[float] = Field(None, description="Average accuracy for this model")
    avgResponseTime: float = Field(..., description="Average response time in seconds")


# ---------- By Use Case ----------
class UseCaseStats(BaseModel):
    """Statistics for a single use case/prompt type"""
    useCase: str = Field(..., description="Use case / prompt type name")
    calls: int = Field(..., description="Total calls for this use case")
    tokens: int = Field(..., description="Total tokens used")
    cost: float = Field(..., description="Total cost for this use case")
    avgResponseTime: float = Field(..., description="Average response time")


# ---------- Trends ----------
class TrendDataPoint(BaseModel):
    """Single data point in trend chart"""
    timestamp: datetime = Field(..., description="Time bucket start")
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    calls: int = Field(default=0, description="Total calls in this period")
    tokens: int = Field(default=0, description="Total tokens in this period")
    inputTokens: int = Field(default=0, description="Input tokens in this period")
    outputTokens: int = Field(default=0, description="Output tokens in this period")
    cost: float = Field(default=0.0, description="Total cost in this period")


# ---------- Recent Calls ----------
class RecentCallItem(BaseModel):
    """Single recent AI call item"""
    id: str = Field(..., description="Execution ID")
    timestamp: datetime = Field(..., description="Execution timestamp")
    model: Optional[str] = Field(None, description="LLM model used")
    useCase: Optional[str] = Field(None, description="Use case / prompt type")
    promptName: Optional[str] = Field(None, description="Prompt name")
    tokens: int = Field(..., description="Total tokens (input + output)")
    inputTokens: int = Field(..., description="Input tokens")
    outputTokens: int = Field(..., description="Output tokens")
    cost: Optional[float] = Field(None, description="Execution cost")
    responseTime: Optional[float] = Field(None, description="Response time in seconds")
    accuracy: Optional[float] = Field(None, description="Accuracy score (0-100)")
    status: str = Field(default="SUCCESS", description="Execution status")
    userId: Optional[str] = Field(None, description="User ID who made the call")
    userName: Optional[str] = Field(None, description="User name who made the call")
    moduleId: Optional[str] = Field(None, description="Module ID associated with the prompt")
    moduleName: Optional[str] = Field(None, description="Module name associated with the prompt")


# ---------- Model Performance ----------
class ModelPerformance(BaseModel):
    """Performance comparison for a model"""
    model: str = Field(..., description="LLM model name")
    avgResponseTime: float = Field(..., description="Average response time")
    avgTokensPerCall: float = Field(..., description="Average tokens per call")
    costPerToken: float = Field(..., description="Cost per token")
    totalCalls: int = Field(..., description="Total calls")


# ---------- Cost Analysis ----------
class CostByModel(BaseModel):
    """Cost breakdown by model"""
    model: str = Field(..., description="LLM model name")
    cost: float = Field(..., description="Total cost")
    percentage: float = Field(..., description="Percentage of total cost")


# ---------- Pagination Info ----------
class PaginationInfo(BaseModel):
    """Pagination information for list"""
    page: int = Field(..., description="Current page number")
    pageSize: int = Field(..., description="Number of items per page")
    totalCount: int = Field(..., description="Total number of items matching filters")
    totalPages: int = Field(..., description="Total number of pages")


# ---------- Main Response ----------
class PromptExecutionDashboardData(BaseModel):
    """Complete dashboard data including stats, trends, and list"""
    summary: DashboardSummary
    byModel: List[ModelStats] = Field(default_factory=list)
    byUseCase: List[UseCaseStats] = Field(default_factory=list)
    trends: List[TrendDataPoint] = Field(default_factory=list)
    modelPerformance: List[ModelPerformance] = Field(default_factory=list)
    costByModel: List[CostByModel] = Field(default_factory=list)
    # List section (paginated recent calls)
    list: List[RecentCallItem] = Field(default_factory=list, description="Paginated list of recent AI calls")
    pagination: PaginationInfo = Field(..., description="Pagination information for the list")


# ---------- Recent Calls Response ----------
class RecentCallsData(BaseModel):
    """Recent calls data response"""
    recentCalls: List[RecentCallItem] = Field(default_factory=list)
    totalCount: int = Field(..., description="Total number of calls matching filters")
    page: int = Field(..., description="Current page number")
    pageSize: int = Field(..., description="Number of items per page")
    totalPages: int = Field(..., description="Total number of pages")


# =============================================================================
# API Response Wrapper Schema (for OpenAPI documentation)
# =============================================================================

class ErrorDetail(BaseModel):
    """Error detail for API responses"""
    errorCode: str = Field(..., description="Error code identifier")
    details: Optional[str] = Field(None, description="Error details")


class PromptExecutionDashboardResponse(BaseModel):
    """Response schema for GET /api/v1/prompt-executions/dashboard"""
    success: bool = Field(True, description="Whether the request was successful")
    code: int = Field(200, description="HTTP status code")
    message: str = Field("Dashboard data retrieved successfully", description="Response message")
    data: PromptExecutionDashboardData = Field(..., description="Dashboard data")
    errors: Optional[ErrorDetail] = Field(None, description="Error details if any")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "code": 200,
                "message": "Dashboard data retrieved successfully",
                "data": {
                    "summary": {
                        "totalCalls": 5420,
                        "totalTokens": 2500000,
                        "totalInputTokens": 1000000,
                        "totalOutputTokens": 1500000,
                        "totalCost": 125.50,
                        "avgAccuracy": None,
                        "avgResponseTime": 2.3,
                        "totalUsers": 45
                    },
                    "byModel": [
                        {
                            "model": "gpt-4",
                            "calls": 2000,
                            "tokens": 1200000,
                            "inputTokens": 500000,
                            "outputTokens": 700000,
                            "cost": 85.00,
                            "avgAccuracy": None,
                            "avgResponseTime": 2.8
                        },
                        {
                            "model": "claude-3",
                            "calls": 1500,
                            "tokens": 800000,
                            "inputTokens": 300000,
                            "outputTokens": 500000,
                            "cost": 30.00,
                            "avgAccuracy": None,
                            "avgResponseTime": 1.9
                        }
                    ],
                    "byUseCase": [
                        {
                            "useCase": "text-generation",
                            "calls": 3000,
                            "tokens": 1500000,
                            "cost": 75.00,
                            "avgResponseTime": 2.5
                        }
                    ],
                    "trends": [
                        {
                            "timestamp": "2025-12-16T10:00:00Z",
                            "hour": 10,
                            "calls": 150,
                            "tokens": 75000,
                            "inputTokens": 30000,
                            "outputTokens": 45000,
                            "cost": 3.75
                        }
                    ],
                    "modelPerformance": [
                        {
                            "model": "gpt-4",
                            "avgResponseTime": 2.8,
                            "avgTokensPerCall": 600,
                            "costPerToken": 0.00007,
                            "totalCalls": 2000
                        }
                    ],
                    "costByModel": [
                        {"model": "gpt-4", "cost": 85.00, "percentage": 67.73},
                        {"model": "claude-3", "cost": 30.00, "percentage": 23.90},
                        {"model": "gemini-pro", "cost": 10.50, "percentage": 8.37}
                    ]
                },
                "errors": None
            }
        }


class RecentCallsResponse(BaseModel):
    """Response schema for GET /api/v1/prompt-executions/recent-calls"""
    success: bool = Field(True, description="Whether the request was successful")
    code: int = Field(200, description="HTTP status code")
    message: str = Field("Recent calls retrieved successfully", description="Response message")
    data: RecentCallsData = Field(..., description="Recent calls data")
    errors: Optional[ErrorDetail] = Field(None, description="Error details if any")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "code": 200,
                "message": "Recent calls retrieved successfully",
                "data": {
                    "recentCalls": [
                        {
                            "id": "507f1f77bcf86cd799439011",
                            "timestamp": "2025-12-16T10:30:00Z",
                            "model": "gpt-4",
                            "useCase": "text-generation",
                            "promptName": "Summary Generator",
                            "tokens": 650,
                            "inputTokens": 150,
                            "outputTokens": 500,
                            "cost": 0.0325,
                            "responseTime": 2.5,
                            "accuracy": None,
                            "status": "SUCCESS",
                            "userId": "507f1f77bcf86cd799439012",
                            "": "john.doe"
                        }
                    ],
                    "totalCount": 1500,
                    "page": 1,
                    "pageSize": 5,
                    "totalPages": 300
                },
                "errors": None
            }
        }
