"""
Dashboard Schema
Comprehensive dashboard schemas for analytics and reporting
Routes: /api/v1/dashboard
"""
from __future__ import annotations

from datetime import datetime, date
from enum import Enum
from typing import Dict, List, Optional, Any

from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================

class TimeRangeEnum(str, Enum):
    """Supported time ranges for dashboard"""
    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_7_DAYS = "7d"
    LAST_30_DAYS = "30d"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    CUSTOM = "custom"


class GranularityEnum(str, Enum):
    """Time granularity for trend data"""
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# =============================================================================
# 0. Counts Dashboard
# =============================================================================

class JobCountItem(BaseModel):
    """Count item with job metadata"""
    count: int = Field(default=0, description="Total count for this collection")
    isMenu: bool = Field(default=False, description="Whether this job appears in menu")
    route: Optional[str] = Field(default=None, description="Route for this job")
    displayName: Optional[str] = Field(default=None, description="Display name from user's permissions")


class PlatformCounts(BaseModel):
    """Counts for platform/system-level collections"""
    # Value Sets
    valueSets: JobCountItem = Field(default_factory=JobCountItem, description="Value sets count and metadata")

    # Logging
    logMaster: JobCountItem = Field(default_factory=JobCountItem, description="Log master count and metadata")
    logTransactions: JobCountItem = Field(default_factory=JobCountItem, description="Log transactions count and metadata")

    # Error
    errorMaster: JobCountItem = Field(default_factory=JobCountItem, description="Error master count and metadata")
    errorLogs: JobCountItem = Field(default_factory=JobCountItem, description="Error logs count and metadata")

    # Approval
    approvalFlowMaster: JobCountItem = Field(default_factory=JobCountItem, description="Approval flow master count and metadata")
    approvalChains: JobCountItem = Field(default_factory=JobCountItem, description="Approval chains count and metadata")

    # Test
    testMaster: JobCountItem = Field(default_factory=JobCountItem, description="Test master count and metadata")
    testExecutions: JobCountItem = Field(default_factory=JobCountItem, description="Test executions count and metadata")

    # Prompts
    prompts: JobCountItem = Field(default_factory=JobCountItem, description="Prompts count and metadata")
    promptExecutions: JobCountItem = Field(default_factory=JobCountItem, description="Prompt executions count and metadata")

    # Feedback
    feedbackMaster: JobCountItem = Field(default_factory=JobCountItem, description="Feedback master count and metadata")
    feedbacks: JobCountItem = Field(default_factory=JobCountItem, description="Feedbacks count and metadata")


class ApplicationCounts(BaseModel):
    """Counts for application/business collections"""
    # Core Master Data
    units: JobCountItem = Field(default_factory=JobCountItem, description="Units count and metadata")
    personnels: JobCountItem = Field(default_factory=JobCountItem, description="Personnels count and metadata")
    departments: JobCountItem = Field(default_factory=JobCountItem, description="Departments count and metadata")
    districts: JobCountItem = Field(default_factory=JobCountItem, description="Districts count and metadata")
    ranks: JobCountItem = Field(default_factory=JobCountItem, description="Ranks count and metadata")
    unitTypes: JobCountItem = Field(default_factory=JobCountItem, description="Unit types count and metadata")
    mandals: JobCountItem = Field(default_factory=JobCountItem, description="Mandals count and metadata")
    designations: JobCountItem = Field(default_factory=JobCountItem, description="Designations count and metadata")
    unitVillages: JobCountItem = Field(default_factory=JobCountItem, description="Unit villages count and metadata")

    # RBAC & Auth
    roles: JobCountItem = Field(default_factory=JobCountItem, description="Roles count and metadata")
    modules: JobCountItem = Field(default_factory=JobCountItem, description="Modules count and metadata")
    jobs: JobCountItem = Field(default_factory=JobCountItem, description="Jobs count and metadata")
    permissions: JobCountItem = Field(default_factory=JobCountItem, description="Permissions count and metadata")
    permissionMappings: JobCountItem = Field(default_factory=JobCountItem, description="Permission mappings count and metadata")
    userMappings: JobCountItem = Field(default_factory=JobCountItem, description="User mappings count and metadata")
    userRolePermissions: JobCountItem = Field(default_factory=JobCountItem, description="User role permissions count and metadata")
    moduleHierarchy: JobCountItem = Field(default_factory=JobCountItem, description="Module hierarchy count and metadata")
    moduleJobMappings: JobCountItem = Field(default_factory=JobCountItem, description="Module job mappings count and metadata")


class CountsData(BaseModel):
    """Counts for all collections grouped by platform and application"""
    platform: PlatformCounts = Field(default_factory=PlatformCounts, description="Platform/infrastructure counts")
    application: ApplicationCounts = Field(default_factory=ApplicationCounts, description="Application/business counts")


# =============================================================================
# 1. User Activity Dashboard
# =============================================================================

class UserActivitySummary(BaseModel):
    """Summary of user activity"""
    totalUsers: int = Field(..., description="Total registered users")
    activeUsers: int = Field(..., description="Users active in time range")
    newUsers: int = Field(..., description="New users in time range")
    inactiveUsers: int = Field(..., description="Users with no activity")


class TopUserItem(BaseModel):
    """Top user by prompt executions"""
    userId: str = Field(..., description="User ID")
    userName: Optional[str] = Field(None, description="User name")
    unitName: Optional[str] = Field(None, description="Unit name")
    totalCalls: int = Field(..., description="Total prompt executions")
    totalTokens: int = Field(..., description="Total tokens used")
    totalCost: float = Field(..., description="Total cost incurred")
    lastActive: Optional[datetime] = Field(None, description="Last activity timestamp")


class UserActivityTrend(BaseModel):
    """User activity trend data point"""
    timestamp: datetime = Field(..., description="Time bucket start")
    activeUsers: int = Field(default=0, description="Active users in period")
    newUsers: int = Field(default=0, description="New users in period")
    totalCalls: int = Field(default=0, description="Total calls in period")


class UserActivityDashboardData(BaseModel):
    """Complete user activity dashboard data"""
    summary: UserActivitySummary
    topUsers: List[TopUserItem] = Field(default_factory=list, description="Top users by usage")
    activityTrend: List[UserActivityTrend] = Field(default_factory=list, description="Activity over time")
    usersByUnit: List[Dict[str, Any]] = Field(default_factory=list, description="Users grouped by unit")


# =============================================================================
# 2. Prompt Analytics Dashboard
# =============================================================================

class PromptUsageSummary(BaseModel):
    """Summary of prompt usage"""
    totalPrompts: int = Field(..., description="Total prompts in system")
    activePrompts: int = Field(..., description="Prompts used in time range")
    totalExecutions: int = Field(..., description="Total executions")
    avgExecutionsPerPrompt: float = Field(..., description="Average executions per prompt")


class TopPromptItem(BaseModel):
    """Top prompt by usage"""
    promptId: str = Field(..., description="Prompt ID")
    promptName: str = Field(..., description="Prompt name")
    promptType: Optional[str] = Field(None, description="Prompt type/category")
    llm: Optional[str] = Field(None, description="LLM model")
    totalExecutions: int = Field(..., description="Total executions")
    totalTokens: int = Field(..., description="Total tokens used")
    totalCost: float = Field(..., description="Total cost")
    avgResponseTime: float = Field(..., description="Average response time")
    successRate: float = Field(..., description="Success rate percentage")


class PromptTypeDistribution(BaseModel):
    """Distribution by prompt type"""
    promptType: str = Field(..., description="Prompt type")
    count: int = Field(..., description="Number of prompts")
    totalExecutions: int = Field(..., description="Total executions")
    percentage: float = Field(..., description="Percentage of total")


class PromptAnalyticsDashboardData(BaseModel):
    """Complete prompt analytics dashboard data"""
    summary: PromptUsageSummary
    topPrompts: List[TopPromptItem] = Field(default_factory=list, description="Top prompts by usage")
    byType: List[PromptTypeDistribution] = Field(default_factory=list, description="Distribution by type")
    unusedPrompts: List[Dict[str, Any]] = Field(default_factory=list, description="Prompts with no recent usage")


# =============================================================================
# 3. Cost Analytics Dashboard
# =============================================================================

class CostSummary(BaseModel):
    """Summary of costs"""
    totalCost: float = Field(..., description="Total cost in time range")
    avgDailyCost: float = Field(..., description="Average daily cost")
    projectedMonthlyCost: float = Field(..., description="Projected monthly cost")
    costChange: float = Field(..., description="Cost change vs previous period (%)")


class CostByDayItem(BaseModel):
    """Cost breakdown by day"""
    recordDate: date = Field(..., description="Date")
    cost: float = Field(..., description="Total cost")
    calls: int = Field(..., description="Number of calls")
    tokens: int = Field(..., description="Total tokens")


class CostByUserItem(BaseModel):
    """Cost breakdown by user"""
    userId: str = Field(..., description="User ID")
    userName: Optional[str] = Field(None, description="User name")
    unitName: Optional[str] = Field(None, description="Unit name")
    cost: float = Field(..., description="Total cost")
    percentage: float = Field(..., description="Percentage of total")
    calls: int = Field(..., description="Number of calls")


class CostByPromptItem(BaseModel):
    """Cost breakdown by prompt"""
    promptId: str = Field(..., description="Prompt ID")
    promptName: str = Field(..., description="Prompt name")
    promptType: Optional[str] = Field(None, description="Prompt type")
    cost: float = Field(..., description="Total cost")
    percentage: float = Field(..., description="Percentage of total")
    calls: int = Field(..., description="Number of calls")


class CostAnalyticsDashboardData(BaseModel):
    """Complete cost analytics dashboard data"""
    summary: CostSummary
    byDay: List[CostByDayItem] = Field(default_factory=list, description="Daily cost breakdown")
    byModel: List[Dict[str, Any]] = Field(default_factory=list, description="Cost by LLM model")
    byUser: List[CostByUserItem] = Field(default_factory=list, description="Cost by user")
    byPrompt: List[CostByPromptItem] = Field(default_factory=list, description="Cost by prompt")


# =============================================================================
# 4. Performance Dashboard
# =============================================================================

class PerformanceSummary(BaseModel):
    """Summary of performance metrics"""
    avgResponseTime: float = Field(..., description="Average response time (seconds)")
    p50ResponseTime: float = Field(..., description="50th percentile response time")
    p95ResponseTime: float = Field(..., description="95th percentile response time")
    p99ResponseTime: float = Field(..., description="99th percentile response time")
    successRate: float = Field(..., description="Success rate percentage")
    errorRate: float = Field(..., description="Error rate percentage")


class ResponseTimeDistribution(BaseModel):
    """Response time distribution bucket"""
    range: str = Field(..., description="Time range (e.g., '0-1s', '1-2s')")
    count: int = Field(..., description="Number of calls in range")
    percentage: float = Field(..., description="Percentage of total")


class PerformanceByHour(BaseModel):
    """Performance metrics by hour of day"""
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    avgResponseTime: float = Field(..., description="Average response time")
    calls: int = Field(..., description="Number of calls")
    errorRate: float = Field(..., description="Error rate percentage")


class PerformanceDashboardData(BaseModel):
    """Complete performance dashboard data"""
    summary: PerformanceSummary
    responseTimeDistribution: List[ResponseTimeDistribution] = Field(default_factory=list)
    byHour: List[PerformanceByHour] = Field(default_factory=list, description="Performance by hour")
    byModel: List[Dict[str, Any]] = Field(default_factory=list, description="Performance by model")
    slowestCalls: List[Dict[str, Any]] = Field(default_factory=list, description="Slowest executions")


# =============================================================================
# 5. Unit/Department Dashboard
# =============================================================================

class UnitUsageSummary(BaseModel):
    """Summary of unit usage"""
    totalUnits: int = Field(..., description="Total units")
    activeUnits: int = Field(..., description="Units with activity in time range")
    totalCalls: int = Field(..., description="Total calls across all units")
    totalCost: float = Field(..., description="Total cost across all units")


class UnitUsageItem(BaseModel):
    """Usage statistics for a unit"""
    unitId: str = Field(..., description="Unit ID")
    unitName: str = Field(..., description="Unit name")
    districtName: Optional[str] = Field(None, description="District name")
    totalUsers: int = Field(..., description="Total users in unit")
    activeUsers: int = Field(..., description="Active users in time range")
    totalCalls: int = Field(..., description="Total prompt executions")
    totalTokens: int = Field(..., description="Total tokens used")
    totalCost: float = Field(..., description="Total cost")
    avgResponseTime: float = Field(..., description="Average response time")


class UnitDashboardData(BaseModel):
    """Complete unit dashboard data"""
    summary: UnitUsageSummary
    topUnits: List[UnitUsageItem] = Field(default_factory=list, description="Top units by usage")
    unitComparison: List[Dict[str, Any]] = Field(default_factory=list, description="Unit comparison data")


# =============================================================================
# 6. Overview Dashboard (Combined Summary)
# =============================================================================

class OverviewStats(BaseModel):
    """Quick overview statistics"""
    totalPromptExecutions: int = Field(..., description="Total prompt executions")
    totalTokensUsed: int = Field(..., description="Total tokens used")
    totalCost: float = Field(..., description="Total cost")
    activeUsers: int = Field(..., description="Active users")
    avgResponseTime: float = Field(..., description="Average response time")
    successRate: float = Field(..., description="Success rate percentage")


class OverviewChange(BaseModel):
    """Change vs previous period"""
    executions: float = Field(..., description="Executions change %")
    tokens: float = Field(..., description="Tokens change %")
    cost: float = Field(..., description="Cost change %")
    users: float = Field(..., description="Users change %")


class OverviewDashboardData(BaseModel):
    """Complete overview dashboard data"""
    currentPeriod: OverviewStats
    previousPeriod: OverviewStats
    change: OverviewChange
    topModel: Optional[str] = Field(None, description="Most used model")
    topPromptType: Optional[str] = Field(None, description="Most used prompt type")
    peakHour: Optional[int] = Field(None, description="Peak usage hour (0-23)")


# =============================================================================
# API Response Wrappers
# =============================================================================

class ErrorDetail(BaseModel):
    """Error detail for API responses"""
    errorCode: str = Field(..., description="Error code identifier")
    details: Optional[str] = Field(None, description="Error details")


class CountsDashboardResponse(BaseModel):
    """Response for counts dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("Counts retrieved successfully")
    data: CountsData
    errors: Optional[ErrorDetail] = None


class UserActivityDashboardResponse(BaseModel):
    """Response for user activity dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("User activity dashboard data retrieved successfully")
    data: UserActivityDashboardData
    errors: Optional[ErrorDetail] = None


class PromptAnalyticsDashboardResponse(BaseModel):
    """Response for prompt analytics dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("Prompt analytics dashboard data retrieved successfully")
    data: PromptAnalyticsDashboardData
    errors: Optional[ErrorDetail] = None


class CostAnalyticsDashboardResponse(BaseModel):
    """Response for cost analytics dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("Cost analytics dashboard data retrieved successfully")
    data: CostAnalyticsDashboardData
    errors: Optional[ErrorDetail] = None


class PerformanceDashboardResponse(BaseModel):
    """Response for performance dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("Performance dashboard data retrieved successfully")
    data: PerformanceDashboardData
    errors: Optional[ErrorDetail] = None


class UnitDashboardResponse(BaseModel):
    """Response for unit dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("Unit dashboard data retrieved successfully")
    data: UnitDashboardData
    errors: Optional[ErrorDetail] = None


class OverviewDashboardResponse(BaseModel):
    """Response for overview dashboard"""
    success: bool = Field(True)
    code: int = Field(200)
    message: str = Field("Overview dashboard data retrieved successfully")
    data: OverviewDashboardData
    errors: Optional[ErrorDetail] = None
